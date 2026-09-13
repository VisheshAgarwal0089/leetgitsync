import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProblemUrl, parseSubmitUrl } from '../extension/leetcode/url.js';
import { fetchContestTiming } from '../extension/leetcode/contest.js';
import { installNetworkObserver } from '../extension/leetcode/network-observer.js';
import { createCapturePipeline } from '../extension/leetcode/pipeline.js';
import { createMetadataProvider } from '../extension/leetcode/metadata.js';
import { installSubmissionFallback, resolveObservedSubmission } from '../extension/leetcode/submission-fallback.js';
import { createService } from '../extension/lib/service.js';
import { createStorage, keys } from '../extension/lib/storage.js';
import { enqueue, createQueueProcessor, queueSummary } from '../extension/sync/queue.js';
import { syncSolution } from '../extension/sync/github-writer.js';
import { validateRecord } from '../extension/leetcode/record.js';
import { validCandidateShape } from '../extension/leetcode/bridge.js';

const slug = 'weekly-contest-500';
const url = `https://leetcode.com/contest/${slug}/problems/two-sum/`;
const start = Date.parse('2030-01-01T00:00:00.000Z');
const end = start + 5400_000;
const sourceCode = 'class Solution {\n  // exact  spacing\n}\n';
const details = { problemNumber: 1, problemTitle: 'Two Sum', problemSlug: 'two-sum', topics: [], companies: [] };
const candidate = { submissionId: '123', questionId: '1', problemSlug: 'two-sum', language: 'java', sourceCode, submittedAt: new Date(start).toISOString(), contestSlug: slug };
const config = { owner: 'owner', repository: 'repo', branch: 'main', directory: 'solutions' };
const result = { commitSha: 'a'.repeat(40), commitUrl: 'https://github.com/owner/repo/commit/' + 'a'.repeat(40), path: 'solutions/1-two-sum.java' };
const record = (endsAt = new Date(end).toISOString()) => ({ schemaVersion: 1, platform: 'leetcode', submissionId: '123', ...details, problemUrl: 'https://leetcode.com/problems/two-sum/', language: 'Java', sourceCode, submittedAt: new Date(start).toISOString(), capturedAt: new Date(start).toISOString(), contest: { slug, endsAt } });

