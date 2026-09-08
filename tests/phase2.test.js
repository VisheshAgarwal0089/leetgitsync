import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAcceptedCandidate, getProblemSlug, getSubmissionId, getSubmissionStatus, isAcceptedResult, isTerminalResult,
  isResultRequest, isSubmissionRequest, parseSubmitBody,
} from '../extension/leetcode/protocol.js';
import { normalizeRecord, validateRecord } from '../extension/leetcode/record.js';
import { fetchProblemMetadata, createMetadataProvider } from '../extension/leetcode/metadata.js';
import { createCapturePipeline } from '../extension/leetcode/pipeline.js';
import { observeNavigation } from '../extension/leetcode/navigation.js';
import { installNetworkObserver } from '../extension/leetcode/network-observer.js';
import { installSubmissionFallback, resolveObservedSubmission } from '../extension/leetcode/submission-fallback.js';
import { createService } from '../extension/lib/service.js';
import { createStorage, keys } from '../extension/lib/storage.js';
import { DIAGNOSTIC_LIMIT, normalizeDiagnostic } from '../extension/lib/diagnostics.js';

const submittedAt = '2026-09-06T10:00:00.000Z';
const capturedAt = '2026-09-06T10:00:01.000Z';
const sourceCode = 'class Solution {\n  // preserve  spaces\n}\n';
const candidate = { submissionId: '123456789', questionId: '1', problemSlug: 'two-sum', language: 'java', sourceCode, submittedAt };
const metadata = { problemNumber: '1', problemTitle: 'Two Sum', problemSlug: 'two-sum', topics: ['Array', 'Hash Table'], companies: ['Amazon', 'Google'] };
const record = { schemaVersion: 1, platform: 'leetcode', submissionId: '123456789', problemNumber: 1, problemTitle: 'Two Sum', problemSlug: 'two-sum', problemUrl: 'https://leetcode.com/problems/two-sum/', language: 'Java', sourceCode, topics: ['Array', 'Hash Table'], companies: ['Amazon', 'Google'], submittedAt, capturedAt };

