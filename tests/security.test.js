import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bridgeEnvelope, createBridgeNonce, validateBridgeEnvelope, validCandidateShape } from '../extension/leetcode/bridge.js';
import { validateRuntimeMessage, validateUiResponse } from '../extension/lib/messages.js';
import { normalizeRecord } from '../extension/leetcode/record.js';
import { buildSolutionPath } from '../extension/sync/solution-path.js';
import { buildGitHubFileUrl, escapeMarkdown, splitManagedReadme } from '../extension/sync/readme.js';
import { PublicError, safeError } from '../extension/lib/errors.js';
import { createStorage, keys } from '../extension/lib/storage.js';

const at = '2026-09-09T00:00:00.000Z';
const candidate = { submissionId: '123', questionId: '1', problemSlug: 'two-sum', language: 'java', sourceCode: 'class Solution {}', submittedAt: at };
const record = normalizeRecord(candidate, { problemNumber: 1, problemTitle: 'Two Sum', problemSlug: 'two-sum', topics: ['Array'], companies: [] }, at);
const target = { owner: 'test-owner', repository: 'test-repo', branch: 'main', directory: 'solutions' };

test('runtime messages accept only known sender-specific schemas', () => {
  assert.ok(validateRuntimeMessage({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record }, 'leetcode'));
  assert.equal(validateRuntimeMessage({ type: 'DISCONNECT' }, 'leetcode'), null);
  assert.equal(validateRuntimeMessage({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record }, 'extension'), null);
  assert.ok(validateRuntimeMessage({ type: 'GET_STATE', data: undefined }, 'extension'));
  assert.equal(validateRuntimeMessage({ type: 'GET_STATE', data: { injected: true } }, 'extension'), null);
  assert.equal(validateRuntimeMessage({ type: 'UNKNOWN' }, 'extension'), null);
  assert.equal(validateRuntimeMessage({ type: 'LEETGITSYNC_DIAGNOSTIC', data: { stage: 'CONTENT_SCRIPT_LOADED' } }, 'leetcode'), null);
  assert.ok(validateRuntimeMessage({ type: 'LEETGITSYNC_DIAGNOSTIC', data: { stage: 'CONTENT_SCRIPT_LOADED' } }, 'leetcode', { diagnosticsEnabled: true }));
});

test('bridge nonce, channel identity, replay sequence and forged events are rejected', () => {
  const nonce = createBridgeNonce({ getRandomValues(bytes) { bytes.fill(7); } });
  const accepted = bridgeEnvelope(nonce, 0, { type: 'BRIDGE_ACK' });
  assert.ok(validateBridgeEnvelope(accepted, nonce, 0));
  assert.equal(validateBridgeEnvelope(accepted, nonce, 1), null);
  assert.equal(validateBridgeEnvelope({ ...accepted, nonce: '0'.repeat(48) }, nonce, 0), null);
  assert.equal(validateBridgeEnvelope(bridgeEnvelope(nonce, 0, { type: 'FORGED', candidate }), nonce, 0), null);
  assert.equal(validCandidateShape({ ...candidate, problemSlug: '../private' }), false);
});

test('oversized and duplicate-key capture shapes fail before background handling', () => {
  assert.equal(validateRuntimeMessage({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: { ...record, sourceCode: 'x'.repeat(1_000_001) } }, 'leetcode'), null);
  assert.equal(validateRuntimeMessage({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: { ...record, token: 'hidden' } }, 'leetcode'), null);
  assert.equal(validCandidateShape({ ...candidate, sourceCode: 'x'.repeat(1_000_001) }), false);
});

test('metadata, paths, Markdown, and GitHub URLs reject injection', () => {
  assert.throws(() => normalizeRecord({ ...candidate, problemSlug: '../x' }, { problemNumber: 1, problemTitle: 'x', topics: [], companies: [] }, at));
  assert.throws(() => buildSolutionPath(record, '../private'));
  assert.throws(() => buildGitHubFileUrl(target, 'solutions/../private.js'));
  assert.throws(() => buildGitHubFileUrl({ ...target, branch: 'main?x=1' }, 'solutions/1-two-sum.js'));
  assert.equal(escapeMarkdown('[x](javascript:alert(1))'), '&#91;x&#93;&#40;javascript:alert&#40;1&#41;&#41;');
  assert.throws(() => splitManagedReadme('<!-- LEETGITSYNC:START -->\n<!-- LEETGITSYNC:START -->\n<!-- LEETGITSYNC:END -->'));
});

test('public errors and UI responses redact secret-bearing objects', () => {
  assert.equal(safeError(new Error(`github_${'pat'}_${'A'.repeat(30)}`)), 'The operation could not complete. Check your connection and try again.');
  assert.equal(safeError(new PublicError('class Solution { secret }')), 'The operation could not complete. Check your connection and try again.');
  assert.equal(validateUiResponse({ success: true, data: { token: 'private' } }), false);
  assert.equal(validateUiResponse({ success: true, data: { sourceCode: 'private' } }), false);
  assert.equal(validateUiResponse({ success: false, error: 'Safe failure.' }), true);
});

test('disconnect removes every authentication and Device Flow key while preserving queue data', async () => {
  const data = { [keys.auth]: { token: 'private' }, [keys.flow]: { device_code: 'private' }, [keys.error]: 'error', gh_token: 'legacy', gh_user: {}, 'githubsync-device-flow': {}, [keys.queue]: [{ id: '1' }] };
  const local = { async get(name) { return { [name]: data[name] }; }, async set(values) { Object.assign(data, values); }, async remove(names) { for (const name of Array.isArray(names) ? names : [names]) delete data[name]; } };
  await createStorage(local).disconnect();
  for (const key of [keys.auth, keys.flow, keys.error, 'gh_token', 'gh_user', 'githubsync-device-flow']) assert.equal(data[key], undefined);
  assert.deepEqual(data[keys.queue], [{ id: '1' }]);
});

test('manifest source uses strict MV3 CSP and minimum permissions', async () => {
  const source = await readFile('wxt.config.js', 'utf8');
  assert.match(source, /permissions: \['storage', 'alarms'\]/);
  assert.match(source, /host_permissions: \['https:\/\/github\.com\/\*', 'https:\/\/api\.github\.com\/\*'\]/);
  assert.match(source, /default-src 'none'/);
  assert.match(source, /object-src 'none'/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.doesNotMatch(source, /'unsafe-eval'|'unsafe-inline'/);
});
