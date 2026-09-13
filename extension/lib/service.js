import * as github from './github.js';
import { keys, STORAGE_LIMITS } from './storage.js';
import { emptyConfig, validateConfig } from './config.js';
import { PublicError, safeError } from './errors.js';
import { validateRecord } from '../leetcode/record.js';
import { appendDiagnostic } from './diagnostics.js';
import {
  bindUnassignedJobs, calculateBackoff, createQueueProcessor, enqueue, MAX_FAILED_JOBS,
  queueSummary, retryFailed, contestEnd,
} from '../sync/queue.js';

const alarmName = 'github-device-auth';
const syncAlarmName = 'sync-queue';
const activeStates = new Set(['queued', 'syncing', 'retrying', 'contest_hold']);

function sameConfig(left, right) {
  return ['owner', 'repository', 'branch', 'directory'].every((field) => (left?.[field] || '') === (right?.[field] || ''));
}

function validationKey(config, auth) {
  return JSON.stringify([config.owner, config.repository, config.branch, config.directory, auth.user?.id || null, auth.storedAt || null]);
}

export function createService({
  store, alarms, api = github, now = Date.now, random = Math.random, executeSync = null,
  isOnline = () => globalThis.navigator?.onLine !== false, diagnosticsEnabled = true,
}) {
  let initialized;
  let migration = null;
  let chain = Promise.resolve();
  const recordDiagnostic = diagnosticsEnabled ? (value) => appendDiagnostic(store, value, now) : async () => null;

  function serial(action) {
    const result = chain.then(async () => {
      initialized ??= store.initialize().then((value) => { migration = value; return value; }).catch(() => {
        migration = { ok: false, version: 0 };
        return migration;
      });
      await initialized;
      return action();
    });
    chain = result.catch(() => {});
    return result;
  }

  function ensureMigration() {
    if (migration?.ok === false) throw new PublicError('Stored data migration failed. Synchronization is paused; reload the extension and try again.', 'MIGRATION_FAILED');
  }

  async function scheduleAuth(flow) {
    await alarms.create(alarmName, { when: Math.max(flow.nextPollAt, now() + 1000), periodInMinutes: 0.5 });
  }

  async function finishAuth(error) {
    await store.remove(keys.flow);
    await alarms.clear(alarmName);
    if (error) await store.set(keys.error, error);
  }

  async function setQueueControl(reason, until = null) {
    await store.set(keys.queueControl, { reason, until: Number.isFinite(Number(until)) ? Number(until) : null, updatedAt: new Date(now()).toISOString() });
    if (reason === 'authentication_expired') {
      await store.remove(keys.auth);
      await store.set(keys.error, 'GitHub authentication expired. Reconnect to resume synchronization.');
    }
  }

  async function clearQueueControl() {
    await store.remove(keys.queueControl);
  }

  async function queueBlock(queue) {
    const schema = await store.get(keys.schema);
    if (migration?.ok === false || schema?.status === 'failed') return { reason: 'migration_failed' };
    if (!isOnline()) return { reason: 'offline' };
    const stored = await store.get(keys.queueControl);
    if (stored?.reason === 'rate_limited' && Number(stored.until) > now()) return { reason: 'rate_limited', until: Number(stored.until) };
    if (stored?.reason === 'offline' && Number(stored.until) > now()) return { reason: 'offline', until: Number(stored.until) };
    if (stored?.reason === 'authentication_expired' && !(await store.get(keys.auth))?.token) return { reason: 'authentication_expired' };
    const active = queue.filter((job) => activeStates.has(job.status));
    if (!active.length) return null;
    if (queue.filter((job) => job.status === 'failed').length >= MAX_FAILED_JOBS) return { reason: 'queue_full' };
    const auth = await store.get(keys.auth);
    if (!auth?.token) return { reason: stored?.reason === 'authentication_expired' ? 'authentication_expired' : 'unauthenticated' };
    if (active.some((job) => !job.repository || !job.target)) return { reason: 'misconfigured' };
    return null;
  }

  async function tick() {
    const flow = await store.get(keys.flow);
    if (!flow) return;
    if (now() >= flow.expiresAt) return finishAuth('Authorization expired. Please connect again.');
    if (now() < flow.nextPollAt) return;
    flow.nextPollAt = now() + flow.interval * 1000;
    await store.set(keys.flow, flow);
    await scheduleAuth(flow);
    try {
      const result = await api.pollForToken(flow.device_code);
      if (typeof result.access_token === 'string' && /^[A-Za-z0-9_.-]{8,512}$/.test(result.access_token)) {
        const user = await api.getAuthenticatedUser(result.access_token);
        await store.set(keys.auth, { token: result.access_token, user, storedAt: now() });
        await store.remove(keys.error);
        await finishAuth();
        const control = await store.get(keys.queueControl);
        if (['unauthenticated', 'authentication_expired'].includes(control?.reason)) await clearQueueControl();
        const queue = await store.get(keys.queue);
        if (Array.isArray(queue) && queue.some((job) => activeStates.has(job.status))) await alarms.create(syncAlarmName, { when: now() + 1000 });
      } else if (result.error === 'slow_down') {
        flow.interval = Math.max(flow.interval + 5, Number(result.interval) || 0);
        flow.nextPollAt = now() + flow.interval * 1000;
        flow.lastStatus = 'slow_down';
        await store.set(keys.flow, flow);
        await scheduleAuth(flow);
      } else if (result.error === 'access_denied') {
        await finishAuth('Authorization was denied. You can connect again.');
      } else if (result.error === 'expired_token') {
        await finishAuth('Authorization expired. Please connect again.');
      } else if (result.error === 'authorization_pending') {
        flow.lastStatus = 'authorization_pending';
        await store.set(keys.flow, flow);
      } else {
        await finishAuth('GitHub authorization failed. Please connect again.');
      }
    } catch (error) {
      if (error?.code === 'RATE_LIMITED' || error?.code === 'NETWORK_ERROR' || error?.name === 'TypeError') {
        flow.failures = Math.min((Number(flow.failures) || 0) + 1, 10);
        const retryAt = error?.code === 'RATE_LIMITED' && Number(error.retryAt) > now()
          ? Number(error.retryAt)
          : now() + calculateBackoff(flow.failures, random);
        flow.nextPollAt = retryAt;
        flow.lastStatus = error?.code === 'RATE_LIMITED' ? 'rate_limited' : 'temporary_network_failure';
        await store.set(keys.flow, flow);
        await store.set(keys.error, error?.code === 'RATE_LIMITED' ? 'GitHub rate limited authorization. Retrying automatically.' : 'Network unavailable during authorization. Retrying automatically.');
        await scheduleAuth(flow);
      } else {
        await finishAuth(safeError(error));
      }
    }
  }

  async function state() {
    const [auth, flow, storedQueue, storedCaptures, storedDiagnostics, control, schema, quarantine] = await Promise.all([
      store.get(keys.auth), store.get(keys.flow), store.get(keys.queue), store.get(keys.captures),
      store.get(keys.diagnostics), store.get(keys.queueControl), store.get(keys.schema), store.get(keys.quarantine),
    ]);
    const queue = Array.isArray(storedQueue) ? storedQueue : [];
    const captures = Array.isArray(storedCaptures) ? storedCaptures : [];
    let currentControl = control;
    if (!isOnline()) currentControl = { reason: 'offline' };
    else if (schema?.status === 'failed' || migration?.ok === false) currentControl = { reason: 'migration_failed' };
    else if (currentControl?.reason === 'rate_limited' && Number(currentControl.until) <= now()) currentControl = null;
    return {
      user: auth?.token ? { id: auth.user?.id, login: auth.user?.login } : null,
      flow: flow ? {
        user_code: flow.user_code,
        verification_uri: flow.verification_uri,
        expiresAt: flow.expiresAt,
        status: flow.lastStatus || 'authorization_pending',
        retryAt: flow.nextPollAt,
      } : null,
      error: await store.get(keys.error) || null,
      config: await store.get(keys.config) || { ...emptyConfig },
      queue: queueSummary(queue, currentControl),
      capture: { count: captures.length, limit: STORAGE_LIMITS.captures, last: captures[0] ? { submissionId: captures[0].submissionId, problemTitle: captures[0].problemTitle, capturedAt: captures[0].capturedAt } : null },
      diagnostics: diagnosticsEnabled && Array.isArray(storedDiagnostics) ? storedDiagnostics : [],
      storage: {
        schemaVersion: schema?.version || 0,
        migrationFailed: schema?.status === 'failed' || migration?.ok === false,
        quarantinedCount: Array.isArray(quarantine) ? quarantine.length : 0,
        diagnosticLimit: STORAGE_LIMITS.diagnostics,
      },
      online: isOnline(),
    };
  }

  const queueProcessor = createQueueProcessor({
    load: async () => {
      const value = await store.get(keys.queue);
      return Array.isArray(value) ? value : [];
    },
    save: (queue) => store.set(keys.queue, queue),
    execute: executeSync,
    schedule: (when) => alarms.create(syncAlarmName, { when }),
    getBlock: queueBlock,
    onBlocked: ({ reason, until }) => setQueueControl(reason, until),
    onResumed: clearQueueControl,
    now,
    random,
  });

  return {
    tick: () => serial(tick),
    resume: () => serial(async () => {
      if (migration?.ok === false) return;
      const flow = await store.get(keys.flow);
      if (flow) {
        await scheduleAuth(flow);
        await tick();
      }
      await queueProcessor.run();
    }),
    processQueue: () => serial(async () => {
      ensureMigration();
      return queueProcessor.run();
    }),
    handle: (message) => serial(async () => {
      if (message?.type === 'GET_STATE') {
        await tick();
        return state();
      }
      ensureMigration();
      switch (message?.type) {
        case 'START_AUTH': {
          if ((await store.get(keys.auth))?.token || await store.get(keys.flow)) return state();
          await store.remove(keys.error);
          try {
            const flow = await api.startDeviceFlow();
            const pending = { ...flow, expiresAt: now() + flow.expires_in * 1000, nextPollAt: now() + flow.interval * 1000, failures: 0, lastStatus: 'authorization_pending' };
            await store.set(keys.flow, pending);
            await scheduleAuth(pending);
          } catch (error) {
            const message = error?.code === 'RATE_LIMITED' ? 'GitHub rate limited authorization. Try again after the reset time.' : 'GitHub authorization is temporarily unavailable. Check your connection and try again.';
            await store.set(keys.error, message);
            throw new PublicError(message, error?.code);
          }
          return state();
        }
        case 'CANCEL_AUTH':
          await finishAuth();
          await store.remove(keys.error);
          return state();
        case 'DISCONNECT':
          await store.disconnect();
          await alarms.clear(alarmName);
          if ((await store.get(keys.queue))?.some((job) => activeStates.has(job.status))) await setQueueControl('unauthenticated');
          return state();
        case 'VERIFY_AUTH': {
          const auth = await store.get(keys.auth);
          if (!auth?.token) throw new PublicError('Connect GitHub first.');
          try {
            const user = await api.getAuthenticatedUser(auth.token);
            await store.set(keys.auth, { ...auth, user });
            return state();
          } catch (error) {
            if (error?.code === 'AUTH_EXPIRED') {
              await setQueueControl('authentication_expired');
              throw new PublicError('GitHub authentication expired. Reconnect to continue.');
            }
            throw error;
          }
        }
        case 'SAVE_CONFIG': {
          const input = message.data?.config || message.data;
          const confirmed = message.data?.confirmPending === true;
          const config = validateConfig(input);
          const current = await store.get(keys.config) || emptyConfig;
          const storedQueue = await store.get(keys.queue);
          const original = Array.isArray(storedQueue) ? storedQueue : [];
          const hasTargetedPending = original.some((job) => activeStates.has(job.status) && job.target);
          if (hasTargetedPending && !sameConfig(current, config) && !confirmed) {
            throw new PublicError('Pending submissions will keep their original repository and branch. Confirm the configuration change to continue.');
          }
          const queue = bindUnassignedJobs(original, config, now());
          await store.setMany({ [keys.config]: config, [keys.queue]: queue });
          if (!sameConfig(current, config)) await store.remove(keys.validation);
          const control = await store.get(keys.queueControl);
          if (control?.reason === 'misconfigured') await clearQueueControl();
          if (queue.some((job) => activeStates.has(job.status))) await alarms.create(syncAlarmName, { when: now() + 1000 });
          return state();
        }
        case 'VALIDATE_CONFIG': {
          const config = validateConfig(message.data);
          const auth = await store.get(keys.auth);
          if (!auth?.token) throw new PublicError('Connect GitHub before validating the repository.');
          const key = validationKey(config, auth);
          const cached = await store.get(keys.validation);
          if (cached?.key === key && now() - cached.validatedAt < 5 * 60_000) return { validatedAt: cached.validatedAt, cached: true };
          try {
            const result = await api.validateRepository(config, auth.token);
            await store.set(keys.validation, { key, validatedAt: result.validatedAt || now() });
            return { ...result, cached: false };
          } catch (error) {
            if (error?.code === 'RATE_LIMITED') await setQueueControl('rate_limited', error.retryAt);
            if (error?.code === 'AUTH_EXPIRED') await setQueueControl('authentication_expired');
            throw error;
          }
        }
        case 'LEETGITSYNC_DIAGNOSTIC':
          return { recorded: Boolean(await recordDiagnostic(message.data)) };
        case 'CAPTURE_LEETCODE_SUBMISSION': {
          await recordDiagnostic({ stage: 'BACKGROUND_MESSAGE_RECEIVED', submissionId: message.data?.submissionId, slug: message.data?.problemSlug });
          let record;
          try { record = validateRecord(message.data); } catch (error) {
            await recordDiagnostic({ stage: 'DIAGNOSTIC_ERROR', submissionId: message.data?.submissionId, slug: message.data?.problemSlug, errorCode: 'CAPTURE_RECORD_INVALID' });
            throw error;
          }
          const [storedHistory, storedQueue, storedSeen] = await Promise.all([
            store.get(keys.captures), store.get(keys.queue), store.get(keys.seen),
          ]);
          const history = Array.isArray(storedHistory) ? storedHistory : [];
          const queue = Array.isArray(storedQueue) ? storedQueue : [];
          const seen = Array.isArray(storedSeen) ? storedSeen : [];
          if (seen.includes(record.submissionId) || history.some((item) => item.submissionId === record.submissionId) || queue.some((job) => job.submissionId === record.submissionId)) {
            await recordDiagnostic({ stage: 'CAPTURE_PERSISTED', submissionId: record.submissionId, slug: record.problemSlug });
            return { captured: false, duplicate: true, count: history.length };
          }
          const next = [record, ...history].slice(0, STORAGE_LIMITS.captures);
          while (JSON.stringify(next).length > 4_000_000 && next.length > 1) next.pop();
          const config = await store.get(keys.config) || emptyConfig;
          let queued;
          try { queued = enqueue(queue, record, config, now()); } catch (error) {
            if (error?.code === 'QUEUE_FULL') {
              await setQueueControl('queue_full');
              throw new PublicError('Synchronization queue is full. Resolve pending or failed jobs before capturing more submissions.');
            }
            throw error;
          }
          await store.setMany({
            [keys.captures]: next,
            [keys.queue]: queued.queue,
            [keys.seen]: [record.submissionId, ...seen.filter((id) => id !== record.submissionId)].slice(0, STORAGE_LIMITS.seenSubmissions),
          });
          await recordDiagnostic({ stage: 'CAPTURE_PERSISTED', submissionId: record.submissionId, slug: record.problemSlug });
          if (queued.added) await recordDiagnostic({ stage: 'QUEUE_JOB_CREATED', submissionId: record.submissionId, slug: record.problemSlug });
          if (queued.added) {
            const block = await queueBlock(queued.queue);
            const heldEnd = queued.queue.filter((job) => job.status === 'contest_hold').map((job) => contestEnd(job.record)).filter((end) => Number.isFinite(end) && end > now()).sort((a, b) => a - b)[0];
            if (heldEnd) await alarms.create(syncAlarmName, { when: heldEnd });
            if (block) await setQueueControl(block.reason, block.until);
            else if (queued.queue.some((job) => ['queued', 'retrying'].includes(job.status))) await alarms.create(syncAlarmName, { when: now() + 1000 });
          }
          return { captured: true, duplicate: false, count: next.length };
        }
        case 'RETRY_SYNC_JOB': {
          const storedQueue = await store.get(keys.queue);
          const queue = Array.isArray(storedQueue) ? storedQueue : [];
          const result = retryFailed(queue, String(message.data?.jobId ?? ''), now());
          if (!result.changed) throw new PublicError('Failed synchronization job was not found.');
          await store.set(keys.queue, result.queue);
          const control = await store.get(keys.queueControl);
          if (control?.reason === 'queue_full') await clearQueueControl();
          await alarms.create(syncAlarmName, { when: now() + 1000 });
          return state();
        }
        default:
          throw new PublicError('Unsupported extension request.');
      }
    }),
  };
}