function memoryService(initial = {}) {
  const data = structuredClone(initial);
  const local = {
    async get(names) { return Object.fromEntries((Array.isArray(names) ? names : [names]).map((name) => [name, structuredClone(data[name])])); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(names) { for (const name of Array.isArray(names) ? names : [names]) delete data[name]; },
    async setAccessLevel() {},
  };
  const alarms = { async create() {}, async clear() {} };
  return { data, service: createService({ store: createStorage(local), alarms, now: () => Date.parse(capturedAt) }) };
}

test('accepted result is detected only after the matching submission exists', () => {
  const pending = new Map([['123456789', candidate]]);
  assert.equal(isAcceptedResult({ state: 'SUCCESS', status_msg: 'Accepted' }), true);
  assert.deepEqual(createAcceptedCandidate({ state: 'SUCCESS', status_msg: 'Accepted' }, 'https://leetcode.com/submissions/detail/123456789/check/', pending, capturedAt), { ...candidate, acceptedAt: capturedAt });
  assert.equal(createAcceptedCandidate({ state: 'SUCCESS', status_msg: 'Accepted' }, 'https://leetcode.com/submissions/detail/999/check/', pending, capturedAt), null);
});

test('pending and rejected terminal results never produce captures', () => {
  const pending = new Map([['123456789', candidate]]);
  for (const payload of [
    { state: 'PENDING', status_msg: 'Pending' }, { state: 'STARTED' }, { state: 'SUCCESS', status_msg: 'Wrong Answer' },
    { state: 'SUCCESS', status_msg: 'Runtime Error' }, { state: 'SUCCESS', status_msg: 'Compile Error' },
    { state: 'SUCCESS', status_msg: 'Time Limit Exceeded' },
  ]) {
    assert.equal(isAcceptedResult(payload), false);
    assert.equal(createAcceptedCandidate(payload, 'https://leetcode.com/submissions/detail/123456789/check/', pending, capturedAt), null);
  }
});

test('fetch observer correlates exact submitted code with one accepted terminal result', async () => {
  const responses = [
    Response.json({ submission_id: 123456789 }),
    Response.json({ state: 'STARTED', status_msg: 'Pending' }),
    Response.json({ state: 'SUCCESS', status_msg: 'Accepted' }),
    Response.json({ state: 'SUCCESS', status_msg: 'Accepted' }),
  ];
  class FakeXHR {}
  const captured = [];
  const fakeWindow = { location: { href: 'https://leetcode.com/problems/two-sum/' }, Request, XMLHttpRequest: FakeXHR, fetch: async () => responses.shift() };
  installNetworkObserver(fakeWindow, (value) => captured.push(value), () => submittedAt);
  await fakeWindow.fetch('https://leetcode.com/problems/two-sum/submit/', { method: 'POST', body: JSON.stringify({ typed_code: sourceCode, lang: 'java', question_id: '1' }) });
  await new Promise((resolve) => setImmediate(resolve));
  for (let count = 0; count < 3; count++) {
    await fakeWindow.fetch('https://leetcode.com/submissions/detail/123456789/check/');
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(captured.length, 1);
  assert.equal(captured[0].sourceCode, sourceCode);
  assert.equal(captured[0].submissionId, '123456789');
});

test('submission protocol extracts exact code, IDs, slug and supported URLs', () => {
  const body = JSON.stringify({ typed_code: sourceCode, lang: 'java', question_id: '1' });
  assert.deepEqual(parseSubmitBody(body), { sourceCode, language: 'java', questionId: '1' });
  assert.equal(getSubmissionId({ submission_id: 123456789 }), '123456789');
  assert.equal(getSubmissionId({}, 'https://leetcode.com/submissions/detail/123456789/check/'), '123456789');
  assert.equal(getProblemSlug('https://leetcode.com/problems/two-sum/submit/'), 'two-sum');
  assert.equal(isSubmissionRequest('https://leetcode.com/problems/two-sum/submit/', 'POST'), true);
  assert.equal(isSubmissionRequest('https://leetcode.com/problems/two-sum/submit/', 'GET'), false);
  assert.equal(isResultRequest('https://leetcode.com/submissions/detail/123456789/check/'), true);
});

test('normalized record validates metadata and preserves source code byte-for-byte', () => {
  const value = normalizeRecord(candidate, metadata, capturedAt);
  assert.deepEqual(value, record);
  assert.equal(value.sourceCode, sourceCode);
  assert.deepEqual(validateRecord(value), value);
  assert.throws(() => normalizeRecord({ ...candidate, submissionId: '../1' }, metadata, capturedAt));
  assert.throws(() => normalizeRecord({ ...candidate, sourceCode: '   ' }, metadata, capturedAt));
  assert.throws(() => validateRecord({ ...record, problemUrl: 'https://evil.example/two-sum' }));
});

test('metadata extraction supports missing topics and companies', async () => {
  const fetcher = async () => Response.json({ data: { question: { questionFrontendId: '1', title: 'Two Sum', titleSlug: 'two-sum', topicTags: null, companyTagStats: null } } });
  assert.deepEqual(await fetchProblemMetadata('two-sum', { fetcher, document: null }), { problemNumber: '1', problemTitle: 'Two Sum', problemSlug: 'two-sum', topics: [], companies: [] });
  const normalized = normalizeRecord(candidate, { ...metadata, topics: undefined, companies: undefined }, capturedAt);
  assert.deepEqual(normalized.topics, []); assert.deepEqual(normalized.companies, []);
});

test('metadata extraction parses topic and available company API data', async () => {
  const fetcher = async () => Response.json({ data: { question: { questionFrontendId: '1', title: 'Two Sum', titleSlug: 'two-sum', topicTags: [{ name: 'Array' }, { name: 'Hash Table' }], companyTagStats: JSON.stringify([{ company: { name: 'Amazon' } }, { name: 'Google' }]) } } });
  assert.deepEqual(await fetchProblemMetadata('two-sum', { fetcher, document: null }), metadata);
});

test('multiple events and DOM updates for one submission send one background message', async () => {
  let sends = 0;
  let resolveMetadata;
  const provider = { get: () => new Promise((resolve) => { resolveMetadata = resolve; }), navigation() {} };
  const pipeline = createCapturePipeline({ metadata: provider, send: async () => { sends++; return { captured: true }; }, now: () => capturedAt });
  const first = pipeline.capture(candidate);
  const second = pipeline.capture(candidate);
  resolveMetadata(metadata);
  assert.deepEqual(await first, { captured: true });
  assert.deepEqual(await second, { captured: true });
  assert.deepEqual(await pipeline.capture(candidate), { duplicate: true });
  assert.equal(sends, 1);
});

test('client-side navigation invalidates metadata cache and mutation updates detect routes', async () => {
  let fetches = 0;
  const provider = createMetadataProvider({ fetcher: async () => { fetches++; return Response.json({ data: { question: { questionFrontendId: '1', title: 'Two Sum', titleSlug: 'two-sum', topicTags: [] } } }); }, document: null });
  await provider.get('two-sum'); await provider.get('two-sum'); assert.equal(fetches, 1);
  provider.navigation(); await provider.get('two-sum'); assert.equal(fetches, 2);
  let check;
  let navigations = 0;
  class Observer { constructor(callback) { check = callback; } observe() {} disconnect() {} }
  const listeners = new Map();
  const fakeWindow = { location: { href: 'https://leetcode.com/problems/two-sum/' }, MutationObserver: Observer, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener() {} };
  const stop = observeNavigation({ window: fakeWindow, document: { documentElement: {} }, onNavigate: () => navigations++ });
  check(); assert.equal(navigations, 0);
  fakeWindow.location.href = 'https://leetcode.com/problems/add-two-numbers/'; check(); assert.equal(navigations, 1);
  listeners.get('popstate')(); assert.equal(navigations, 1); stop();
});

test('content-to-background capture persists, deduplicates and does no GitHub work', async () => {
  const f = memoryService();
  assert.deepEqual(await f.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record }), { captured: true, duplicate: false, count: 1 });
  assert.deepEqual(await f.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record }), { captured: false, duplicate: true, count: 1 });
  assert.deepEqual(f.data[keys.captures], [record]);
});

