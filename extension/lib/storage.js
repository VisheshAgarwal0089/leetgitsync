import { emptyConfig, validateConfig } from './config.js';
import { validateRecord } from '../leetcode/record.js';
import { queueStates, repositoryKey, retainCompleted } from '../sync/queue.js';

export const STORAGE_SCHEMA_VERSION = 2;
export const STORAGE_LIMITS = Object.freeze({ captures: 50, diagnostics: 50, quarantine: 50, seenSubmissions: 1000 });
export const DIAGNOSTIC_STAGES = new Set([
  'CONTENT_SCRIPT_LOADED', 'PAGE_OBSERVER_READY', 'BRIDGE_CONNECTED', 'FETCH_INTERCEPTED', 'SUBMIT_CONTEXT_STORED',
  'RESULT_RESOURCE_DETECTED', 'FALLBACK_OBSERVER_READY', 'SUBMISSION_LOOKUP_STARTED', 'SUBMISSION_LOOKUP_PENDING',
  'SUBMISSION_LOOKUP_REJECTED', 'SUBMISSION_CODE_FETCHED', 'SUBMISSION_RESPONSE_DETECTED', 'STATUS_NORMALIZED',
  'METADATA_EXTRACTED', 'METADATA_FAILED', 'CAPTURE_MESSAGE_SENT', 'BACKGROUND_MESSAGE_RECEIVED', 'CAPTURE_PERSISTED',
  'QUEUE_JOB_CREATED', 'DIAGNOSTIC_ERROR',
]);
export const keys = {
  auth: 'githubsync-auth',
  flow: 'lgs-auth-flow-v1',
  config: 'lgs-config-v1',
  error: 'lgs-auth-error',
  captures: 'lgs-captures-v1',
  queue: 'lgs-sync-queue-v1',
  diagnostics: 'lgs-diagnostics-v1',
  schema: 'lgs-storage-schema-v2',
  quarantine: 'lgs-quarantine-v2',
  queueControl: 'lgs-queue-control-v2',
  validation: 'lgs-config-validation-v1',
  seen: 'lgs-seen-submissions-v1',
};

function iso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function quarantineEntry(kind, index, reason, at) {
  return { kind, index, reason, quarantinedAt: new Date(at).toISOString() };
}

function safeResult(value, target) {
  if (!value || !/^[a-f0-9]{40}$/i.test(value.commitSha) || typeof value.path !== 'string' || value.path.length > 500) return null;
  let commitUrl;
  try {
    commitUrl = new URL(value.commitUrl);
    if (commitUrl.origin !== 'https://github.com' || !commitUrl.pathname.startsWith(`/${target.owner}/${target.repository}/commit/`)) return null;
  } catch { return null; }
  return { commitSha: value.commitSha, commitUrl: commitUrl.href, path: value.path, action: ['add', 'update', 'unchanged'].includes(value.action) ? value.action : 'update' };
}

function safeLastError(value) {
  if (typeof value !== 'string') return null;
  const allowed = [
    'Processing was interrupted', 'GitHub rate limit reached', 'Repository changed', 'Connect GitHub',
    'GitHub authentication expired', 'Network connection unavailable', 'GitHub denied repository access',
    'Configured repository was not found', 'Configured branch was not found', 'Repository README markers',
    'Captured submission data is invalid', 'Synchronization failed', 'GitHub is temporarily unavailable',
  ];
  return allowed.some((prefix) => value.startsWith(prefix)) ? value.slice(0, 200) : 'Synchronization failed and needs attention.';
}

function safeAuthError(value) {
  if (typeof value !== 'string') return null;
  const allowed = [
    'Authorization expired', 'Authorization was denied', 'GitHub authorization failed',
    'GitHub rate limited authorization', 'GitHub authorization is temporarily unavailable', 'Network unavailable during authorization',
    'GitHub authentication expired',
  ];
  return allowed.some((prefix) => value.startsWith(prefix)) ? value.slice(0, 200) : null;
}

function normalizeFlow(value) {
  if (value == null) return null;
  const statuses = ['authorization_pending', 'slow_down', 'rate_limited', 'temporary_network_failure'];
  if (typeof value.device_code !== 'string' || !value.device_code || value.device_code.length > 300 ||
      typeof value.user_code !== 'string' || !/^[A-Z0-9-]{4,20}$/i.test(value.user_code) ||
      value.verification_uri !== 'https://github.com/login/device') return null;
  const expiresAt = Number(value.expiresAt);
  const nextPollAt = Number(value.nextPollAt);
  const interval = Number(value.interval);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(nextPollAt) || !Number.isFinite(interval) || interval < 5 || interval > 600) return null;
  return {
    device_code: value.device_code,
    user_code: value.user_code,
    verification_uri: value.verification_uri,
    expires_in: Number.isFinite(Number(value.expires_in)) ? Number(value.expires_in) : Math.max(0, Math.round((expiresAt - Date.now()) / 1000)),
    interval,
    expiresAt,
    nextPollAt,
    failures: Math.min(Math.max(Number(value.failures) || 0, 0), 10),
    lastStatus: statuses.includes(value.lastStatus) ? value.lastStatus : 'authorization_pending',
  };
}

