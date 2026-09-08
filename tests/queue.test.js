import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindUnassignedJobs, calculateBackoff, classifySyncError, createQueueProcessor, enqueue, MAX_QUEUE_JOBS, queueSummary, recoverQueue, retryFailed,
} from '../extension/sync/queue.js';
import { createService } from '../extension/lib/service.js';
import { createStorage, keys } from '../extension/lib/storage.js';

const time = Date.parse('2026-09-07T00:00:00.000Z');
const record = (id, title = `Problem ${id}`) => ({
  schemaVersion: 1, platform: 'leetcode', submissionId: String(id), problemNumber: Number(id), problemTitle: title,
  problemSlug: `problem-${id}`, problemUrl: `https://leetcode.com/problems/problem-${id}/`, language: 'JavaScript',
  sourceCode: `const answer${id} = true;`, topics: [], companies: [],
  submittedAt: new Date(time).toISOString(), capturedAt: new Date(time + 1).toISOString(),
});
const config = { owner: 'owner', repository: 'repo', branch: 'main', directory: 'solutions' };

function serviceFixture(initial = {}, options = {}) {
  const data = structuredClone(initial);
  const alarms = new Map();
  const local = {
    async get(names) { return Object.fromEntries((Array.isArray(names) ? names : [names]).map((name) => [name, structuredClone(data[name])])); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(names) { for (const name of Array.isArray(names) ? names : [names]) delete data[name]; },
    async setAccessLevel() {},
  };
  const alarmApi = { async create(name, value) { alarms.set(name, value); }, async clear(name) { alarms.delete(name); } };
  return { data, alarms, service: createService({ store: createStorage(local), alarms: alarmApi, now: () => time, ...options }) };
}

test('new capture creates one durable queued job and duplicate capture creates none', async () => {
  const f = serviceFixture({ [keys.config]: config });
  const first = await f.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record(1) });
  const duplicate = await f.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record(1) });
  assert.equal(first.captured, true); assert.equal(duplicate.duplicate, true);
  assert.equal(f.data[keys.queue].length, 1);
  assert.equal(f.data[keys.queue][0].status, 'queued');
  assert.equal(f.data[keys.queue][0].repository, 'owner/repo@main');
  assert.deepEqual(f.data[keys.queue][0].target, config);
  assert.equal(f.alarms.has('sync-queue'), false);
  assert.equal(f.data[keys.queueControl].reason, 'unauthenticated');
});

test('unconfigured captures stay queued without scheduling a writer', async () => {
  const f = serviceFixture();
  await f.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record(1) });
  assert.equal(f.data[keys.queue][0].repository, null);
  assert.equal(f.data[keys.queue][0].status, 'queued');
  assert.equal(f.alarms.has('sync-queue'), false);
  await f.service.handle({ type: 'SAVE_CONFIG', data: config });
  assert.equal(f.data[keys.queue][0].repository, 'owner/repo@main');
  assert.ok(f.alarms.has('sync-queue'));
});

test('queue capacity never evicts an active synchronization job', () => {
  const queue = Array.from({ length: MAX_QUEUE_JOBS }, (_, index) => enqueue([], record(index + 1), config, time).queue[0]);
  assert.throws(() => enqueue(queue, record(999), config, time), (error) => error.code === 'QUEUE_FULL');
  const withTerminal = queue.map((job, index) => index === 0 ? { ...job, status: 'synced' } : job);
  const result = enqueue(withTerminal, record(999), config, time);
  assert.equal(result.queue.length, MAX_QUEUE_JOBS + 1); assert.equal(result.queue.at(-1).id, '999');
  assert.equal(bindUnassignedJobs([{ ...queue[0], repository: null }], config, time)[0].repository, 'owner/repo@main');
  const legacy = { ...queue[0] }; delete legacy.target;
  assert.deepEqual(bindUnassignedJobs([legacy], config, time)[0].target, config);
});

test('interrupted syncing jobs recover to queued after service restart', async () => {
  const job = enqueue([], record(1), config, time).queue[0];
  const recovered = recoverQueue([{ ...job, status: 'syncing' }], time + 1000);
  assert.equal(recovered[0].status, 'queued');
  assert.match(recovered[0].lastError, /interrupted/);
  const f = serviceFixture({ [keys.queue]: [{ ...job, status: 'syncing' }] });
  await f.service.resume();
  assert.equal(f.data[keys.queue][0].status, 'queued');
});

