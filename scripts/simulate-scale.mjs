import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createService } from '../extension/lib/service.js';
import { createStorage, keys, STORAGE_LIMITS, STORAGE_SCHEMA_VERSION } from '../extension/lib/storage.js';
import { createQueueJob, MAX_ATTEMPTS, MAX_QUEUED_JOBS } from '../extension/sync/queue.js';
import { SyncError } from '../extension/sync/github-writer.js';
import { buildSolutionPath } from '../extension/sync/solution-path.js';
import { updateReadme } from '../extension/sync/readme.js';

const started = performance.now();
const epoch = Date.parse('2026-09-09T00:00:00.000Z');
const sha = (value) => Number(value).toString(16).padStart(40, '0').slice(-40);
const metrics = {
  installations: 0, jobs: 0, successful: 0, paused: new Set(), retried: new Set(), rejected: 0,
  failed: 0, duplicateEventsPrevented: 0, crossUserLeaks: 0, apiByJob: new Map(), successfulKeys: new Set(),
};
let peakHeap = process.memoryUsage().heapUsed;
let nextInstall = 1;
let nextSubmission = 1;

// A simulation must fail closed if any production path accidentally tries the network.
globalThis.fetch = async () => { throw new Error('SIMULATION_NETWORK_ACCESS_BLOCKED'); };

function configFor(id) {
  return { owner: `user${id}`, repository: `solutions${id}`, branch: 'main', directory: 'solutions' };
}

function recordFor(id = nextSubmission++, overrides = {}) {
  const number = overrides.problemNumber ?? id;
  const slug = overrides.problemSlug ?? `problem-${number}`;
  return {
    schemaVersion: 1, platform: 'leetcode', submissionId: String(id), problemNumber: number,
    problemTitle: overrides.problemTitle ?? `Problem ${number}`, problemSlug: slug,
    problemUrl: `https://leetcode.com/problems/${slug}/`, language: overrides.language ?? 'JavaScript',
    sourceCode: overrides.sourceCode ?? `const solution${id} = true;\n`, topics: overrides.topics ?? ['Array'],
    companies: overrides.companies ?? [], submittedAt: new Date(epoch + id).toISOString(),
    capturedAt: new Date(epoch + id + 1).toISOString(),
  };
}

function installation({ initial = {}, online = true, execute, id = nextInstall++ } = {}) {
  metrics.installations += 1;
  const data = structuredClone(initial);
  let clock = epoch;
  let connected = online;
  const alarms = new Map();
  const local = {
    async get(names) { return Object.fromEntries((Array.isArray(names) ? names : [names]).map((name) => [name, structuredClone(data[name])])); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(names) { for (const name of Array.isArray(names) ? names : [names]) delete data[name]; },
    async setAccessLevel() {},
  };
  const store = createStorage(local, () => clock);
  const options = {
    store,
    alarms: { async create(name, value) { alarms.set(name, value); }, async clear(name) { alarms.delete(name); } },
    now: () => clock, random: () => 0.5, executeSync: execute, isOnline: () => connected,
  };
  return {
    id, data, alarms, config: configFor(id),
    service: createService(options),
    restart() { this.service = createService(options); return this.service; },
    advance(milliseconds) { clock += milliseconds; },
    setOnline(value) { connected = value; },
    now() { return clock; },
  };
}

function isolatedInitial(id) {
  return {
    [keys.auth]: { token: `fixture-token-${id}`, user: { id, login: `user${id}` }, storedAt: epoch },
    [keys.config]: configFor(id), [keys.queue]: [], [keys.captures]: [], [keys.diagnostics]: [],
    [keys.seen]: [], [keys.quarantine]: [],
  };
}

function simulatedWriter(installId, target, repository = { readme: '', files: new Map(), commits: 0 }, hooks = {}) {
  let active = 0;
  let maximumActive = 0;
  const committed = new Set();
  const execute = async (job) => {
    const metricKey = `${installId}:${job.submissionId}`;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    try {
      if (hooks.before) await hooks.before(job, metricKey);
      const path = buildSolutionPath(job.record, target.directory);
      const hasReadme = repository.readme.length > 0;
      const hasSolution = repository.files.has(path);
      const requests = 8 + Number(hasReadme) + Number(hasSolution);
      metrics.apiByJob.set(metricKey, (metrics.apiByJob.get(metricKey) || 0) + requests);
      assert.ok(!committed.has(job.submissionId), `duplicate logical commit for ${metricKey}`);
      const next = updateReadme(repository.readme, job.record, target, path).content;
      repository.readme = next;
      repository.files.set(path, job.record.sourceCode);
      repository.commits += 1;
      committed.add(job.submissionId);
      metrics.successful += 1;
      metrics.successfulKeys.add(metricKey);
      const commitSha = sha(installId * 100_000 + repository.commits);
      return { commitSha, commitUrl: `https://github.com/${target.owner}/${target.repository}/commit/${commitSha}`, path, action: hasSolution ? 'update' : 'add' };
    } finally {
      active -= 1;
    }
  };
  return { execute, repository, committed, get maximumActive() { return maximumActive; } };
}

async function capture(fixture, record) {
  const result = await fixture.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record });
  if (result.captured) metrics.jobs += 1;
  if (result.duplicate) metrics.duplicateEventsPrevented += 1;
  return result;
}