test('capture history is newest-first and limited to 50 records', async () => {
  const f = memoryService();
  for (let id = 1; id <= 55; id++) await f.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: { ...record, submissionId: String(id), capturedAt: new Date(Date.parse(capturedAt) + id).toISOString() } });
  assert.equal(f.data[keys.captures].length, 50);
  assert.equal(f.data[keys.captures][0].submissionId, '55');
  assert.equal(f.data[keys.captures][49].submissionId, '6');
});

test('capture errors log only a fixed sanitized message', async () => {
  const logs = [];
  const pipeline = createCapturePipeline({ metadata: { async get() { throw new Error(`secret:${sourceCode}`); }, navigation() {} }, send: async () => {}, report: (...args) => logs.push(args) });
  await assert.rejects(pipeline.capture(candidate));
  assert.deepEqual(logs, [['LeetGitSync could not capture the accepted submission.']]);
  assert.ok(!JSON.stringify(logs).includes(sourceCode));
});


test('current LeetCode v2 result endpoint and numeric accepted status are recognized', () => {
  const url = 'https://leetcode.com/submissions/detail/123456789/v2/check/';
  assert.equal(isResultRequest(url), true);
  assert.equal(getSubmissionStatus({ state: 'SUCCESS', status_code: 10, judger_status_code: 10 }), 'accepted');
  assert.equal(isAcceptedResult({ state: 'SUCCESS', status_code: 10, judger_status_code: 10 }), true);
  assert.equal(isAcceptedResult({ state: 'RUNNING_TESTS', status_code: 10 }), false);
  assert.equal(isTerminalResult({ state: 'PREPARING' }), false);
  assert.equal(isTerminalResult({ state: 'COMPILING' }), false);
  assert.equal(isTerminalResult({ state: 'RUNNING_TESTS' }), false);
  assert.equal(isTerminalResult({ state: 'SUCCESS', status_code: 11 }), true);
});

