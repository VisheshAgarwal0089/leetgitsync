import * as github from './github.js';
import { keys } from './storage.js';
import { emptyConfig, validateConfig } from './config.js';
import { PublicError, safeError } from './errors.js';
import { validateRecord } from '../leetcode/record.js';
import { appendDiagnostic } from './diagnostics.js';
import { bindUnassignedJobs, createQueueProcessor, enqueue, queueSummary, retryFailed } from '../sync/queue.js';

const alarmName = 'github-device-auth';
const syncAlarmName = 'sync-queue';
export function createService({ store, alarms, api = github, now = Date.now, random = Math.random, executeSync = null }) {
  let initialized;
  let chain = Promise.resolve();
  // Serialize state transitions so cancel/logout cannot race token persistence.
  function serial(action) {
    const result = chain.then(async () => {
      initialized ??= store.initialize().catch((error) => { initialized = undefined; throw error; });
      await initialized;
      return action();
    });
    chain = result.catch(() => {});
    return result;
  }
  async function schedule(flow) {
    await alarms.create(alarmName, { when: Math.max(flow.nextPollAt, now() + 1000), periodInMinutes: 0.5 });
  }
  async function finish(error) {
    await store.remove(keys.flow);
    await alarms.clear(alarmName);
    if (error) await store.set(keys.error, error);
  }
  async function tick() {
    const flow = await store.get(keys.flow);
    if (!flow) return;
    if (now() >= flow.expiresAt) return finish('Authorization expired. Please connect again.');
    if (now() < flow.nextPollAt) return;
    // Persist and schedule before fetch; a suspended worker resumes safely.
    flow.nextPollAt = now() + flow.interval * 1000;
    await store.set(keys.flow, flow);
    await schedule(flow);
    try {
      const result = await api.pollForToken(flow.device_code);
      if (typeof result.access_token === 'string' && result.access_token) {
        const user = await api.getAuthenticatedUser(result.access_token);
        await store.set(keys.auth, { token: result.access_token, user, storedAt: now() });
        await store.remove(keys.error);
        await finish();
      } else if (result.error === 'slow_down') {
        flow.interval = Math.max(flow.interval + 5, Number(result.interval) || 0);
        flow.nextPollAt = now() + flow.interval * 1000;
        await store.set(keys.flow, flow);
        await schedule(flow);
      } else if (result.error === 'access_denied') {
        await finish('Authorization was denied. You can connect again.');
      } else if (result.error === 'expired_token') {
        await finish('Authorization expired. Please connect again.');
      } else if (result.error !== 'authorization_pending') {
        await finish('GitHub authorization failed. Please connect again.');
      }
    } catch (error) {
      // Token exchange may have completed; restart explicitly instead of losing its result silently.
      await finish(safeError(error));
    }
  }
  async function state() {
    const auth = await store.get(keys.auth);
    const flow = await store.get(keys.flow);
    const storedQueue = await store.get(keys.queue);
    const storedCaptures = await store.get(keys.captures);
    const captures = Array.isArray(storedCaptures) ? storedCaptures : [];
    const storedDiagnostics = await store.get(keys.diagnostics);
    return {
      user: auth?.token ? { id: auth.user?.id, login: auth.user?.login } : null,
      flow: flow ? { user_code: flow.user_code, verification_uri: flow.verification_uri, expiresAt: flow.expiresAt } : null,
      error: await store.get(keys.error) || null,
      config: await store.get(keys.config) || { ...emptyConfig },
      queue: queueSummary(Array.isArray(storedQueue) ? storedQueue : []),
      capture: { count: captures.length, last: captures[0] ? { submissionId: captures[0].submissionId, problemTitle: captures[0].problemTitle, capturedAt: captures[0].capturedAt } : null },
      diagnostics: Array.isArray(storedDiagnostics) ? storedDiagnostics : [],
    };
  }
  const queueProcessor = createQueueProcessor({
    load: async () => { const value = await store.get(keys.queue); return Array.isArray(value) ? value : []; },
    save: (queue) => store.set(keys.queue, queue),
    execute: executeSync,
    schedule: (when) => alarms.create(syncAlarmName, { when }),
    now,
    random,
  });
  return {
    tick: () => serial(tick),
    resume: () => serial(async () => {
      const flow = await store.get(keys.flow);
      if (flow) { await schedule(flow); await tick(); }
      await queueProcessor.run();
    }),
    processQueue: () => serial(() => queueProcessor.run()),
    handle: (message) => serial(async () => {
      switch (message?.type) {
        case 'GET_STATE': await tick(); return state();
        case 'START_AUTH': {
          if (await store.get(keys.flow)) return state();
          await store.remove(keys.error);
          const flow = await api.startDeviceFlow();
          const pending = { ...flow, expiresAt: now() + flow.expires_in * 1000, nextPollAt: now() + flow.interval * 1000 };
          await store.set(keys.flow, pending);
          await schedule(pending);
          return state();
        }
        case 'CANCEL_AUTH': await finish(); await store.remove(keys.error); return state();
        case 'DISCONNECT': await store.disconnect(); await alarms.clear(alarmName); return state();
        case 'VERIFY_AUTH': {
          const auth = await store.get(keys.auth);
          if (!auth?.token) throw new PublicError('Connect GitHub first.');
          const user = await api.getAuthenticatedUser(auth.token);
          await store.set(keys.auth, { ...auth, user });
          return state();
        }
        case 'SAVE_CONFIG': {
          const config = validateConfig(message.data);
          const storedQueue = await store.get(keys.queue);
          const queue = bindUnassignedJobs(Array.isArray(storedQueue) ? storedQueue : [], config, now());
          await store.setMany({ [keys.config]: config, [keys.queue]: queue });
          if (queue.some((job) => ['queued', 'retrying'].includes(job.status))) await alarms.create(syncAlarmName, { when: now() + 1000 });
          return state();
        }
        case 'VALIDATE_CONFIG': {
          const config = validateConfig(message.data);
          const auth = await store.get(keys.auth);
          if (!auth?.token) throw new PublicError('Connect GitHub before validating the repository.');
          return api.validateRepository(config, auth.token);
        }
        case 'LEETGITSYNC_DIAGNOSTIC': {
          return { recorded: Boolean(await appendDiagnostic(store, message.data, now)) };
        }
        case 'CAPTURE_LEETCODE_SUBMISSION': {
          await appendDiagnostic(store, { stage: 'BACKGROUND_MESSAGE_RECEIVED', submissionId: message.data?.submissionId, slug: message.data?.problemSlug }, now);
          let record;
          try { record = validateRecord(message.data); }
          catch (error) {
            await appendDiagnostic(store, { stage: 'DIAGNOSTIC_ERROR', submissionId: message.data?.submissionId, slug: message.data?.problemSlug, errorCode: 'CAPTURE_RECORD_INVALID' }, now);
            throw error;
          }
          const storedHistory = await store.get(keys.captures);
          const history = Array.isArray(storedHistory) ? storedHistory : [];
          if (history.some((item) => item.submissionId === record.submissionId)) {
            await appendDiagnostic(store, { stage: 'CAPTURE_PERSISTED', submissionId: record.submissionId, slug: record.problemSlug }, now);
            return { captured: false, duplicate: true, count: history.length };
          }
          const next = [record, ...history].slice(0, 50);
          while (JSON.stringify(next).length > 4_000_000 && next.length > 1) next.pop();
          const config = await store.get(keys.config) || emptyConfig;
          const storedQueue = await store.get(keys.queue);
          const queued = enqueue(Array.isArray(storedQueue) ? storedQueue : [], record, config, now());
          await store.setMany({ [keys.captures]: next, [keys.queue]: queued.queue });
          await appendDiagnostic(store, { stage: 'CAPTURE_PERSISTED', submissionId: record.submissionId, slug: record.problemSlug }, now);
          if (queued.added) await appendDiagnostic(store, { stage: 'QUEUE_JOB_CREATED', submissionId: record.submissionId, slug: record.problemSlug }, now);
          if (queued.added && queued.queue.at(-1)?.repository) await alarms.create(syncAlarmName, { when: now() + 1000 });
          return { captured: true, duplicate: false, count: next.length };
        }
        case 'RETRY_SYNC_JOB': {
          const storedQueue = await store.get(keys.queue);
          const queue = Array.isArray(storedQueue) ? storedQueue : [];
          const result = retryFailed(queue, String(message.data?.jobId ?? ''), now());
          if (!result.changed) throw new PublicError('Failed synchronization job was not found.');
          await store.set(keys.queue, result.queue);
          await alarms.create(syncAlarmName, { when: now() + 1000 });
          return state();
        }
        default: throw new PublicError('Unsupported extension request.');
      }
    }),
  };
}