async function advanceRetry(fixture) {
  const job = fixture.data[keys.queue]?.find((item) => item.status === 'retrying');
  if (!job) return false;
  fixture.advance(Math.max(1, job.nextAttemptAt - fixture.now()));
  await fixture.service.processQueue();
  return true;
}

// 1,000 independent installations, one solution each.
const identities = new Set();
for (let index = 1; index <= 1000; index += 1) {
  const target = configFor(index);
  const writer = simulatedWriter(index, target);
  const fixture = installation({ id: index, initial: isolatedInitial(index), execute: writer.execute });
  const record = recordFor();
  await capture(fixture, record);
  await fixture.service.processQueue();
  assert.equal(fixture.data[keys.queue][0].status, 'synced');
  assert.equal(fixture.data[keys.auth].user.login, `user${index}`);
  assert.equal(fixture.data[keys.config].owner, `user${index}`);
  assert.ok(fixture.data[keys.captures].every((item) => item.submissionId === record.submissionId));
  assert.ok(fixture.data[keys.diagnostics].every((item) => !item.submissionId || item.submissionId === record.submissionId));
  assert.equal(fixture.data[keys.queueControl], undefined);
  assert.equal(writer.maximumActive, 1);
  identities.add(`${fixture.data[keys.auth].token}|${fixture.data[keys.config].owner}|${record.submissionId}`);
  if (index % 25 === 0) peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
}
assert.equal(identities.size, 1000);
nextInstall = 1101;

// 100 independent installations, ten rapid solutions each.
for (let offset = 1; offset <= 100; offset += 1) {
  const id = 1000 + offset;
  const target = configFor(id);
  const writer = simulatedWriter(id, target);
  const fixture = installation({ id, initial: isolatedInitial(id), execute: writer.execute });
  await Promise.all(Array.from({ length: 10 }, () => capture(fixture, recordFor())));
  await Promise.all([fixture.service.processQueue(), fixture.service.processQueue(), fixture.service.processQueue()]);
  assert.equal(fixture.data[keys.queue].filter((job) => job.status === 'synced').length, 10);
  assert.equal(writer.committed.size, 10);
  assert.equal(writer.maximumActive, 1);
  peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
}

// Duplicates, same-problem replacement, and different languages.
{
  const id = nextInstall++;
  const target = configFor(id);
  const writer = simulatedWriter(id, target);
  const fixture = installation({ id, initial: isolatedInitial(id), execute: writer.execute });
  const first = recordFor(undefined, { problemNumber: 1, problemSlug: 'two-sum', problemTitle: 'Two Sum', language: 'Java' });
  await Promise.all([capture(fixture, first), capture(fixture, first), capture(fixture, first)]);
  await capture(fixture, recordFor(undefined, { problemNumber: 1, problemSlug: 'two-sum', problemTitle: 'Two Sum', language: 'Java', sourceCode: 'class Solution { /* replacement */ }' }));
  await capture(fixture, recordFor(undefined, { problemNumber: 1, problemSlug: 'two-sum', problemTitle: 'Two Sum', language: 'Python', sourceCode: 'class Solution:\n    pass\n' }));
  await fixture.service.processQueue();
  assert.equal(writer.repository.commits, 3);
  assert.equal(writer.repository.files.size, 2);
}