test('live v2 fetch polling keeps context through intermediate states and emits once', async () => {
  const responses = [
    Response.json({ submission_id: 123456789 }),
    Response.json({ state: 'PREPARING', status_code: 0 }),
    Response.json({ state: 'COMPILING', status_code: 0 }),
    Response.json({ state: 'RUNNING_TESTS', status_code: 0 }),
    Response.json({ state: 'SUCCESS', status_code: 10, judger_status_code: 10 }),
    Response.json({ state: 'SUCCESS', status_code: 10, judger_status_code: 10 }),
  ];
  class FakeXHR {}
  const captured = [];
  const diagnostics = [];
  const fakeWindow = { location: { href: 'https://leetcode.com/problems/two-sum/', origin: 'https://leetcode.com' }, Request, XMLHttpRequest: FakeXHR, fetch: async () => responses.shift() };
  installNetworkObserver(fakeWindow, (value) => captured.push(value), () => submittedAt, (value) => diagnostics.push(value));
  await fakeWindow.fetch('https://leetcode.com/problems/two-sum/submit/', { method: 'POST', body: JSON.stringify({ typed_code: sourceCode, lang: 'java', question_id: '1' }) });
  await new Promise((resolve) => setImmediate(resolve));
  for (let count = 0; count < 5; count++) {
    await fakeWindow.fetch('https://leetcode.com/submissions/detail/123456789/v2/check/');
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(captured.length, 1);
  assert.equal(captured[0].sourceCode, sourceCode);
  assert.ok(diagnostics.some((item) => item.stage === 'SUBMISSION_RESPONSE_DETECTED'));
  assert.ok(diagnostics.some((item) => item.stage === 'STATUS_NORMALIZED' && item.status === 'accepted'));
});

test('diagnostics are allowlisted, sanitized, persistent, and limited', async () => {
  const unsafe = normalizeDiagnostic({
    stage: 'DIAGNOSTIC_ERROR', slug: 'two-sum', submissionId: '123456789', status: 'Accepted',
    errorCode: 'CAPTURE_MESSAGE_FAILED', sourceCode, token: 'github_pat_private', response: { private: true },
    missingFields: ['problemTitle', 'sourceCode', 'token', 'cookies'],
  }, capturedAt);
  assert.deepEqual(unsafe, {
    stage: 'DIAGNOSTIC_ERROR', at: capturedAt, slug: 'two-sum', submissionId: '123456789', status: 'accepted',
    missingFields: ['problemTitle', 'sourceCode'], errorCode: 'CAPTURE_MESSAGE_FAILED',
  });
  assert.ok(!JSON.stringify(unsafe).includes(sourceCode));
  assert.ok(!JSON.stringify(unsafe).includes('github_pat_private'));

  const f = memoryService();
  for (let index = 0; index < DIAGNOSTIC_LIMIT + 5; index++) {
    await f.service.handle({ type: 'LEETGITSYNC_DIAGNOSTIC', data: { stage: 'CONTENT_SCRIPT_LOADED', slug: `problem-${index}` } });
  }
  assert.equal(f.data[keys.diagnostics].length, DIAGNOSTIC_LIMIT);
  assert.equal(f.data[keys.diagnostics][0].slug, `problem-${DIAGNOSTIC_LIMIT + 4}`);
  const state = await f.service.handle({ type: 'GET_STATE' });
  assert.equal(state.diagnostics.length, DIAGNOSTIC_LIMIT);
});

test('capture pipeline records safe success stages and failed field names', async () => {
  const success = [];
  const pipeline = createCapturePipeline({
    metadata: { async get() { return metadata; }, navigation() {} },
    send: async () => ({ captured: true }), now: () => capturedAt, diagnose: (item) => success.push(item),
  });
  await pipeline.capture(candidate);
  assert.deepEqual(success.map((item) => item.stage), ['METADATA_EXTRACTED', 'CAPTURE_MESSAGE_SENT']);

  const failed = [];
  const invalid = createCapturePipeline({
    metadata: { async get() { return { problemSlug: 'two-sum', topics: [], companies: [] }; }, navigation() {} },
    send: async () => {}, diagnose: (item) => failed.push(item),
  });
  await assert.rejects(invalid.capture({ ...candidate, questionId: null }));
  assert.deepEqual(failed[0].missingFields, ['problemNumber', 'problemTitle']);
  assert.equal(failed.at(-1).errorCode, 'METADATA_OR_RECORD_INVALID');
  assert.ok(!JSON.stringify(failed).includes(sourceCode));
});

test('background capture diagnostics reach persisted and queue-created stages', async () => {
  const f = memoryService({ [keys.config]: { owner: 'VisheshAgarwal0089', repository: 'leetcode_problems', branch: 'main', directory: 'solutions' } });
  await f.service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record });
  const stages = f.data[keys.diagnostics].map((item) => item.stage);
  assert.deepEqual(stages.slice(0, 3), ['QUEUE_JOB_CREATED', 'CAPTURE_PERSISTED', 'BACKGROUND_MESSAGE_RECEIVED']);
  const state = await f.service.handle({ type: 'GET_STATE' });
  assert.equal(state.capture.count, 1);
  assert.equal(state.capture.last.submissionId, record.submissionId);
});


