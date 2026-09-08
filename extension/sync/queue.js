export const queueStates = ['queued', 'syncing', 'retrying', 'synced', 'failed'];
export const MAX_QUEUE_JOBS = 200;
export const MAX_ATTEMPTS = 6;
export const MAX_BACKOFF_MS = 60 * 60 * 1000;

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

export function enqueue(queue, record, config, now = Date.now()) {
  if (queue.some((job) => job.submissionId === record.submissionId)) return { queue, added: false };
  const next = [...queue];
  if (next.length >= MAX_QUEUE_JOBS) {
    const terminal = next.findIndex((job) => ['synced', 'failed'].includes(job.status));
    if (terminal < 0) {
      const error = new Error('Synchronization queue capacity reached.');
      error.code = 'QUEUE_FULL';
      throw error;
    }
    next.splice(terminal, 1);
  }
  next.push(createQueueJob(record, config, now));
  return { queue: next, added: true };
}

export function bindUnassignedJobs(queue, config, now = Date.now()) {
  const repository = repositoryKey(config);
  if (!repository) return queue;
  return queue.map((job) => (!job.repository || (!job.target && job.repository === repository)) && ['queued', 'retrying'].includes(job.status)
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
  if (code === 'RATE_LIMITED' || status === 429) return { retryable: true, message: 'GitHub rate limit reached.', retryAt: finiteTime(error?.retryAt) };
  if (code === 'CONFLICT' || status === 409) return { retryable: true, message: 'Repository changed; synchronization will retry safely.' };
  if (['AUTH_REQUIRED', 'AUTH_EXPIRED', 'FORBIDDEN', 'REPOSITORY_NOT_FOUND', 'BRANCH_NOT_FOUND', 'README_INVALID', 'INVALID_DATA'].includes(code) || [400, 401, 403, 404, 422].includes(status)) {
    return { retryable: false, message: publicError(code, status) };
  }
  if (code === 'OFFLINE' || code === 'NETWORK_ERROR' || error?.name === 'TypeError' || status >= 500) return { retryable: true, message: status >= 500 ? 'GitHub is temporarily unavailable.' : 'Network connection unavailable.' };
  return { retryable: false, message: 'Synchronization failed and needs attention.' };
}

function publicError(code, status) {
  if (code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED' || status === 401) return 'GitHub authentication is required.';
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

export function queueSummary(queue) {
  const active = queue.filter((job) => ['queued', 'syncing', 'retrying'].includes(job.status));
  const failed = [...queue].reverse().find((job) => job.status === 'failed');
  const synced = [...queue].reverse().find((job) => job.status === 'synced');
  return {
    activeCount: active.length,
    queuedCount: active.filter((job) => job.status === 'queued').length,
    retryingCount: active.filter((job) => job.status === 'retrying').length,
    latestFailed: failed ? { id: failed.id, problemTitle: failed.record.problemTitle, error: failed.lastError } : null,
    lastSynced: synced ? { id: synced.id, problemTitle: synced.record.problemTitle, syncedAt: synced.updatedAt, path: synced.result?.path || null, commitUrl: synced.result?.commitUrl || null } : null,
  };
}

export function createQueueProcessor({ load, save, execute, schedule, now = Date.now, random = Math.random }) {
  let processing;
  async function run() {
    if (processing) return processing;
    processing = (async () => {
      let queue = recoverQueue(await load(), now());
      await save(queue);
      if (!execute) return queue;
      while (true) {
        const time = now();
        const index = queue.findIndex((job) => ['queued', 'retrying'].includes(job.status) && job.nextAttemptAt <= time && job.repository);
        if (index < 0) break;
        const job = { ...queue[index], status: 'syncing', attempts: queue[index].attempts + 1, updatedAt: new Date(time).toISOString(), lastError: null };
        queue[index] = job; await save(queue);
        try {
          const result = await execute(job);
          if (!result?.commitSha || !result?.commitUrl || !result?.path) {
            const error = new Error('Synchronization result is incomplete.'); error.code = 'INVALID_DATA'; throw error;
          }
          queue[index] = { ...job, status: 'synced', nextAttemptAt: null, result, updatedAt: new Date(now()).toISOString() };
        } catch (error) {
          const result = classifySyncError(error);
          if (result.retryable && job.attempts < MAX_ATTEMPTS) {
            const nextAttemptAt = result.retryAt && result.retryAt > now() ? result.retryAt : now() + calculateBackoff(job.attempts, random);
            queue[index] = { ...job, status: 'retrying', nextAttemptAt, lastError: result.message, updatedAt: new Date(now()).toISOString() };
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