function fixture() {
  let time = start;
  const data = { [keys.auth]: { token: 'fixture-token', user: { id: 1, login: 'tester' } }, [keys.config]: config, [keys.schema]: { version: 2, status: 'complete' } };
  const writes = [];
  const scheduled = new Map();
  const local = {
    async get(names) { return Object.fromEntries((Array.isArray(names) ? names : [names]).map((name) => [name, structuredClone(data[name])])); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(name) { delete data[name]; }, async setAccessLevel() {},
  };
  const makeService = () => createService({ store: createStorage(local), now: () => time, alarms: { async create(name, value) { scheduled.set(name, value); }, async clear(name) { scheduled.delete(name); } }, executeSync: async (job) => { writes.push(job); return result; } });
  return { data, writes, scheduled, makeService, setTime(value) { time = value; } };
}

test('central parser handles weekly, biweekly and normal routes with suffixes', () => {
  assert.deepEqual(parseProblemUrl(url + '?envType=contest'), { problemSlug: 'two-sum', contestSlug: slug, pageType: 'contest' });
  assert.deepEqual(parseProblemUrl('https://leetcode.com/contest/biweekly-contest-160/problems/two-sum/submissions/'), { problemSlug: 'two-sum', contestSlug: 'biweekly-contest-160', pageType: 'contest' });
  assert.deepEqual(parseProblemUrl('https://leetcode.com/problems/two-sum/description/'), { problemSlug: 'two-sum', contestSlug: null, pageType: 'normal' });
  assert.equal(parseSubmitUrl(`https://leetcode.com/contest/api/${slug}/problems/two-sum/submit/`).contestSlug, slug);
});

test('invalid contest URLs and non-submit endpoints are rejected', () => {
  for (const value of ['https://evil.example/contest/a/problems/b/', 'https://leetcode.com/contest//problems/b/', 'https://leetcode.com/contest/a/problem/b/', 'https://leetcode.com/contest/a/problems/a%2Fb/', 'https://leetcode.com/contest/a/problems/-bad/', 'https://leetcode.com/contest/a/']) assert.equal(parseProblemUrl(value), null);
  assert.equal(parseSubmitUrl(url + 'description/submit/'), null);
  assert.equal(validCandidateShape({ ...candidate, contestSlug: '../private' }), false);
  assert.throws(() => validateRecord({ ...record(), contest: { slug, endsAt: 'invalid' } }));
});

test('MAIN fetch captures Accepted contest code exactly and suppresses duplicate polls', async () => {
  const responses = [Response.json({ submission_id: 123 }), Response.json({ state: 'STARTED' }), Response.json({ state: 'SUCCESS', status_code: 10 }), Response.json({ state: 'SUCCESS', status_code: 10 })];
  const captures = [];
  const window = { location: { href: url }, Request, XMLHttpRequest: class {}, fetch: async () => responses.shift() };
  installNetworkObserver(window, (value) => captures.push(value), () => new Date(start).toISOString());
  await window.fetch(`https://leetcode.com/contest/api/${slug}/problems/two-sum/submit/`, { method: 'POST', body: JSON.stringify({ typed_code: sourceCode, lang: 'java', question_id: 1 }) });
  await new Promise(setImmediate);
  for (let index = 0; index < 3; index += 1) { await window.fetch('https://leetcode.com/submissions/detail/123/v2/check/'); await new Promise(setImmediate); }
  assert.equal(captures.length, 1); assert.equal(captures[0].sourceCode, sourceCode); assert.equal(captures[0].contestSlug, slug);
  assert.equal(validCandidateShape(captures[0]), true);
});

test('MAIN XHR contest submission context survives pending results and ignores rejection', () => {
  class XHR {
    open() {} send() {} addEventListener(name, fn) { this.load = fn; }
    respond(value) { this.status = 200; this.responseText = JSON.stringify(value); this.load(); }
  }
  const captures = [];
  const window = { location: { href: url }, XMLHttpRequest: XHR, fetch: async () => Response.json({}) };
  installNetworkObserver(window, (value) => captures.push(value));
  const submit = new window.XMLHttpRequest(); submit.open('POST', url + 'submit/'); submit.send(JSON.stringify({ typed_code: sourceCode, lang: 'java', question_id: 1 })); submit.respond({ submission_id: 123 });
  const poll = new window.XMLHttpRequest(); poll.open('GET', 'https://leetcode.com/submissions/detail/123/check/'); poll.send(); poll.respond({ state: 'STARTED', status_code: 10 });
  assert.equal(captures.length, 0); poll.respond({ state: 'SUCCESS', status_code: 11 }); assert.equal(captures.length, 0);
  submit.respond({ submission_id: 124 });
  const accepted = new window.XMLHttpRequest(); accepted.open('GET', 'https://leetcode.com/submissions/detail/124/check/'); accepted.send(); accepted.respond({ state: 'SUCCESS', status_code: 10 });
  assert.equal(captures[0].contestSlug, slug); assert.equal(captures[0].sourceCode, sourceCode);
});

test('isolated PerformanceObserver/GraphQL path captures contest metadata and creates one held job', async () => {
  const f = fixture(); const service = f.makeService();
  const fetcher = async (requestUrl, options) => {
    if (requestUrl.includes('/contest/api/info/')) return Response.json({ contest: { title_slug: slug, start_time: start / 1000, duration: 5400 } });
    const body = JSON.parse(options.body);
    if (body.query.includes('questionSubmissionList')) return Response.json({ data: { questionSubmissionList: { submissions: [{ id: '123', titleSlug: 'two-sum', status: 10, lang: 'java', timestamp: start / 1000, frontendId: 1 }] } } });
    if (body.query.includes('submissionDetails')) return Response.json({ data: { submissionDetails: { code: sourceCode } } });
    return Response.json({ data: { question: { questionFrontendId: '1', title: 'Two Sum', titleSlug: 'two-sum', topicTags: [] } } });
  };
  const pipeline = createCapturePipeline({ metadata: createMetadataProvider({ fetcher, document: null }), page: () => parseProblemUrl(url), contestTiming: (value) => fetchContestTiming(value, fetcher), now: () => new Date(start).toISOString(), send: (value) => service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: value }) });
  const window = { location: { href: url }, PerformanceObserver: class { observe() {} disconnect() {} } };
  const fallback = installSubmissionFallback({ window, fetcher, capture: pipeline.capture });
  await fallback.inspect('https://leetcode.com/submissions/detail/123/v2/check/'); await fallback.inspect('https://leetcode.com/submissions/detail/123/v2/check/');
  assert.equal(f.data[keys.queue].length, 1); assert.equal(f.data[keys.queue][0].status, 'contest_hold'); assert.equal(f.data[keys.captures][0].sourceCode, sourceCode);
  assert.equal(f.scheduled.get('sync-queue').when, end);
  await service.processQueue(); assert.equal(f.writes.length, 0);
});