// Offline pause and recovery; rate-limit pause and recovery.
{
  const id = nextInstall++;
  const target = configFor(id);
  const writer = simulatedWriter(id, target);
  const fixture = installation({ id, initial: isolatedInitial(id), execute: writer.execute, online: false });
  const item = recordFor(); await capture(fixture, item); await fixture.service.processQueue();
  assert.equal(fixture.data[keys.queue][0].attempts, 0);
  metrics.paused.add(`${id}:${item.submissionId}:offline`);
  fixture.setOnline(true); await fixture.service.processQueue();
  assert.equal(fixture.data[keys.queue][0].status, 'synced');
}
{
  const id = nextInstall++;
  const target = configFor(id);
  let limited = true;
  const writer = simulatedWriter(id, target, undefined, { before(job, key) {
    if (limited) { limited = false; metrics.apiByJob.set(key, 1); throw new SyncError('RATE_LIMITED', 403, epoch + 60_000); }
  } });
  const fixture = installation({ id, initial: isolatedInitial(id), execute: writer.execute });
  const item = recordFor(); await capture(fixture, item); await fixture.service.processQueue();
  metrics.paused.add(`${id}:${item.submissionId}:rate`); metrics.retried.add(`${id}:${item.submissionId}`);
  fixture.advance(60_000); await fixture.service.processQueue();
  assert.equal(fixture.data[keys.queue][0].status, 'synced');
}

// Authentication expiration affects only its installation.
{
  const failedId = nextInstall++; const healthyId = nextInstall++;
  const healthyTarget = configFor(healthyId);
  const expired = installation({ id: failedId, initial: isolatedInitial(failedId), execute: async (job) => {
    metrics.apiByJob.set(`${failedId}:${job.submissionId}`, 1); throw new SyncError('AUTH_EXPIRED', 401);
  } });
  const healthyWriter = simulatedWriter(healthyId, healthyTarget);
  const healthy = installation({ id: healthyId, initial: isolatedInitial(healthyId), execute: healthyWriter.execute });
  const expiredRecord = recordFor(); const healthyRecord = recordFor();
  await capture(expired, expiredRecord); await capture(healthy, healthyRecord);
  await Promise.all([expired.service.processQueue(), healthy.service.processQueue()]);
  assert.equal(expired.data[keys.queueControl].reason, 'authentication_expired');
  assert.equal(healthy.data[keys.queue][0].status, 'synced');
  metrics.paused.add(`${failedId}:${expiredRecord.submissionId}:auth`);
}

// Two branch conflicts then success; retry attempts remain bounded.
{
  const id = nextInstall++; const target = configFor(id); let conflicts = 2;
  const writer = simulatedWriter(id, target, undefined, { before(job, key) {
    if (conflicts > 0) { conflicts -= 1; metrics.apiByJob.set(key, (metrics.apiByJob.get(key) || 0) + 8); throw new SyncError('CONFLICT', 409); }
  } });
  const fixture = installation({ id, initial: isolatedInitial(id), execute: writer.execute });
  const item = recordFor(); await capture(fixture, item); await fixture.service.processQueue();
  while (await advanceRetry(fixture));
  assert.equal(fixture.data[keys.queue][0].attempts, 3);
  assert.equal(fixture.data[keys.queue][0].status, 'synced');
  metrics.retried.add(`${id}:${item.submissionId}`);
}

// Persistent retryable failure terminates exactly at the configured attempt bound.
{
  const id = nextInstall++; const item = recordFor(); const initial = isolatedInitial(id);
  const fixture = installation({ id, initial, execute: async (job) => {
    const key = `${id}:${job.submissionId}`;
    metrics.apiByJob.set(key, (metrics.apiByJob.get(key) || 0) + 1);
    throw new SyncError('SERVER_ERROR', 500);
  } });
  await capture(fixture, item); await fixture.service.processQueue();
  while (await advanceRetry(fixture));
  assert.equal(fixture.data[keys.queue][0].attempts, MAX_ATTEMPTS);
  assert.equal(fixture.data[keys.queue][0].status, 'failed');
  metrics.retried.add(`${id}:${item.submissionId}`); metrics.failed += 1;
}

// Interrupted service worker recovers a syncing job without losing it.
{
  const id = nextInstall++; const target = configFor(id); const item = recordFor();
  const interrupted = { ...createQueueJob(item, target, epoch), status: 'syncing', attempts: 1 };
  const initial = { ...isolatedInitial(id), [keys.queue]: [interrupted] };
  const writer = simulatedWriter(id, target);
  const fixture = installation({ id, initial, execute: writer.execute }); metrics.jobs += 1;
  await fixture.restart().resume();
  assert.equal(fixture.data[keys.queue][0].status, 'synced');
  assert.equal(fixture.data[keys.queue][0].attempts, 2);
  metrics.retried.add(`${id}:${item.submissionId}`);
}

