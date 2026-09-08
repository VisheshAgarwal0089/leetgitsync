export const queueStates = ['queued', 'syncing', 'retrying', 'synced', 'failed'];
export const MAX_QUEUED_JOBS = 100;
export const MAX_FAILED_JOBS = 50;
export const MAX_COMPLETED_JOBS = 100;
export const MAX_QUEUE_JOBS = MAX_QUEUED_JOBS;
export const MAX_ATTEMPTS = 6;
export const MAX_BACKOFF_MS = 60 * 60 * 1000;

const activeStates = new Set(['queued', 'syncing', 'retrying']);

export function repositoryKey(config) {
  if (!config?.owner || !config?.repository || !config?.branch) return null;
  return `${config.owner}/${config.repository}@${config.branch}`;
}

function repositoryTarget(config) {
  return repositoryKey(config) ? {
    owner: config.owner, repository: config.repository, branch: config.branch, directory: config.directory,
  } : null;
}

export function createQueueJob(record, config, now = Date.now()) {
  return {
    schemaVersion: 1,
    id: record.submissionId,
    submissionId: record.submissionId,
    repository: repositoryKey(config),
    target: repositoryTarget(config),
    status: 'queued',
    attempts: 0,
    nextAttemptAt: now,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    lastError: null,
    record,
  };
}

function completedOrder(left, right) {
  const time = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  return time || String(right.id).localeCompare(String(left.id));
}

export function retainCompleted(queue, limit = MAX_COMPLETED_JOBS) {
  const keep = new Set(queue.filter((job) => job.status === 'synced').sort(completedOrder).slice(0, limit));
  return queue.filter((job) => job.status !== 'synced' || keep.has(job));
}

export function enqueue(queue, record, config, now = Date.now()) {
  if (queue.some((job) => job.submissionId === record.submissionId)) return { queue, added: false };
  const next = retainCompleted([...queue]);
  if (next.filter((job) => activeStates.has(job.status)).length >= MAX_QUEUED_JOBS) {
    const error = new Error('Synchronization queue capacity reached.');
    error.code = 'QUEUE_FULL';
    throw error;
  }
  next.push(createQueueJob(record, config, now));
  return { queue: next, added: true };
}

export function bindUnassignedJobs(queue, config, now = Date.now()) {
  const repository = repositoryKey(config);
  if (!repository) return queue;
  return queue.map((job) => (!job.repository || (!job.target && job.repository === repository)) && activeStates.has(job.status)
    ? { ...job, repository, target: repositoryTarget(config), updatedAt: new Date(now).toISOString() }
    : job);
}

export function recoverQueue(queue, now = Date.now()) {
  return queue.map((job) => job.status === 'syncing' ? {
    ...job, status: 'queued', nextAttemptAt: now, updatedAt: new Date(now).toISOString(),
    lastError: 'Processing was interrupted and will resume.',
  } : job);
}

export function classifySyncError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const status = Number(error?.status);
  if (code === 'RATE_LIMITED' || status === 429) return { retryable: true, blocked: 'rate_limited', message: 'GitHub rate limit reached.', retryAt: finiteTime(error?.retryAt) };
  if (code === 'AUTH_REQUIRED') return { retryable: true, blocked: 'unauthenticated', message: 'Connect GitHub to resume synchronization.' };
  if (code === 'AUTH_EXPIRED' || status === 401) return { retryable: true, blocked: 'authentication_expired', message: 'GitHub authentication expired. Reconnect to resume.' };
  if (code === 'OFFLINE' || code === 'NETWORK_ERROR' || error?.name === 'TypeError') return { retryable: true, blocked: 'offline', message: 'Network connection unavailable.' };
  if (code === 'CONFLICT' || status === 409) return { retryable: true, message: 'Repository changed; synchronization will retry safely.' };
  if (['FORBIDDEN', 'REPOSITORY_NOT_FOUND', 'BRANCH_NOT_FOUND', 'README_INVALID', 'INVALID_DATA'].includes(code) || [400, 403, 404, 422].includes(status)) {
    return { retryable: false, message: publicError(code, status) };
  }
  if (status >= 500) return { retryable: true, message: 'GitHub is temporarily unavailable.' };
  return { retryable: false, message: 'Synchronization failed and needs attention.' };
}

function publicError(code, status) {
  if (code === 'FORBIDDEN' || status === 403) return 'GitHub denied repository access.';
  if (code === 'REPOSITORY_NOT_FOUND' || status === 404) return 'Configured repository was not found.';
  if (code === 'BRANCH_NOT_FOUND') return 'Configured branch was not found.';
  if (code === 'README_INVALID') return 'Repository README markers or managed content are invalid.';
  return 'Captured submission data is invalid.';
}

