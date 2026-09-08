import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Execute the actual production background bundle with WebExtension API doubles.
// This verifies wiring, not a real browser installation or live OAuth approval.
for (const target of ['brave', 'chrome', 'edge', 'firefox']) {
  const mainBundle = await readFile(`.output/${target}-mv3/content-scripts/leetcode-main.js`, 'utf8');
  const isolatedBundle = await readFile(`.output/${target}-mv3/content-scripts/leetcode.js`, 'utf8');
  assert.ok(mainBundle.includes('v2\\/'));
  assert.match(mainBundle, /BRIDGE_CONNECTED/);
  assert.match(isolatedBundle, /PerformanceObserver/);
  assert.match(isolatedBundle, /questionSubmissionList/);
  assert.match(isolatedBundle, /submissionDetails/);
  assert.match(isolatedBundle, /SUBMISSION_CODE_FETCHED/);
  const data = {};
  let listener;
  const event = () => ({ addListener() {} });
  const scheme = target === 'firefox' ? 'moz-extension' : 'chrome-extension';
  const root = `${scheme}://test-extension/`;
  const api = {
    runtime: { id: 'test-extension', getURL: (path) => root + path.replace(/^\//, ''), onMessage: { addListener(fn) { listener = fn; } }, onStartup: event(), onInstalled: event() },
    storage: { local: {
      async get(names) { return Object.fromEntries((Array.isArray(names) ? names : [names]).map((name) => [name, data[name]])); },
      async set(values) { Object.assign(data, values); },
      async remove(names) { for (const name of Array.isArray(names) ? names : [names]) delete data[name]; },
      async setAccessLevel() {},
    } },
    alarms: { onAlarm: event(), async create() {}, async clear() {} },
  };
  const context = vm.createContext({ [target === 'firefox' ? 'browser' : 'chrome']: api, console, URL, URLSearchParams, AbortSignal,
    fetch: async () => { throw new Error('Network is deliberately unavailable in this smoke check.'); },
  });
  vm.runInContext(await readFile(`.output/${target}-mv3/background.js`, 'utf8'), context);
  assert.equal(typeof listener, 'function');
  const sender = { id: api.runtime.id, url: `${root}popup.html` };
  const send = (message, from = sender) => new Promise((resolve) => {
    const accepted = listener(message, from, resolve);
    if (!accepted) resolve(null);
  });
  assert.equal(await send({ type: 'GET_STATE' }, { ...sender, url: 'https://leetcode.com/problems/two-sum/', tab: { id: 1 } }), null);
  assert.equal(await send({ type: 'GET_STATE' }, { ...sender, id: 'another-extension' }), null);
  const values = { owner: 'test-owner', repository: 'test-repo', branch: 'main', directory: 'solutions' };
  assert.equal((await send({ type: 'SAVE_CONFIG', data: values })).success, true);
  const options = await send({ type: 'GET_STATE' }, { ...sender, url: `${root}options.html`, tab: { id: 2 } });
  assert.equal(JSON.stringify(options.data.config), JSON.stringify(values));
  data['githubsync-auth'] = { token: 'fixture-private-token', user: { id: 1, login: 'tester' } };
  const state = await send({ type: 'GET_STATE' });
  assert.equal(state.data.user.login, 'tester');
  assert.ok(!JSON.stringify(state).includes('fixture-private-token'));
  assert.equal((await send({ type: 'LEETCODE_SYNC_REQUEST' })).success, false);
  const capture = { schemaVersion: 1, platform: 'leetcode', submissionId: '123456789', problemNumber: 1, problemTitle: 'Two Sum', problemSlug: 'two-sum', problemUrl: 'https://leetcode.com/problems/two-sum/', language: 'Java', sourceCode: 'class Solution {}', topics: ['Array'], companies: [], submittedAt: '2026-01-01T00:00:00.000Z', capturedAt: '2026-01-01T00:00:01.000Z' };
  const contentSender = { id: api.runtime.id, url: 'https://leetcode.com/problems/two-sum/', tab: { id: 1 } };
  assert.equal((await send({ type: 'LEETGITSYNC_DIAGNOSTIC', data: { stage: 'CONTENT_SCRIPT_LOADED', slug: 'two-sum', sourceCode: 'private-source', token: 'private-token' } }, contentSender)).data.recorded, true);
  assert.equal((await send({ type: 'LEETGITSYNC_DIAGNOSTIC', data: { stage: 'PAGE_OBSERVER_READY', slug: 'two-sum' } }, { id: api.runtime.id, tab: { id: 1, url: 'https://leetcode.com/problems/two-sum/' } })).data.recorded, true);
  const diagnosed = await send({ type: 'GET_STATE' });
  assert.equal(diagnosed.data.diagnostics[0].stage, 'PAGE_OBSERVER_READY');
  assert.ok(diagnosed.data.diagnostics.some((item) => item.stage === 'CONTENT_SCRIPT_LOADED'));
  assert.ok(!JSON.stringify(diagnosed).includes('private-source'));
  assert.ok(!JSON.stringify(diagnosed).includes('private-token'));
  assert.equal((await send({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: capture }, contentSender)).data.captured, true);
  assert.equal((await send({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: capture }, contentSender)).data.duplicate, true);
  assert.equal(await send({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: capture }, { ...contentSender, url: 'https://leetcode.com/contest/' }), null);
  assert.equal((await send({ type: 'DISCONNECT' })).success, true);
  assert.equal(data['githubsync-auth'], undefined);
  console.log(`${target}: production worker messages, capture queue, settings, token isolation and disconnect verified with API doubles`);
}