test('queue processor runs jobs sequentially and persists syncing before completion', async () => {
  let queue = enqueue(enqueue([], record(1), config, time).queue, record(2), config, time).queue;
  const events = [];
  const processor = createQueueProcessor({
    load: async () => queue,
    save: async (value) => { queue = structuredClone(value); events.push(queue.map((job) => job.status).join(',')); },
    execute: async (job) => { events.push(`execute:${job.id}`); return { commitSha: 'a'.repeat(40), commitUrl: `https://github.com/o/r/commit/${job.id}`, path: `solutions/${job.id}.js`, action: 'add' }; }, schedule: async () => {}, now: () => time,
  });
  await Promise.all([processor.run(), processor.run()]);
  assert.deepEqual(queue.map((job) => job.status), ['synced', 'synced']);
  assert.ok(events.indexOf('syncing,queued') < events.indexOf('execute:1'));
  assert.ok(events.indexOf('execute:1') < events.indexOf('execute:2'));
});

test('retryable failures use bounded jittered backoff and schedule an alarm', async () => {
  let queue = enqueue([], record(1), config, time).queue;
  let scheduled;
  const processor = createQueueProcessor({ load: async () => queue, save: async (value) => { queue = structuredClone(value); },
    execute: async () => { const error = new Error('private network details'); error.code = 'NETWORK_ERROR'; throw error; },
    schedule: async (when) => { scheduled = when; }, now: () => time, random: () => 0.5 });
  await processor.run();
  assert.equal(queue[0].status, 'retrying');
  assert.equal(queue[0].lastError, 'Network connection unavailable.');
  assert.equal(queue[0].nextAttemptAt, time + 30_000);
  assert.equal(scheduled, time + 30_000);
  assert.equal(calculateBackoff(99, () => 1), 3_600_000);
});

test('automatic retries stop after the sixth failed attempt', async () => {
  let queue = [{ ...enqueue([], record(1), config, time).queue[0], status: 'retrying', attempts: 5 }];
  const processor = createQueueProcessor({ load: async () => queue, save: async (value) => { queue = structuredClone(value); },
    execute: async () => { const error = new Error('offline details'); error.code = 'OFFLINE'; throw error; },
    schedule: async () => assert.fail('terminal job must not schedule another retry'), now: () => time });
  await processor.run();
  assert.equal(queue[0].attempts, 6); assert.equal(queue[0].status, 'failed'); assert.equal(queue[0].nextAttemptAt, null);
});

test('rate-limit retry time is respected and terminal errors fail without leaking details', async () => {
  assert.deepEqual(classifySyncError({ status: 429, retryAt: time + 90_000 }), { retryable: true, blocked: 'rate_limited', message: 'GitHub rate limit reached.', retryAt: time + 90_000 });
  assert.deepEqual(classifySyncError({ code: 'AUTH_EXPIRED', message: 'token-value' }), { retryable: true, blocked: 'authentication_expired', message: 'GitHub authentication expired. Reconnect to resume.' });
  assert.equal(classifySyncError({ code: 'RATE_LIMITED', status: 403 }).retryable, true);
  assert.equal(classifySyncError({ status: 409 }).retryable, true);
  let queue = enqueue([], record(1), config, time).queue;
  const processor = createQueueProcessor({ load: async () => queue, save: async (value) => { queue = structuredClone(value); },
    execute: async () => { const error = new Error('secret response'); error.status = 403; throw error; }, schedule: async () => {}, now: () => time });
  await processor.run();
  assert.equal(queue[0].status, 'failed');
  assert.equal(queue[0].lastError, 'GitHub denied repository access.');
  assert.ok(!JSON.stringify(queue).includes('secret response'));
});

test('manual retry resets only a failed job and queue summary omits source code', async () => {
  const failed = { ...enqueue([], record(1, 'Two Sum'), config, time).queue[0], status: 'failed', attempts: 3, lastError: 'Safe failure' };
  const result = retryFailed([failed], failed.id, time + 1000);
  assert.equal(result.changed, true); assert.equal(result.queue[0].status, 'queued'); assert.equal(result.queue[0].attempts, 0);
  const summary = queueSummary([failed]);
  assert.deepEqual(summary.latestFailed, { id: '1', problemTitle: 'Two Sum', error: 'Safe failure' });
  assert.ok(!JSON.stringify(summary).includes('const answer'));
  const f = serviceFixture({ [keys.queue]: [failed] });
  const state = await f.service.handle({ type: 'RETRY_SYNC_JOB', data: { jobId: '1' } });
  assert.equal(state.queue.queuedCount, 1); assert.equal(f.data[keys.queue][0].status, 'queued');
});
