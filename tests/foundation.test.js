import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../extension/lib/config.js';
import { createStorage, keys } from '../extension/lib/storage.js';
import { createService } from '../extension/lib/service.js';
import { safeError } from '../extension/lib/errors.js';
import { startDeviceFlow, pollForToken, getAuthenticatedUser, validateRepository } from '../extension/lib/github.js';

const config = { owner: 'test-owner', repository: 'test-repo', branch: 'feature/setup', directory: 'solutions' };
function fixture(initial = {}) {
  const data = structuredClone(initial);
  const local = {
    async get(names) { return Object.fromEntries((Array.isArray(names) ? names : [names]).map((name) => [name, structuredClone(data[name])])); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(names) { for (const name of Array.isArray(names) ? names : [names]) delete data[name]; },
    async setAccessLevel(value) { assert.equal(value.accessLevel, 'TRUSTED_CONTEXTS'); },
  };
  let time = 100000;
  const alarmData = new Map();
  const alarms = { async create(name, value) { alarmData.set(name, value); }, async clear(name) { alarmData.delete(name); } };
  const api = {
    async startDeviceFlow() { return { device_code: 'private-device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 }; },
    async pollForToken() { return { error: 'authorization_pending' }; },
    async getAuthenticatedUser() { return { id: 1, login: 'tester' }; },
    async validateRepository() { return { validatedAt: time }; },
  };
  const options = { store: createStorage(local), alarms, api, now: () => time };
  return { data, api, alarms: alarmData, options, service: createService(options), advance(ms) { time += ms; } };
}

test('repository configuration rejects traversal, invalid refs and URL injection', () => {
  assert.deepEqual(validateConfig({ ...config, owner: ' test-owner ' }), config);
  for (const directory of ['../secret', '/root', 'a//b', 'a/..', '.git', 'x\\y', 'a/%2e%2e', 'a/']) assert.throws(() => validateConfig({ ...config, directory }));
  for (const branch of ['', 'a..b', 'a.lock', 'a/.hidden', 'a@{b', 'x?y', '/main', 'a//b', 'a b', 'a\nb', 'a[0]', '@']) {
    assert.throws(() => validateConfig({ ...config, branch }), branch);
  }
  assert.throws(() => validateConfig({ ...config, owner: 'x/y' }));
  assert.throws(() => validateConfig({ ...config, repository: '..' }));
});
test('configuration persists through a new service instance without touching legacy history', async () => {
  const f = fixture({ unrelated: { history: [1] } });
  await f.service.handle({ type: 'SAVE_CONFIG', data: config });
  assert.deepEqual((await createService(f.options).handle({ type: 'GET_STATE' })).config, config);
  assert.deepEqual(f.data.unrelated, { history: [1] });
});
test('migration preserves working legacy authentication and repository settings', async () => {
  const f = fixture({ gh_token: 'fixture-token', gh_user: { id: 1, login: 'tester' }, 'githubsync-storage': JSON.stringify({ state: { settings: { defaultRepository: 'test-owner/test-repo', defaultBranch: 'feature/setup' }, syncRecords: [1] } }) });
  const state = await f.service.handle({ type: 'GET_STATE' });
  assert.deepEqual(state.config, config);
  assert.equal(state.user.login, 'tester');
  assert.equal(f.data[keys.auth].token, 'fixture-token');
  assert.equal(f.data.gh_token, undefined);
  assert.ok(f.data['githubsync-storage']);
  assert.ok(!JSON.stringify(state).includes('fixture-token'));
});
test('Device Flow survives service restart, obeys interval and never sends secrets to UI', async () => {
  const f = fixture();
  const state = await f.service.handle({ type: 'START_AUTH' });
  assert.equal(state.flow.user_code, 'ABCD-EFGH');
  assert.ok(!JSON.stringify(state).includes('private-device-code'));
  let polls = 0;
  f.api.pollForToken = async () => { polls++; return { access_token: 'fixture-token' }; };
  const restarted = createService(f.options);
  await restarted.resume();
  assert.equal(polls, 0);
  f.advance(5000);
  await restarted.tick();
  const connected = await restarted.handle({ type: 'GET_STATE' });
  assert.equal(connected.user.login, 'tester');
  assert.equal(connected.flow, null);
  assert.equal(f.alarms.size, 0);
  assert.ok(!JSON.stringify(connected).includes('fixture-token'));
});
test('slow_down adds at least five seconds and defers future polls', async () => {
  const f = fixture();
  f.api.pollForToken = async () => ({ error: 'slow_down', interval: 5 });
  await f.service.handle({ type: 'START_AUTH' });
  f.advance(5000); await f.service.tick();
  assert.equal(f.data[keys.flow].interval, 10);
  assert.equal(f.data[keys.flow].nextPollAt, 115000);
});
test('expired and denied authorizations clear persisted flow and alarms', async () => {
  for (const result of ['access_denied', 'expired_token']) {
    const f = fixture(); f.api.pollForToken = async () => ({ error: result });
    await f.service.handle({ type: 'START_AUTH' }); f.advance(5000); await f.service.tick();
    assert.equal(f.data[keys.flow], undefined); assert.equal(f.alarms.size, 0); assert.ok(f.data[keys.error]);
  }
  const f = fixture(); await f.service.handle({ type: 'START_AUTH' }); f.advance(901000); await f.service.tick();
  assert.match(f.data[keys.error], /expired/);
});
test('disconnect queued during token fetch wins and preserves repository configuration', async () => {
  const f = fixture({ [keys.config]: config });
  let resolvePoll;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  f.api.pollForToken = () => { entered(); return new Promise((resolve) => { resolvePoll = resolve; }); };
  await f.service.handle({ type: 'START_AUTH' }); f.advance(5000);
  const poll = f.service.tick(); await started;
  const logout = f.service.handle({ type: 'DISCONNECT' });
  resolvePoll({ access_token: 'fixture-token' }); await poll; await logout;
  assert.equal(f.data[keys.auth], undefined); assert.equal(f.data[keys.flow], undefined); assert.deepEqual(f.data[keys.config], config);
});
test('cancel clears pending state; unsupported sync messages are rejected', async () => {
  const f = fixture(); await f.service.handle({ type: 'START_AUTH' });
  await f.service.handle({ type: 'CANCEL_AUTH' });
  assert.equal(f.data[keys.flow], undefined); assert.equal(f.alarms.size, 0);
  await assert.rejects(f.service.handle({ type: 'LEETCODE_SYNC_REQUEST' }), /Unsupported/);
});
test('storage failures are reported rather than showing a false save success', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_STATE' });
  f.options.store.set = async () => { throw new Error('sensitive-storage-details'); };
  f.options.store.setMany = async () => { throw new Error('sensitive-storage-details'); };
  await assert.rejects(f.service.handle({ type: 'SAVE_CONFIG', data: config }));
  assert.ok(!safeError(new Error('fixture-token')).includes('fixture-token'));
});
test('GitHub Device Flow keeps the existing form-encoded protocol and narrow scope', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return Response.json(url.endsWith('device/code') ? { device_code: 'private', user_code: 'USER-CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 } : { error: 'authorization_pending' });
  });
  await startDeviceFlow(); await pollForToken('private');
  assert.equal(new URLSearchParams(calls[0].init.body).get('scope'), 'repo');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(new URLSearchParams(calls[1].init.body).get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
  assert.ok(!calls[0].init.body.includes('client_secret'));
});
test('GitHub errors never surface response bodies or untrusted authorization URLs', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'fixture-token' }, { status: 401 }));
  await assert.rejects(getAuthenticatedUser('fixture-token'), (error) => !safeError(error).includes('fixture-token') && /expired/.test(error.message));
  globalThis.fetch = async () => Response.json({ device_code: 'private', user_code: 'USER', verification_uri: 'https://evil.example', expires_in: 900 });
  await assert.rejects(startDeviceFlow(), /invalid authorization/);
});
test('repository validation only reads GitHub and encodes slash-containing branches', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init }); return Response.json({ permissions: { push: true }, size: 1 }); });
  await validateRepository(config, 'fixture-token');
  assert.ok(calls[1].url.endsWith('/branches/feature%2Fsetup'));
  assert.ok(calls.every(({ init }) => !init.method || init.method === 'GET'));
  globalThis.fetch = async () => Response.json({ permissions: { push: false } });
  await assert.rejects(validateRepository(config, 'fixture-token'), /write access/);
});
test('repository validation trusts the branch endpoint when GitHub rounds a small repository size to zero', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { calls.push(url); return Response.json({ permissions: { push: true }, size: 0 }); });
  await validateRepository(config, 'fixture-token');
  assert.equal(calls.length, 2);

  let request = 0;
  globalThis.fetch = async () => {
    request += 1;
    return request === 1
      ? Response.json({ permissions: { push: true }, size: 1 })
      : Response.json({ message: 'sensitive fixture response' }, { status: 404 });
  };
  await assert.rejects(validateRepository(config, 'fixture-token'), (error) => /Target branch was not found/.test(error.message) && /initial commit/.test(error.message) && !error.message.includes('sensitive'));
});