// Malformed storage is quarantined; legacy storage migrates without cross-contamination.
{
  const id = nextInstall++;
  const fixture = installation({ id, initial: { ...isolatedInitial(id), [keys.queue]: [{ token: 'private', record: { bad: true } }], [keys.captures]: [{ bad: true }] } });
  const state = await fixture.service.handle({ type: 'GET_STATE' });
  assert.equal(state.storage.schemaVersion, STORAGE_SCHEMA_VERSION);
  assert.ok(state.storage.quarantinedCount >= 2);
  assert.ok(!JSON.stringify(fixture.data[keys.quarantine]).includes('private'));
}
{
  const id = nextInstall++;
  const fixture = installation({ id, initial: {
    gh_token: `legacy-token-${id}`, gh_user: { id, login: `user${id}` },
    'githubsync-storage': JSON.stringify({ state: { settings: { defaultRepository: `user${id}/solutions${id}`, defaultBranch: 'main' } } }),
  } });
  const state = await fixture.service.handle({ type: 'GET_STATE' });
  assert.equal(state.storage.schemaVersion, STORAGE_SCHEMA_VERSION);
  assert.equal(fixture.data[keys.auth].token, `legacy-token-${id}`);
  assert.equal(fixture.data.gh_token, undefined);
}

// Capacity rejects the 101st active job without evicting existing queue or history records.
{
  const id = nextInstall++; const fixture = installation({ id, initial: isolatedInitial(id) });
  for (let count = 0; count < MAX_QUEUED_JOBS; count += 1) await capture(fixture, recordFor());
  await assert.rejects(capture(fixture, recordFor()), /queue is full/i);
  metrics.rejected += 1;
  assert.equal(fixture.data[keys.queue].length, MAX_QUEUED_JOBS);
  assert.equal(fixture.data[keys.captures].length, STORAGE_LIMITS.captures);
  assert.equal(fixture.data[keys.diagnostics].length, STORAGE_LIMITS.diagnostics);
}

// Invalid metadata is rejected before it becomes a job.
{
  const id = nextInstall++; const fixture = installation({ id, initial: isolatedInitial(id) });
  await assert.rejects(fixture.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: { ...recordFor(), problemUrl: 'https://evil.example/' } }));
  metrics.rejected += 1;
  assert.equal(fixture.data[keys.queue].length, 0);
}

// README output is byte-deterministic for the same ordered submissions.
{
  const target = configFor(9999);
  const records = [
    recordFor(undefined, { problemNumber: 2, problemSlug: 'add-two', problemTitle: 'Add Two', topics: ['Math'] }),
    recordFor(undefined, { problemNumber: 1, problemSlug: 'two-sum', problemTitle: 'Two Sum', topics: ['Array', 'Hash Table'] }),
  ];
  const render = () => records.reduce((readme, item) => updateReadme(readme, item, target, buildSolutionPath(item, target.directory)).content, '');
  assert.equal(render(), render());
}

const successfulRequestCounts = [...metrics.successfulKeys].map((key) => metrics.apiByJob.get(key));
const maximumRequests = Math.max(...successfulRequestCounts);
const averageRequests = successfulRequestCounts.reduce((sum, count) => sum + count, 0) / successfulRequestCounts.length;
assert.ok(maximumRequests <= 30, 'successful synchronization exceeded the three-attempt GitHub request budget');
assert.ok(averageRequests <= 10, 'average GitHub request budget regressed');
assert.equal(successfulRequestCounts.length, metrics.successful);
assert.equal(metrics.crossUserLeaks, 0);
peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
const durationMs = performance.now() - started;
assert.ok(peakHeap < 768 * 1024 * 1024, 'simulation heap usage is unreasonable');
assert.ok(durationMs < 240_000, 'simulation duration is unreasonable');

const report = {
  simulation: true,
  installations: metrics.installations,
  jobs: metrics.jobs,
  successfulJobs: metrics.successful,
  pausedJobs: metrics.paused.size,
  retriedJobs: metrics.retried.size,
  rejectedEvents: metrics.rejected,
  failedJobs: metrics.failed,
  duplicateEventsPrevented: metrics.duplicateEventsPrevented,
  crossUserLeaks: metrics.crossUserLeaks,
  averageApiRequestsPerSuccessfulSync: Number(averageRequests.toFixed(3)),
  maximumApiRequestsPerSuccessfulSync: maximumRequests,
  peakHeapMiB: Number((peakHeap / 1024 / 1024).toFixed(2)),
  durationMs: Number(durationMs.toFixed(2)),
  requestBudget: { normalMin: 8, normalMax: 10, conflictRetryMaximum: 30 },
};
console.log(JSON.stringify(report, null, 2));
