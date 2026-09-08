import test from 'node:test';
import assert from 'node:assert/strict';
import { githubRateLimitReset } from '../extension/lib/github.js';
import { createService } from '../extension/lib/service.js';
import { createStorage, keys, STORAGE_LIMITS, STORAGE_SCHEMA_VERSION } from '../extension/lib/storage.js';
import {
  createQueueProcessor, enqueue, MAX_COMPLETED_JOBS, MAX_FAILED_JOBS, MAX_QUEUED_JOBS,
  retainCompleted,
} from '../extension/sync/queue.js';
import { retryAt, SyncError } from '../extension/sync/github-writer.js';

const start = Date.parse('2026-09-08T00:00:00.000Z');
const config = { owner: 'owner', repository: 'repo', branch: 'main', directory: 'solutions' };
const alternate = { owner: 'owner', repository: 'another-repo', branch: 'production', directory: 'accepted' };
const sha = 'a'.repeat(40);

function record(id) {
  return {
    schemaVersion: 1,
    platform: 'leetcode',
    submissionId: String(id),
    problemNumber: Number(id),
    problemTitle: `Problem ${id}`,
    problemSlug: `problem-${id}`,
    problemUrl: `https://leetcode.com/problems/problem-${id}/`,
    language: 'JavaScript',
    sourceCode: `const solution${id} = true;\n`,
    topics: [],
    companies: [],
    submittedAt: new Date(start).toISOString(),
    capturedAt: new Date(start + Number(id)).toISOString(),
  };
}

function job(id, target = config) {
  return enqueue([], record(id), target, start).queue[0];
}

function syncedJob(id, updatedAt = start + Number(id)) {
  return {
    ...job(id),
    status: 'synced',
    nextAttemptAt: null,
    updatedAt: new Date(updatedAt).toISOString(),
    result: {
      commitSha: sha,
      commitUrl: `https://github.com/owner/repo/commit/${sha}`,
      path: `solutions/${id}.js`,
      action: 'add',
    },
  };
}

function fixture(initial = {}, options = {}) {
  const data = structuredClone(initial);
  const alarms = new Map();
  let clock = start;
  let online = options.online ?? true;
  const local = {
    async get(names) {
      return Object.fromEntries((Array.isArray(names) ? names : [names]).map((name) => [name, structuredClone(data[name])]));
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(names) { for (const name of Array.isArray(names) ? names : [names]) delete data[name]; },
    async setAccessLevel() {},
  };
  const alarmApi = {
    async create(name, value) { alarms.set(name, value); },
    async clear(name) { alarms.delete(name); },
  };
  const api = {
    async startDeviceFlow() {
      return { device_code: 'private-device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 };
    },
    async pollForToken() { return { error: 'authorization_pending' }; },
    async getAuthenticatedUser() { return { id: 1, login: 'tester' }; },
    async validateRepository() { return { validatedAt: clock }; },
    ...options.api,
  };
  const serviceOptions = {
    store: createStorage(local, () => clock),
    alarms: alarmApi,
    api,
    now: () => clock,
    random: () => 0.5,
    executeSync: options.executeSync || null,
    isOnline: () => online,
  };
  return {
    data,
    alarms,
    api,
    service: createService(serviceOptions),
    restart() { this.service = createService(serviceOptions); return this.service; },
    advance(ms) { clock += ms; },
    setOnline(value) { online = value; },
  };
}

test('separate queue limits retain every active and failed job', () => {
  const active = Array.from({ length: MAX_QUEUED_JOBS }, (_, index) => job(index + 1));
  assert.throws(() => enqueue(active, record(999), config, start), (error) => error.code === 'QUEUE_FULL');
  assert.equal(active.length, MAX_QUEUED_JOBS);

  const failed = Array.from({ length: MAX_FAILED_JOBS }, (_, index) => ({ ...job(index + 1), status: 'failed', nextAttemptAt: null }));
  const pending = job(999);
  let queue = [...failed, pending];
  let writes = 0;
  const processor = createQueueProcessor({
    load: async () => queue,
    save: async (value) => { queue = structuredClone(value); },
    execute: async () => { writes += 1; },
    schedule: async () => {},
    now: () => start,
  });
  return processor.run().then(() => {
    assert.equal(writes, 0);
    assert.equal(queue.filter((item) => item.status === 'failed').length, MAX_FAILED_JOBS);
    assert.equal(queue.some((item) => item.id === '999'), true);
  });
});

test('successful retention deterministically keeps the newest completed jobs', () => {
  const completed = Array.from({ length: MAX_COMPLETED_JOBS + 5 }, (_, index) => syncedJob(index + 1, start + index));
  const retained = retainCompleted([job(999), ...completed]);
  assert.equal(retained.filter((item) => item.status === 'synced').length, MAX_COMPLETED_JOBS);
  assert.equal(retained.some((item) => item.id === '1'), false);
  assert.equal(retained.some((item) => item.id === String(MAX_COMPLETED_JOBS + 5)), true);
  assert.equal(retained.some((item) => item.id === '999'), true);
});

test('persisted submission index prevents duplicate jobs after restart and history cleanup', async () => {
  const f = fixture({ [keys.config]: config, [keys.seen]: ['42'], [keys.captures]: [], [keys.queue]: [] });
  const result = await f.restart().handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record(42) });
  assert.equal(result.duplicate, true);
  assert.equal(f.data[keys.queue].length, 0);
});