test('contest ID-specific GraphQL details capture when the normal submission list omits contest records', async () => {
  for (const statusDisplay of ['Accepted', 'Pending', 'Wrong Answer']) {
    const value = await resolveObservedSubmission({ submissionId: '123', problemSlug: 'two-sum', contestSlug: slug, fetcher: async (requestUrl, options) => JSON.parse(options.body).query.includes('questionSubmissionList') ? Response.json({ data: { questionSubmissionList: { submissions: [] } } }) : Response.json({ data: { submissionDetails: { statusDisplay, timestamp: start / 1000, code: sourceCode, lang: { name: 'java' }, question: { titleSlug: 'two-sum', questionFrontendId: '1' } } } }) });
    assert.equal(value.state, statusDisplay === 'Accepted' ? 'accepted' : statusDisplay === 'Pending' ? 'pending' : 'rejected');
    if (value.candidate) { assert.equal(value.candidate.sourceCode, sourceCode); assert.equal(value.candidate.contestSlug, slug); }
  }
});

test('pending and rejected contest GraphQL records never request source code', async () => {
  for (const [status, isPending, state] of [[10, true, 'pending'], [11, false, 'rejected'], [14, false, 'rejected']]) {
    let calls = 0;
    const value = await resolveObservedSubmission({ submissionId: '123', problemSlug: 'two-sum', contestSlug: slug, fetcher: async () => { calls += 1; return Response.json({ data: { questionSubmissionList: { submissions: [{ id: '123', status, isPending }] } } }); } });
    assert.equal(value.state, state); assert.equal(calls, 1);
  }
});

test('isolated fallback retains contest context when a pending poll is followed by client navigation', async () => {
  let pending = true;
  const captures = [];
  const window = { location: { href: url }, PerformanceObserver: class { observe() {} disconnect() {} } };
  const fallback = installSubmissionFallback({ window, capture: async (value) => captures.push(value), fetcher: async (requestUrl, options) => {
    const query = JSON.parse(options.body).query;
    return query.includes('submissionDetails') ? Response.json({ data: { submissionDetails: { code: sourceCode } } }) : Response.json({ data: { questionSubmissionList: { submissions: [{ id: '123', titleSlug: 'two-sum', status: 10, isPending: pending, frontendId: 1, lang: 'java', timestamp: start / 1000 }] } } });
  } });
  await fallback.inspect(`https://leetcode.com/contest/api/${slug}/problems/two-sum/submit/`);
  await fallback.inspect('https://leetcode.com/submissions/detail/123/check/');
  window.location.href = 'https://leetcode.com/problems/two-sum/'; pending = false;
  await fallback.inspect('https://leetcode.com/submissions/detail/123/check/');
  assert.equal(captures.length, 1); assert.equal(captures[0].contestSlug, slug);
});

test('capture retains contest origin after navigation to a different problem and retries a failed capture event', async () => {
  const values = [];
  const pipeline = createCapturePipeline({ metadata: { async get() { return details; } }, page: () => parseProblemUrl('https://leetcode.com/problems/three-sum/'), contestTiming: async (value) => ({ slug: value, endsAt: null }), send: async (value) => { values.push(value); return {}; } });
  await pipeline.capture(candidate);
  assert.deepEqual(values[0].contest, { slug, endsAt: null });
  let attempts = 0;
  const window = { location: { href: url }, PerformanceObserver: class { observe() {} disconnect() {} } };
  const fallback = installSubmissionFallback({ window, capture: async () => { attempts += 1; if (attempts === 1) throw new Error('Capture unavailable'); }, fetcher: async (requestUrl, options) => JSON.parse(options.body).query.includes('questionSubmissionList') ? Response.json({ data: { questionSubmissionList: { submissions: [{ id: '123', status: 10, frontendId: 1, lang: 'java', timestamp: start / 1000, titleSlug: 'two-sum' }] } } }) : Response.json({ data: { submissionDetails: { code: sourceCode } } }) });
  await fallback.inspect('https://leetcode.com/submissions/detail/123/check/');
  await fallback.inspect('https://leetcode.com/submissions/detail/123/check/');
  assert.equal(attempts, 2);
});