function normalizeJob(value) {
  if (!value || typeof value !== 'object' || !queueStates.includes(value.status)) return null;
  let record;
  try { record = validateRecord(value.record); } catch { return null; }
  if (String(value.id) !== record.submissionId || String(value.submissionId) !== record.submissionId) return null;
  let target = null;
  if (value.target) {
    try { target = validateConfig(value.target); } catch { return null; }
  }
  const repository = typeof value.repository === 'string' ? value.repository : null;
  if (target && repository !== repositoryKey(target)) return null;
  if (!target && repository && !/^[^/@]+\/[^/@]+@.+$/.test(repository)) return null;
  const createdAt = iso(value.createdAt);
  const updatedAt = iso(value.updatedAt);
  if (!createdAt || !updatedAt) return null;
  const attempts = Number(value.attempts);
  if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts > 100) return null;
  const nextAttemptAt = value.nextAttemptAt == null ? null : Number(value.nextAttemptAt);
  if (nextAttemptAt !== null && (!Number.isFinite(nextAttemptAt) || nextAttemptAt < 0)) return null;
  const result = value.status === 'synced' ? safeResult(value.result, target) : null;
  if (value.status === 'synced' && (!target || !result)) return null;
  const lastError = value.lastError == null ? null : safeLastError(value.lastError);
  return {
    schemaVersion: 1,
    id: record.submissionId,
    submissionId: record.submissionId,
    repository,
    target,
    status: value.status,
    attempts,
    nextAttemptAt,
    createdAt,
    updatedAt,
    lastError,
    record,
    ...(result ? { result } : {}),
  };
}

function jobPriority(job) {
  if (job.status === 'failed') return 3;
  if (['queued', 'syncing', 'retrying'].includes(job.status)) return 2;
  return 1;
}

function normalizeQueue(value, quarantine, at) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    quarantine.push(quarantineEntry('queue', -1, 'not_array', at));
    return [];
  }
  const queue = [];
  const positions = new Map();
  value.forEach((candidate, index) => {
    const job = normalizeJob(candidate);
    if (!job) {
      quarantine.push(quarantineEntry('queue', index, 'invalid_record', at));
      return;
    }
    const duplicate = positions.get(job.submissionId);
    if (duplicate !== undefined) {
      quarantine.push(quarantineEntry('queue', index, 'duplicate_submission', at));
      if (jobPriority(job) > jobPriority(queue[duplicate])) queue[duplicate] = job;
      return;
    }
    positions.set(job.submissionId, queue.length);
    queue.push(job);
  });
  return retainCompleted(queue);
}

function normalizeCaptures(value, quarantine, at) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    quarantine.push(quarantineEntry('captures', -1, 'not_array', at));
    return [];
  }
  const captures = [];
  const seen = new Set();
  value.forEach((candidate, index) => {
    let record;
    try { record = validateRecord(candidate); } catch {
      quarantine.push(quarantineEntry('captures', index, 'invalid_record', at));
      return;
    }
    if (seen.has(record.submissionId)) {
      quarantine.push(quarantineEntry('captures', index, 'duplicate_submission', at));
      return;
    }
    seen.add(record.submissionId);
    captures.push(record);
  });
  return captures.sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt) || right.submissionId.localeCompare(left.submissionId)).slice(0, STORAGE_LIMITS.captures);
}

function normalizeDiagnostics(value, quarantine, at) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    quarantine.push(quarantineEntry('diagnostics', -1, 'not_array', at));
    return [];
  }
  return value.flatMap((item, index) => {
    if (!item || !DIAGNOSTIC_STAGES.has(item.stage) || !iso(item.at)) {
      quarantine.push(quarantineEntry('diagnostics', index, 'invalid_record', at));
      return [];
    }
    const output = { stage: item.stage.slice(0, 60), at: iso(item.at) };
    for (const field of ['slug', 'submissionId', 'status', 'errorCode']) if (typeof item[field] === 'string') output[field] = item[field].slice(0, 200);
    if (Array.isArray(item.missingFields)) output.missingFields = item.missingFields.filter((field) => typeof field === 'string').slice(0, 10);
    return [output];
  }).slice(0, STORAGE_LIMITS.diagnostics);
}

function validControl(value) {
  const reasons = ['offline', 'unauthenticated', 'authentication_expired', 'misconfigured', 'rate_limited', 'queue_full', 'migration_failed'];
  if (!value || !reasons.includes(value.reason)) return null;
  const until = value.until == null ? null : Number(value.until);
  return { reason: value.reason, until: Number.isFinite(until) && until > 0 ? until : null, updatedAt: iso(value.updatedAt) || new Date().toISOString() };
}

function validValidation(value) {
  return value && typeof value.key === 'string' && value.key.length <= 800 && Number.isFinite(Number(value.validatedAt))
    ? { key: value.key, validatedAt: Number(value.validatedAt) }
    : null;
}