test('offline queue pauses without consuming an attempt and resumes automatically', async () => {
  let writes = 0;
  const f = fixture({
    [keys.auth]: { token: 'fixture-token', user: { id: 1, login: 'tester' } },
    [keys.config]: config,
    [keys.queue]: [job(1)],
  }, {
    online: false,
    executeSync: async () => {
      writes += 1;
      return { commitSha: sha, commitUrl: `https://github.com/owner/repo/commit/${sha}`, path: 'solutions/1.js' };
    },
  });
  await f.service.resume();
  assert.equal(writes, 0);
  assert.equal(f.data[keys.queue][0].attempts, 0);
  assert.equal((await f.service.handle({ type: 'GET_STATE' })).queue.paused.reason, 'offline');
  f.setOnline(true);
  await f.service.processQueue();
  assert.equal(writes, 1);
  assert.equal(f.data[keys.queue][0].status, 'synced');
  assert.equal(f.data[keys.queueControl], undefined);
});

test('GitHub rate limits persist reset time and resume after reset', async () => {
  const reset = start + 120_000;
  let calls = 0;
  const f = fixture({
    [keys.auth]: { token: 'fixture-token', user: { id: 1, login: 'tester' } },
    [keys.config]: config,
    [keys.queue]: [job(1)],
  }, {
    executeSync: async () => {
      calls += 1;
      if (calls === 1) throw new SyncError('RATE_LIMITED', 403, reset);
      return { commitSha: sha, commitUrl: `https://github.com/owner/repo/commit/${sha}`, path: 'solutions/1.js' };
    },
  });
  await f.service.processQueue();
  assert.equal(f.data[keys.queueControl].reason, 'rate_limited');
  assert.equal(f.data[keys.queueControl].until, reset);
  assert.equal(f.data[keys.queue][0].status, 'retrying');
  await f.service.processQueue();
  assert.equal(calls, 1);
  f.advance(120_000);
  await f.service.processQueue();
  assert.equal(calls, 2);
  assert.equal(f.data[keys.queue][0].status, 'synced');
});

test('rate-limit headers support reset epoch and Retry-After', () => {
  const epoch = new Response(null, { status: 429, headers: { 'x-ratelimit-reset': '2000000000' } });
  const seconds = new Response(null, { status: 429, headers: { 'retry-after': '90' } });
  assert.equal(githubRateLimitReset(epoch, start), 2_000_000_000_000);
  assert.equal(githubRateLimitReset(seconds, start), start + 90_000);
  assert.equal(retryAt(seconds, start), start + 90_000);
});

test('Device Flow network and rate-limit failures keep the flow resumable', async () => {
  for (const [code, retryAtValue, expected] of [
    ['NETWORK_ERROR', null, 'temporary_network_failure'],
    ['RATE_LIMITED', start + 60_000, 'rate_limited'],
  ]) {
    const f = fixture({}, {
      api: {
        async pollForToken() {
          const error = new Error('private API response');
          error.code = code;
          error.retryAt = retryAtValue;
          throw error;
        },
      },
    });
    await f.service.handle({ type: 'START_AUTH' });
    f.advance(5000);
    await f.service.tick();
    assert.equal(f.data[keys.flow].lastStatus, expected);
    assert.equal(typeof f.data[keys.flow].device_code, 'string');
    assert.ok(f.alarms.has('github-device-auth'));
    assert.ok(!JSON.stringify(await f.service.handle({ type: 'GET_STATE' })).includes('private-device-code'));
    assert.ok(!JSON.stringify(f.data[keys.error]).includes('private API response'));
  }
});