test('held contest jobs require destination-change confirmation and preserve their target', async () => {
  const f = fixture(); const service = f.makeService();
  await service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record() });
  const changed = { ...config, repository: 'another' };
  await assert.rejects(service.handle({ type: 'SAVE_CONFIG', data: { config: changed, confirmPending: false } }));
  await service.handle({ type: 'SAVE_CONFIG', data: { config: changed, confirmPending: true } });
  assert.deepEqual(f.data[keys.queue][0].target, config);
});

test('contest info supplies metadata if active problem GraphQL is unavailable', async () => {
  const provider = createMetadataProvider({ document: null, fetcher: async (requestUrl) => requestUrl.includes('/graphql/') ? Response.json({ data: null }) : Response.json({ contest: { title_slug: slug }, questions: [{ question_id: 1, title: 'Two Sum', title_slug: 'two-sum' }] }) });
  assert.deepEqual(await provider.get('two-sum', slug), details);
});

test('contest holds survive schema migration and service-worker restart, then release automatically', async () => {
  const f = fixture(); let service = f.makeService();
  await service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record() });
  service = f.makeService(); await service.resume();
  assert.equal(f.data[keys.queue][0].status, 'contest_hold'); assert.equal(f.writes.length, 0); assert.equal(f.data[keys.auth].token, 'fixture-token');
  f.setTime(end); await service.processQueue();
  assert.equal(f.data[keys.queue][0].status, 'synced'); assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].target, config);
  assert.equal((await service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record() })).duplicate, true);
  await f.makeService().resume(); assert.equal(f.writes.length, 1);
});

test('unknown contest timing fails closed across restarts and remains visible in popup state', async () => {
  for (const fetcher of [async () => { throw new TypeError('private response'); }, async () => Response.json({ contest: { title_slug: 'different', start_time: 1, duration: 2 } }), async () => Response.json({ contest: { title_slug: slug, start_time: 1, duration: -1 } })]) assert.deepEqual(await fetchContestTiming(slug, fetcher), { slug, endsAt: null });
  const f = fixture(); await f.makeService().handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record(null) });
  f.setTime(end + 1000); const service = f.makeService(); await service.resume();
  const state = await service.handle({ type: 'GET_STATE' });
  assert.equal(state.queue.contestUnknownCount, 1); assert.equal(state.queue.contestHeldCount, 1); assert.equal(f.writes.length, 0);
  assert.equal(f.data[keys.queue][0].status, 'contest_hold');
});

test('normal jobs sync immediately beside held contest jobs and holds count toward capacity', async () => {
  const f = fixture(); const service = f.makeService();
  await service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record() });
  const normal = { ...record(), submissionId: '124' }; delete normal.contest;
  await service.handle({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: normal }); await service.processQueue();
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].id, '124'); assert.equal(queueSummary(f.data[keys.queue]).contestHeldCount, 1);
  const full = Array.from({ length: 100 }, (_, index) => ({ ...enqueue([], record(null), config, start).queue[0], submissionId: String(index) }));
  assert.throws(() => enqueue(full, { ...record(), submissionId: '999' }, config, start), { code: 'QUEUE_FULL' });
});

test('writer independently blocks active, unknown and explicitly held contest jobs before any API call', async () => {
  for (const value of [record(), record(null)]) {
    let calls = 0;
    await assert.rejects(syncSolution({ job: enqueue([], value, config, start).queue[0], token: 'fixture-token', fetcher: async () => { calls += 1; throw new Error('Unexpected API'); } }), { code: 'CONTEST_HOLD' });
    assert.equal(calls, 0);
  }
});

test('a stale queued contest record is held defensively before processor execution', async () => {
  let queue = [{ ...enqueue([], record(), config, start).queue[0], status: 'queued' }]; let writes = 0;
  const processor = createQueueProcessor({ load: async () => queue, save: async (value) => { queue = value; }, execute: async () => { writes += 1; return result; }, schedule: async () => {}, now: () => start });
  await processor.run(); assert.equal(writes, 0); assert.equal(queue[0].status, 'contest_hold');
});