export function createStorage(local, now = Date.now) {
  return {
    async get(key) { return (await local.get(key))[key]; },
    async set(key, value) { await local.set({ [key]: value }); },
    async setMany(values) { await local.set(values); },
    async remove(key) { await local.remove(key); },
    async initialize() {
      if (local.setAccessLevel) await local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      const names = [...Object.values(keys), 'gh_token', 'gh_user', 'githubsync-storage', 'githubsync-device-flow'];
      let values;
      try { values = await local.get(names); } catch { return { ok: false, version: 0 }; }
      const at = now();
      const quarantine = Array.isArray(values[keys.quarantine]) ? values[keys.quarantine].flatMap((item) => {
        if (!item || typeof item.kind !== 'string' || typeof item.reason !== 'string' || !iso(item.quarantinedAt)) return [];
        return [{ kind: item.kind.slice(0, 40), index: Number.isInteger(item.index) ? item.index : -1, reason: item.reason.slice(0, 60), quarantinedAt: iso(item.quarantinedAt) }];
      }).slice(0, STORAGE_LIMITS.quarantine) : [];
      try {
        let auth = values[keys.auth];
        if (!auth?.token && typeof values.gh_token === 'string' && values.gh_token && values.gh_user) auth = { token: values.gh_token, user: values.gh_user };
        if (auth && (typeof auth.token !== 'string' || !auth.token || !auth.user || typeof auth.user.login !== 'string')) {
          quarantine.push(quarantineEntry('auth', 0, 'invalid_record', at));
          auth = null;
        } else if (auth) auth = { token: auth.token, user: { id: auth.user.id, login: auth.user.login }, storedAt: Number(auth.storedAt) || at };
        let config = values[keys.config];
        if (!config) {
          try {
            const raw = values['githubsync-storage'];
            const old = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const settings = old?.state?.settings || old?.settings;
            if (settings) {
              const [owner = '', repository = ''] = (settings.defaultRepository || '').split('/');
              config = { ...emptyConfig, owner, repository, branch: settings.defaultBranch || '' };
            }
          } catch { quarantine.push(quarantineEntry('legacy_config', 0, 'invalid_record', at)); }
        }
        if (config) {
          try { config = validateConfig(config); } catch {
            quarantine.push(quarantineEntry('config', 0, 'invalid_record', at));
            config = { ...emptyConfig };
          }
        } else config = { ...emptyConfig };
        const queue = normalizeQueue(values[keys.queue], quarantine, at);
        const captures = normalizeCaptures(values[keys.captures], quarantine, at);
        const diagnostics = normalizeDiagnostics(values[keys.diagnostics], quarantine, at);
        const flow = normalizeFlow(values[keys.flow]);
        if (values[keys.flow] && !flow) quarantine.push(quarantineEntry('auth_flow', 0, 'invalid_record', at));
        const authError = safeAuthError(values[keys.error]);
        if (values[keys.error] && !authError) quarantine.push(quarantineEntry('auth_error', 0, 'invalid_record', at));
        const seen = [...new Set([
          ...(Array.isArray(values[keys.seen]) ? values[keys.seen].map(String).filter((id) => /^\d{1,30}$/.test(id)) : []),
          ...queue.map((job) => job.submissionId),
          ...captures.map((record) => record.submissionId),
        ])].slice(0, STORAGE_LIMITS.seenSubmissions);
        const control = validControl(values[keys.queueControl]);
        const validation = validValidation(values[keys.validation]);
        const updates = {
          [keys.schema]: { version: STORAGE_SCHEMA_VERSION, status: 'ok', migratedAt: at },
          [keys.config]: config,
          [keys.queue]: queue,
          [keys.captures]: captures,
          [keys.diagnostics]: diagnostics,
          [keys.seen]: seen,
          [keys.quarantine]: quarantine.slice(-STORAGE_LIMITS.quarantine),
        };
        if (auth) updates[keys.auth] = auth;
        if (flow) updates[keys.flow] = flow;
        if (authError) updates[keys.error] = authError;
        if (control) updates[keys.queueControl] = control;
        if (validation) updates[keys.validation] = validation;
        await local.set(updates);
        const remove = ['gh_token', 'gh_user', 'githubsync-device-flow'];
        if (!auth) remove.push(keys.auth);
        if (!flow) remove.push(keys.flow);
        if (!authError) remove.push(keys.error);
        if (!control) remove.push(keys.queueControl);
        if (!validation) remove.push(keys.validation);
        await local.remove(remove);
        return { ok: true, version: STORAGE_SCHEMA_VERSION, quarantined: quarantine.length };
      } catch {
        try {
          await local.set({ [keys.schema]: { version: STORAGE_SCHEMA_VERSION, status: 'failed', errorCode: 'MIGRATION_FAILED', failedAt: at } });
        } catch { /* Storage is unavailable; callers still receive a failed migration result. */ }
        return { ok: false, version: STORAGE_SCHEMA_VERSION };
      }
    },
    async disconnect() { await local.remove([keys.auth, keys.flow, keys.error, 'gh_token', 'gh_user', 'githubsync-device-flow']); },
  };
}