function finiteTime(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function calculateBackoff(attempt, random = Math.random) {
  const exponent = Math.min(Math.max(attempt - 1, 0), 10);
  const base = Math.min(30_000 * (2 ** exponent), MAX_BACKOFF_MS);
  return Math.min(Math.round(base * (0.8 + Math.max(0, Math.min(1, random())) * 0.4)), MAX_BACKOFF_MS);
}

export function retryFailed(queue, jobId, now = Date.now()) {
  let changed = false;
  const next = queue.map((job) => {
    if (job.id !== jobId || job.status !== 'failed') return job;
    changed = true;
    return { ...job, status: 'queued', attempts: 0, nextAttemptAt: now, lastError: null, updatedAt: new Date(now).toISOString() };
  });
  return { queue: next, changed };
}

export function queueSummary(queue, control = null) {
  const active = queue.filter((job) => activeStates.has(job.status));
  const failedJobs = queue.filter((job) => job.status === 'failed');
  const completed = queue.filter((job) => job.status === 'synced');
  const failed = [...failedJobs].sort(completedOrder)[0];
  const synced = [...completed].sort(completedOrder)[0];
  return {
    activeCount: active.length,
    queuedCount: active.filter((job) => job.status === 'queued').length,
    syncingCount: active.filter((job) => job.status === 'syncing').length,
    retryingCount: active.filter((job) => job.status === 'retrying').length,
    failedCount: failedJobs.length,
    completedCount: completed.length,
    queueFull: active.length >= MAX_QUEUED_JOBS || failedJobs.length >= MAX_FAILED_JOBS,
    limits: { queued: MAX_QUEUED_JOBS, failed: MAX_FAILED_JOBS, completed: MAX_COMPLETED_JOBS },
    paused: control?.reason ? { reason: control.reason, until: finiteTime(control.until) } : null,
    latestFailed: failed ? { id: failed.id, problemTitle: failed.record.problemTitle, error: failed.lastError } : null,
    lastSynced: synced ? { id: synced.id, problemTitle: synced.record.problemTitle, syncedAt: synced.updatedAt, path: synced.result?.path || null, commitUrl: synced.result?.commitUrl || null } : null,
  };
}

export function createQueueProcessor({
  load, save, execute, schedule, getBlock = async () => null, onBlocked = async () => {}, onResumed = async () => {},
  now = Date.now, random = Math.random,
}) {
  let processing;
  async function run() {
    if (processing) return processing;
    processing = (async () => {
      let queue = retainCompleted(recoverQueue(await load(), now()));
      await save(queue);
      if (!execute) return queue;
      while (true) {
        const time = now();
        let block = await getBlock(queue);
        if (!block && queue.filter((job) => job.status === 'failed').length >= MAX_FAILED_JOBS) block = { reason: 'queue_full' };
        if (block) {
          await onBlocked(block);
          if (finiteTime(block.until) > time) await schedule(block.until);
          else if (block.reason === 'offline') await schedule(time + 30_000);
          break;
        }
        await onResumed();
        const index = queue.findIndex((job) => ['queued', 'retrying'].includes(job.status) && job.nextAttemptAt <= time && job.repository);
        if (index < 0) break;
        const job = { ...queue[index], status: 'syncing', attempts: queue[index].attempts + 1, updatedAt: new Date(time).toISOString(), lastError: null };
        queue[index] = job;
        await save(queue);
        try {
          const result = await execute(job);
          if (!result?.commitSha || !result?.commitUrl || !result?.path) {
            const error = new Error('Synchronization result is incomplete.');
            error.code = 'INVALID_DATA';
            throw error;
          }
          queue[index] = { ...job, status: 'synced', nextAttemptAt: null, result, updatedAt: new Date(now()).toISOString() };
          queue = retainCompleted(queue);
        } catch (error) {
          const result = classifySyncError(error);
          const retryAt = result.retryAt && result.retryAt > now() ? result.retryAt : now() + calculateBackoff(job.attempts, random);
          if (result.retryable && job.attempts < MAX_ATTEMPTS) {
            queue[index] = { ...job, status: 'retrying', nextAttemptAt: retryAt, lastError: result.message, updatedAt: new Date(now()).toISOString() };
            if (result.blocked) await onBlocked({ reason: result.blocked, until: ['rate_limited', 'offline'].includes(result.blocked) ? retryAt : null });
          } else {
            queue[index] = { ...job, status: 'failed', nextAttemptAt: null, lastError: result.message, updatedAt: new Date(now()).toISOString() };
          }
        }
        await save(queue);
      }
      const nextTime = queue.filter((job) => job.status === 'retrying').map((job) => job.nextAttemptAt).filter(Number.isFinite).sort((a, b) => a - b)[0];
      if (nextTime) await schedule(nextTime);
      return queue;
    })();
    try { return await processing; } finally { processing = null; }
  }
  return { run };
}
