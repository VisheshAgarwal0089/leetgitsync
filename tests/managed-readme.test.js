import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGitHubFileUrl, parseManagedEntries, README_END, README_START, updateReadme } from '../extension/sync/readme.js';
import { encodeBase64, MAX_CONFLICT_REBUILDS, syncSolution } from '../extension/sync/github-writer.js';
import { createQueueProcessor, enqueue } from '../extension/sync/queue.js';

const time = Date.parse('2026-09-07T00:00:00.000Z');
const target = { owner: 'VisheshAgarwal0089', repository: 'leetgitsync', branch: 'feature/v2', directory: 'solutions' };
const baseRecord = (overrides = {}) => ({
  schemaVersion: 1, platform: 'leetcode', submissionId: '123456789', problemNumber: 1,
  problemTitle: 'Two Sum', problemSlug: 'two-sum', problemUrl: 'https://leetcode.com/problems/two-sum/',
  language: 'Java', sourceCode: 'class Solution {}', topics: ['Array'], companies: ['Google', 'Amazon'],
  submittedAt: new Date(time).toISOString(), capturedAt: new Date(time + 1).toISOString(), ...overrides,
});
const pathFor = (record) => `solutions/${record.problemNumber}-${record.problemSlug}.${record.language === 'C++' ? 'cpp' : record.language === 'Python' ? 'py' : 'java'}`;

test('README is created from an empty repository with exact markers and columns', () => {
  const record = baseRecord();
  const result = updateReadme('', record, target, pathFor(record)).content;
  const url = buildGitHubFileUrl(target, pathFor(record));
  assert.equal(result, `${README_START}\n\n## Array\n\n| # | Problem | File |\n|---:|---------|------|\n| 1 | [Two Sum](${url}) [Amazon] [Google] | [Java](${url}) |\n\n${README_END}`);
});

test('markers append to an existing README without changing existing bytes', () => {
  const existing = '# Project\r\nHandwritten text';
  const result = updateReadme(existing, baseRecord(), target, 'solutions/1-two-sum.java').content;
  assert.ok(result.startsWith(`${existing}\n\n${README_START}`));
  assert.equal(result.slice(0, existing.length), existing);
  assert.equal((result.match(/LEETGITSYNC:START/g) || []).length, 1);
});