test('concurrent Connect clicks start exactly one Device Flow', async () => {
  let starts = 0;
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const f = fixture({}, {
    api: {
      async startDeviceFlow() {
        starts += 1;
        await waiting;
        return { device_code: 'private-device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 };
      },
    },
  });
  const first = f.service.handle({ type: 'START_AUTH' });
  const second = f.service.handle({ type: 'START_AUTH' });
  release();
  await Promise.all([first, second]);
  assert.equal(starts, 1);
});

test('storage migration preserves valid data and quarantines corrupt records safely', async () => {
  const validQueue = { ...job(1), status: 'failed', nextAttemptAt: null, lastError: 'GitHub denied repository access.' };
  const f = fixture({
    [keys.auth]: { token: 'fixture-token', user: { id: 1, login: 'tester' } },
    [keys.config]: config,
    [keys.queue]: [validQueue, syncedJob(2), job(3), { record: { sourceCode: 'private malformed source' }, token: 'private-token' }],
    [keys.captures]: [record(1), { sourceCode: 'private malformed capture' }],
    [keys.diagnostics]: [{ stage: 'CONTENT_SCRIPT_LOADED', at: new Date(start).toISOString() }, { stage: 'PRIVATE_RESPONSE', at: new Date(start).toISOString(), token: 'private-token' }],
  });
  const state = await f.service.handle({ type: 'GET_STATE' });
  assert.equal(state.storage.schemaVersion, STORAGE_SCHEMA_VERSION);
  assert.equal(f.data[keys.auth].token, 'fixture-token');
  assert.deepEqual(f.data[keys.config], config);
  assert.equal(f.data[keys.queue][0].status, 'failed');
  assert.deepEqual(f.data[keys.queue].map((item) => item.status), ['failed', 'synced', 'queued']);
  assert.equal(f.data[keys.captures][0].submissionId, '1');
  assert.ok(f.data[keys.quarantine].length >= 3);
  assert.ok(!JSON.stringify(f.data[keys.quarantine]).includes('private'));
  assert.equal(state.storage.quarantinedCount, f.data[keys.quarantine].length);
});

test('migration failure pauses safely instead of processing stored jobs', async () => {
  const data = { [keys.queue]: [job(1)] };
  let writes = 0;
  const local = {
    async get(names) { return Object.fromEntries((Array.isArray(names) ? names : [names]).map((name) => [name, structuredClone(data[name])])); },
    async set() { throw new Error('storage unavailable'); },
    async remove() {},
    async setAccessLevel() {},
  };
  const store = createStorage(local, () => start);
  const service = createService({
    store,
    alarms: { async create() {}, async clear() {} },
    executeSync: async () => { writes += 1; },
    now: () => start,
  });
  const state = await service.handle({ type: 'GET_STATE' });
  assert.equal(state.storage.migrationFailed, true);
  assert.equal(state.queue.paused.reason, 'migration_failed');
  assert.equal(writes, 0);
  await assert.rejects(service.handle({ type: 'SAVE_CONFIG', data: config }), /migration failed/i);
});

test('pending destination changes require confirmation and never retarget old jobs', async () => {
  const original = job(1);
  const f = fixture({ [keys.config]: config, [keys.queue]: [original] });
  await assert.rejects(f.service.handle({ type: 'SAVE_CONFIG', data: alternate }), /Pending submissions/);
  assert.deepEqual(f.data[keys.queue][0].target, config);
  await f.service.handle({ type: 'SAVE_CONFIG', data: { config: alternate, confirmPending: true } });
  assert.deepEqual(f.data[keys.config], alternate);
  assert.deepEqual(f.data[keys.queue][0].target, config);
  assert.equal(f.data[keys.queue][0].repository, 'owner/repo@main');
});

test('unchanged repository validation uses a persisted cache', async () => {
  let validations = 0;
  const f = fixture({
    [keys.auth]: { token: 'fixture-token', user: { id: 1, login: 'tester' } },
    [keys.config]: config,
  }, {
    api: { async validateRepository() { validations += 1; return { validatedAt: start }; } },
  });
  assert.equal((await f.service.handle({ type: 'VALIDATE_CONFIG', data: config })).cached, false);
  assert.equal((await f.restart().handle({ type: 'VALIDATE_CONFIG', data: config })).cached, true);
  assert.equal(validations, 1);
});

test('one processor never overlaps GitHub writes for the same target', async () => {
  let queue = [job(1), job(2)];
  let active = 0;
  let maximum = 0;
  const processor = createQueueProcessor({
    load: async () => queue,
    save: async (value) => { queue = structuredClone(value); },
    execute: async (item) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return { commitSha: sha, commitUrl: `https://github.com/owner/repo/commit/${sha}`, path: `solutions/${item.id}.js` };
    },
    schedule: async () => {},
    now: () => start,
  });
  await Promise.all([processor.run(), processor.run(), processor.run()]);
  assert.equal(maximum, 1);
  assert.deepEqual(queue.map((item) => item.status), ['synced', 'synced']);
});

test('configured limits are explicit and diagnostics remain bounded', () => {
  assert.deepEqual(STORAGE_LIMITS, { captures: 50, diagnostics: 50, quarantine: 50, seenSubmissions: 1000 });
  assert.equal(MAX_QUEUED_JOBS, 100);
  assert.equal(MAX_FAILED_JOBS, 50);
  assert.equal(MAX_COMPLETED_JOBS, 100);
});
