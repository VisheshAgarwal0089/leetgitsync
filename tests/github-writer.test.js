import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSolutionPath, encodeRepositoryPath, extensionForLanguage } from '../extension/sync/solution-path.js';
import { createGitHubSolutionExecutor, decodeBase64, encodeBase64, SyncError, syncSolution } from '../extension/sync/github-writer.js';
import { createQueueProcessor, enqueue, queueSummary } from '../extension/sync/queue.js';
import { keys } from '../extension/lib/storage.js';

const now = Date.parse('2026-09-07T00:00:00.000Z');
const target = { owner: 'VisheshAgarwal0089', repository: 'leetgitsync', branch: 'v2', directory: 'solutions' };
const record = (language = 'Java', sourceCode = 'class Solution {}') => ({
  schemaVersion: 1, platform: 'leetcode', submissionId: '123456789', problemNumber: 1,
  problemTitle: 'Two Sum', problemSlug: 'two-sum', problemUrl: 'https://leetcode.com/problems/two-sum/',
  language, sourceCode, topics: ['Array'], companies: [],
  submittedAt: new Date(now).toISOString(), capturedAt: new Date(now + 1).toISOString(),
});
const job = (language, sourceCode) => enqueue([], record(language, sourceCode), target, now).queue[0];
const sha = 'a'.repeat(40);

function jsonResponse(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

test('language mapping and flat paths are deterministic and safe', () => {
  assert.equal(extensionForLanguage('C++'), 'cpp');
  assert.equal(extensionForLanguage('Python3'), 'py');
  assert.equal(extensionForLanguage('JavaScript'), 'js');
  assert.equal(extensionForLanguage('MS SQL Server'), 'sql');
  assert.equal(extensionForLanguage('Pandas'), 'py');
  assert.equal(buildSolutionPath(record(), 'solutions/nested'), 'solutions/nested/1-two-sum.java');
  assert.equal(encodeRepositoryPath('solutions/a b/1-two-sum.cpp'), 'solutions/a%20b/1-two-sum.cpp');
  assert.throws(() => buildSolutionPath({ ...record(), problemSlug: '../two-sum' }, 'solutions'), (error) => error.code === 'INVALID_DATA');
  assert.throws(() => buildSolutionPath(record('Brainfuck'), 'solutions'), (error) => error.code === 'INVALID_DATA');
});

test('UTF-8 source code survives GitHub base64 encoding exactly', () => {
  const source = '// café 🚀\nconst answer = "λ";\n';
  assert.equal(decodeBase64(encodeBase64(source)), source);
});

test('different languages use different files', () => {
  assert.equal(buildSolutionPath(record('Java'), 'solutions'), 'solutions/1-two-sum.java');
  assert.equal(buildSolutionPath(record('C++'), 'solutions'), 'solutions/1-two-sum.cpp');
  assert.equal(buildSolutionPath(record('Python3'), 'solutions'), 'solutions/1-two-sum.py');
});

test('GitHub failures are classified without exposing response bodies or credentials', async () => {
  for (const [status, headers, code] of [[401, {}, 'AUTH_EXPIRED'], [403, {}, 'FORBIDDEN'], [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' }, 'RATE_LIMITED'], [409, {}, 'CONFLICT'], [500, {}, 'SERVER_ERROR']]) {
    const fetcher = async () => jsonResponse(status, { message: 'sensitive API response' }, headers);
    await assert.rejects(syncSolution({ job: job('Java'), token: 'secret-token', fetcher }), (error) => {
      assert.ok(error instanceof SyncError); assert.equal(error.code, code);
      assert.ok(!error.message.includes('sensitive')); assert.ok(!error.message.includes('secret-token'));
      if (code === 'RATE_LIMITED') assert.equal(error.retryAt, 2_000_000_000_000);
      return true;
    });
  }
});

test('executor reads the background-only token and reports missing authentication safely', async () => {
  const store = { async get(key) { assert.equal(key, keys.auth); return undefined; } };
  const execute = createGitHubSolutionExecutor({ store, fetcher: async () => assert.fail('fetch must not run') });
  await assert.rejects(execute(job('Java')), (error) => error.code === 'AUTH_REQUIRED');
});

test('queue stores commit identity before declaring a job synchronized', async () => {
  let queue = [job('Java')];
  const snapshots = [];
  const result = { commitSha: sha, commitUrl: `https://github.com/o/r/commit/${sha}`, path: 'solutions/1-two-sum.java', action: 'add' };
  const processor = createQueueProcessor({
    load: async () => queue,
    save: async (value) => { queue = structuredClone(value); snapshots.push(structuredClone(queue)); },
    execute: async () => result,
    schedule: async () => {}, now: () => now,
  });
  await processor.run();
  assert.equal(queue[0].status, 'synced');
  assert.deepEqual(queue[0].result, result);
  assert.ok(snapshots.some((snapshot) => snapshot[0].status === 'syncing'));
  assert.equal(queueSummary(queue).lastSynced.commitUrl, result.commitUrl);
});