test('valid managed content is replaced while prefix and suffix stay byte-identical', () => {
  const initial = updateReadme('before\r\n', baseRecord(), target, 'solutions/1-two-sum.java').content;
  const withSuffix = `${initial}\r\nafter\n`;
  const next = updateReadme(withSuffix, baseRecord({ problemTitle: 'Two Sum Updated' }), target, 'solutions/1-two-sum.java').content;
  assert.equal(next.slice(0, next.indexOf(README_START)), withSuffix.slice(0, withSuffix.indexOf(README_START)));
  assert.equal(next.slice(next.indexOf(README_END) + README_END.length), withSuffix.slice(withSuffix.indexOf(README_END) + README_END.length));
  assert.match(next, /Two Sum Updated/);
  assert.doesNotMatch(next, /\[Two Sum\]\(/);
});

test('malformed, duplicated and reversed markers fail safely', () => {
  for (const readme of [README_START, README_END, `${README_START}\n${README_START}\n${README_END}`, `${README_END}\n${README_START}`]) {
    assert.throws(() => updateReadme(readme, baseRecord(), target, 'solutions/1-two-sum.java'), (error) => error.code === 'README_INVALID');
  }
});

test('topics sort alphabetically and problems sort numerically under every topic', () => {
  let readme = updateReadme('', baseRecord({ problemNumber: 70, problemTitle: 'Climbing Stairs', problemSlug: 'climbing-stairs', language: 'Python', topics: ['Dynamic Programming', 'Math'], companies: [] }), target, 'solutions/70-climbing-stairs.py').content;
  readme = updateReadme(readme, baseRecord({ topics: ['Hash Table', 'Array'] }), target, 'solutions/1-two-sum.java').content;
  readme = updateReadme(readme, baseRecord({ submissionId: '20', problemNumber: 20, problemTitle: 'Valid Parentheses', problemSlug: 'valid-parentheses', language: 'C++', topics: ['Array'], companies: [] }), target, 'solutions/20-valid-parentheses.cpp').content;
  assert.ok(readme.indexOf('## Array') < readme.indexOf('## Dynamic Programming'));
  assert.ok(readme.indexOf('## Dynamic Programming') < readme.indexOf('## Hash Table'));
  assert.ok(readme.indexOf('| 1 |') < readme.indexOf('| 20 |'));
  assert.equal(parseManagedEntries(readme, target).filter((entry) => entry.problemNumber === 1).length, 2);
});

test('missing topics use Uncategorized and missing companies add no label', () => {
  const readme = updateReadme('', baseRecord({ topics: [], companies: [] }), target, 'solutions/1-two-sum.java').content;
  assert.match(readme, /## Uncategorized/);
  assert.match(readme, /\[Two Sum\]\([^\n]+\) \| \[Java\]/);
  assert.doesNotMatch(readme, /\) \[[^J]/);
});

test('different languages remain and same-language replacement removes stale topics and duplicates', () => {
  let readme = updateReadme('', baseRecord(), target, 'solutions/1-two-sum.java').content;
  readme = updateReadme(readme, baseRecord({ submissionId: '2', language: 'C++', sourceCode: 'class Solution {};', topics: ['Array'] }), target, 'solutions/1-two-sum.cpp').content;
  readme = updateReadme(readme, baseRecord({ submissionId: '3', problemTitle: 'Two Sum New', topics: ['Hash Table'], companies: ['Meta'] }), target, 'solutions/1-two-sum.java').content;
  readme = updateReadme(readme, baseRecord({ submissionId: '3', problemTitle: 'Two Sum New', topics: ['Hash Table'], companies: ['Meta'] }), target, 'solutions/1-two-sum.java').content;
  const entries = parseManagedEntries(readme, target);
  assert.equal(entries.filter((entry) => entry.language === 'Java').length, 1);
  assert.equal(entries.filter((entry) => entry.language === 'C++').length, 1);
  assert.equal(entries.find((entry) => entry.language === 'Java').topic, 'Hash Table');
  assert.equal(entries.some((entry) => entry.language === 'Java' && entry.topic === 'Array'), false);
});

test('Markdown-sensitive and UTF-8 labels are escaped, recoverable and deterministic', () => {
  const record = baseRecord({ problemTitle: 'Café [A] | <B> & `C`', topics: ['Hash # Map'], companies: ['A]B', 'Zoë'], language: 'C++' });
  const first = updateReadme('', record, target, 'solutions/1-two-sum.cpp').content;
  const second = updateReadme('', record, target, 'solutions/1-two-sum.cpp').content;
  assert.equal(first, second);
  assert.match(first, /Café &#91;A&#93; &#124; &#60;B&#62; &#38; &#96;C&#96;/);
  assert.match(first, /\/blob\/feature%2Fv2\/solutions\/1-two-sum\.cpp/);
  const [entry] = parseManagedEntries(first, target);
  assert.equal(entry.problemTitle, record.problemTitle);
  assert.deepEqual(entry.companies, ['A]B', 'Zoë']);
});

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function gitFixture({ readme = null, solution = null, conflicts = 0, failAt = null } = {}) {
  let headSha = '1'.repeat(40);
  let rootTreeSha = '2'.repeat(40);
  const readmeBlobSha = '3'.repeat(40);
  const solutionTreeSha = '4'.repeat(40);
  const solutionBlobSha = '5'.repeat(40);
  let remainingConflicts = conflicts;
  let objectCounter = 100;
  const calls = [];
  const blobBodies = [];
  const treeBodies = [];
  const commitBodies = [];
  const patchBodies = [];
  const nextSha = () => (objectCounter++).toString(16).padStart(40, '0');
  const fetcher = async (url, options) => {
    const method = options.method || 'GET';
    const pathname = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, pathname, body, authorization: options.headers.Authorization });
    if (method === 'GET' && pathname.includes('/git/ref/heads/')) return jsonResponse(200, { object: { sha: headSha } });
    if (method === 'GET' && pathname.endsWith(`/git/commits/${headSha}`)) return jsonResponse(200, { tree: { sha: rootTreeSha } });
    if (method === 'GET' && pathname.endsWith(`/git/trees/${rootTreeSha}`)) return jsonResponse(200, { truncated: false, tree: [
      ...(readme === null ? [] : [{ path: 'README.md', type: 'blob', sha: readmeBlobSha }]),
      ...(solution === null ? [] : [{ path: 'solutions', type: 'tree', sha: solutionTreeSha }]),
    ] });
    if (method === 'GET' && pathname.endsWith(`/git/trees/${solutionTreeSha}`)) return jsonResponse(200, { truncated: false, tree: [{ path: '1-two-sum.java', type: 'blob', sha: solutionBlobSha }] });
    if (method === 'GET' && pathname.endsWith(`/git/blobs/${readmeBlobSha}`)) return jsonResponse(200, { encoding: 'base64', content: encodeBase64(readme) });
    if (method === 'GET' && pathname.endsWith(`/git/blobs/${solutionBlobSha}`)) return jsonResponse(200, { encoding: 'base64', content: encodeBase64(solution) });
    if (method === 'POST' && pathname.endsWith('/git/blobs')) { blobBodies.push(body); return jsonResponse(201, { sha: nextSha() }); }
    if (method === 'POST' && pathname.endsWith('/git/trees')) { treeBodies.push(body); return jsonResponse(201, { sha: nextSha() }); }
    if (method === 'POST' && pathname.endsWith('/git/commits')) {
      commitBodies.push(body);
      if (failAt === 'commit') return jsonResponse(500, { message: 'private failure' });
      return jsonResponse(201, { sha: nextSha() });
    }
    if (method === 'PATCH' && pathname.includes('/git/refs/heads/')) {
      patchBodies.push(body);
      if (remainingConflicts > 0) {
        remainingConflicts -= 1;
        headSha = nextSha(); rootTreeSha = nextSha(); readme = 'Concurrent handwritten note\n'; solution = null;
        return jsonResponse(422, { message: 'not fast forward' });
      }
      headSha = body.sha;
      return jsonResponse(200, { object: { sha: body.sha } });
    }
    return jsonResponse(500, { message: `Unhandled ${method} ${pathname}` });
  };
  return { fetcher, calls, blobBodies, treeBodies, commitBodies, patchBodies };
}

test('atomic Git flow writes solution and README in one tree and advances the ref without force', async () => {
  const fixture = gitFixture();
  const queued = enqueue([], baseRecord(), target, time).queue[0];
  const result = await syncSolution({ job: queued, token: 'fixture-token', fetcher: fixture.fetcher });
  assert.equal(result.action, 'add');
  assert.equal(fixture.blobBodies[0].content, baseRecord().sourceCode);
  assert.match(fixture.blobBodies[1].content, /LEETGITSYNC:START/);
  assert.deepEqual(fixture.treeBodies[0].tree.map((entry) => entry.path), ['solutions/1-two-sum.java', 'README.md']);
  assert.equal(fixture.treeBodies[0].base_tree, '2'.repeat(40));
  assert.deepEqual(fixture.commitBodies[0].parents, ['1'.repeat(40)]);
  assert.equal(fixture.commitBodies[0].message, 'sync: add Two Sum');
  assert.deepEqual(fixture.patchBodies[0], { sha: result.commitSha, force: false });
  assert.ok(fixture.calls.every((call) => call.authorization === 'Bearer fixture-token'));
});

test('queue marks an atomic write synced only with the updated branch commit identity', async () => {
  const fixture = gitFixture();
  let queue = enqueue([], baseRecord(), target, time).queue;
  const processor = createQueueProcessor({
    load: async () => queue,
    save: async (value) => { queue = structuredClone(value); },
    execute: (queued) => syncSolution({ job: queued, token: 'token', fetcher: fixture.fetcher }),
    schedule: async () => {}, now: () => time,
  });
  await processor.run();
  assert.equal(queue[0].status, 'synced');
  assert.equal(queue[0].result.commitSha, fixture.patchBodies[0].sha);
  assert.match(queue[0].result.commitUrl, new RegExp(`${fixture.patchBodies[0].sha}$`));
});

test('existing solution updates atomically and an already-applied retry creates no objects', async () => {
  const oldReadme = updateReadme('', baseRecord(), target, 'solutions/1-two-sum.java').content;
  const changed = gitFixture({ readme: oldReadme, solution: 'old source' });
  const queued = enqueue([], baseRecord(), target, time).queue[0];
  const result = await syncSolution({ job: queued, token: 'token', fetcher: changed.fetcher });
  assert.equal(result.action, 'update');
  assert.equal(changed.commitBodies[0].message, 'sync: update Two Sum');
  const identical = gitFixture({ readme: oldReadme, solution: baseRecord().sourceCode });
  const unchanged = await syncSolution({ job: queued, token: 'token', fetcher: identical.fetcher });
  assert.equal(unchanged.action, 'unchanged');
  assert.equal(identical.calls.some((call) => call.method !== 'GET'), false);
});

test('branch conflict refetches the complete state and regenerates README before retrying', async () => {
  const fixture = gitFixture({ conflicts: 1 });
  const result = await syncSolution({ job: enqueue([], baseRecord(), target, time).queue[0], token: 'token', fetcher: fixture.fetcher });
  assert.equal(fixture.patchBodies.length, 2);
  assert.equal(fixture.treeBodies.length, 2);
  assert.ok(fixture.blobBodies[3].content.startsWith('Concurrent handwritten note\n\n'));
  assert.equal((fixture.blobBodies[3].content.match(/\| 1 \|/g) || []).length, 1);
  assert.equal(result.commitSha, fixture.patchBodies[1].sha);
});

test('conflict regeneration is strictly bounded', async () => {
  const fixture = gitFixture({ conflicts: MAX_CONFLICT_REBUILDS });
  await assert.rejects(syncSolution({ job: enqueue([], baseRecord(), target, time).queue[0], token: 'token', fetcher: fixture.fetcher }), (error) => error.code === 'CONFLICT');
  assert.equal(fixture.patchBodies.length, MAX_CONFLICT_REBUILDS);
});

test('failure before reference update leaves queue retrying without commit identity', async () => {
  const fixture = gitFixture({ failAt: 'commit' });
  let queue = enqueue([], baseRecord(), target, time).queue;
  const processor = createQueueProcessor({
    load: async () => queue,
    save: async (value) => { queue = structuredClone(value); },
    execute: (queued) => syncSolution({ job: queued, token: 'token', fetcher: fixture.fetcher }),
    schedule: async () => {}, now: () => time, random: () => 0.5,
  });
  await processor.run();
  assert.equal(fixture.patchBodies.length, 0);
  assert.equal(queue[0].status, 'retrying');
  assert.equal(queue[0].result, undefined);
  assert.equal(queue[0].lastError, 'GitHub is temporarily unavailable.');
});

test('invalid managed README fails terminally before creating Git objects and exposes only a safe error', async () => {
  const fixture = gitFixture({ readme: `${README_START}\ninvalid` });
  let queue = enqueue([], baseRecord(), target, time).queue;
  const processor = createQueueProcessor({
    load: async () => queue,
    save: async (value) => { queue = structuredClone(value); },
    execute: (queued) => syncSolution({ job: queued, token: 'token', fetcher: fixture.fetcher }),
    schedule: async () => {}, now: () => time,
  });
  await processor.run();
  assert.equal(queue[0].status, 'failed');
  assert.equal(queue[0].lastError, 'Repository README markers or managed content are invalid.');
  assert.equal(fixture.calls.some((call) => call.method !== 'GET'), false);
  assert.ok(!JSON.stringify(queue).includes(README_START));
});