test('isolated resource fallback reproduces live failure and captures without the main-world bridge', async () => {
  let observeCallback;
  class FakePerformanceObserver {
    constructor(callback) { observeCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const responses = [
    Response.json({ data: { questionSubmissionList: { submissions: [{ id: '123456789', titleSlug: 'two-sum', status: 10, statusDisplay: 'Accepted', lang: 'java', timestamp: '1788688800', isPending: false, frontendId: '1' }] } } }),
    Response.json({ data: { submissionDetails: { code: sourceCode } } }),
  ];
  const captured = [];
  const diagnostics = [];
  const fakeWindow = { location: { href: 'https://leetcode.com/problems/two-sum/' }, PerformanceObserver: FakePerformanceObserver };
  installSubmissionFallback({
    window: fakeWindow,
    fetcher: async () => responses.shift(),
    capture: async (value) => captured.push(value),
    diagnose: (value) => diagnostics.push(value),
  });
  observeCallback({ getEntries: () => [{ name: 'https://leetcode.com/submissions/detail/123456789/v2/check/' }] });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(captured.length, 1);
  assert.equal(captured[0].sourceCode, sourceCode);
  assert.equal(captured[0].submissionId, '123456789');
  assert.deepEqual(diagnostics.map((item) => item.stage), [
    'FALLBACK_OBSERVER_READY', 'RESULT_RESOURCE_DETECTED', 'SUBMISSION_RESPONSE_DETECTED', 'SUBMISSION_LOOKUP_STARTED', 'STATUS_NORMALIZED', 'SUBMISSION_CODE_FETCHED',
  ]);
  assert.ok(!JSON.stringify(diagnostics).includes(sourceCode));
});

test('isolated submission lookup ignores pending and rejected live records', async () => {
  const cases = [
    { id: '123456789', titleSlug: 'two-sum', status: 10, statusDisplay: 'Accepted', isPending: true },
    { id: '123456789', titleSlug: 'two-sum', status: 11, statusDisplay: 'Wrong Answer', isPending: false },
  ];
  for (const item of cases) {
    const result = await resolveObservedSubmission({
      submissionId: '123456789', problemSlug: 'two-sum',
      fetcher: async () => Response.json({ data: { questionSubmissionList: { submissions: [item] } } }),
    });
    assert.equal(result.state, item.isPending ? 'pending' : 'rejected');
  }
});

test('isolated submission lookup validates code and metadata before capture', async () => {
  const responses = [
    Response.json({ data: { questionSubmissionList: { submissions: [{ id: '123456789', titleSlug: 'two-sum', status: 10, statusDisplay: 'Accepted', lang: 'java', timestamp: '1788688800', isPending: false, frontendId: null }] } } }),
    Response.json({ data: { submissionDetails: { code: '' } } }),
  ];
  const diagnostics = [];
  const result = await resolveObservedSubmission({
    submissionId: '123456789', problemSlug: 'two-sum', fetcher: async () => responses.shift(), diagnose: (item) => diagnostics.push(item),
  });
  assert.equal(result.state, 'invalid');
  assert.deepEqual(diagnostics.at(-1).missingFields, ['sourceCode', 'problemNumber']);
});
