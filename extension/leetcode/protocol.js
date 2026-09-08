export const CAPTURE_EVENT = 'LEETGITSYNC_SUBMISSION_RESULT_V1';

const acceptedLabels = new Set(['accepted', 'ac']);
const pendingStates = new Set(['pending', 'started', 'preparing', 'compiling', 'running_tests', 'judging']);
const failedStates = new Set(['failure', 'failed', 'revoked']);

export function getSubmissionStatus(payload) {
  const value = payload?.status_msg ?? payload?.statusMessage ?? payload?.status?.display_name ?? payload?.status?.name ?? payload?.status;
  if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  const code = payload?.status_code ?? payload?.statusCode ?? payload?.status?.id;
  if (Number(code) === 10) return 'accepted';
  return Number.isSafeInteger(Number(code)) ? `code:${Number(code)}` : '';
}

export function isAcceptedResult(payload) {
  const status = getSubmissionStatus(payload);
  if (!acceptedLabels.has(status)) return false;
  const state = typeof payload?.state === 'string' ? payload.state.trim().toLowerCase() : '';
  return !pendingStates.has(state) && !failedStates.has(state);
}

export function isTerminalResult(payload) {
  const state = typeof payload?.state === 'string' ? payload.state.trim().toLowerCase() : '';
  if (pendingStates.has(state)) return false;
  if (state === 'success' || failedStates.has(state)) return true;
  const status = getSubmissionStatus(payload);
  return Boolean(status) && !pendingStates.has(status);
}

export function getSubmissionId(payload, url = '') {
  const direct = payload?.submission_id ?? payload?.submissionId ?? payload?.submission?.id ?? payload?.id;
  if (/^\d+$/.test(String(direct ?? ''))) return String(direct);
  const match = String(url).match(/\/submissions?\/detail\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export function getProblemSlug(url) {
  try {
    const parsed = new URL(url, 'https://leetcode.com');
    if (parsed.origin !== 'https://leetcode.com') return null;
    return parsed.pathname.match(/^\/problems\/([a-z0-9-]+)(?:\/|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function parseSubmitBody(body) {
  if (typeof body !== 'string' || !body) return null;
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    try { value = Object.fromEntries(new URLSearchParams(body)); } catch { return null; }
  }
  const sourceCode = value?.typed_code ?? value?.source_code ?? value?.code;
  const language = value?.lang ?? value?.language;
  if (typeof sourceCode !== 'string' || typeof language !== 'string') return null;
  const questionId = value?.question_id ?? value?.questionId;
  return { sourceCode, language, questionId: /^\d+$/.test(String(questionId ?? '')) ? String(questionId) : null };
}

export function isSubmissionRequest(url, method) {
  return String(method).toUpperCase() === 'POST' && /^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/submit\/?(?:\?|$)/.test(String(url));
}

export function isResultRequest(url) {
  return /^https:\/\/leetcode\.com\/submissions?\/detail\/\d+\/(?:v2\/)?check\/?(?:\?|$)/.test(String(url));
}

export function createAcceptedCandidate(result, url, pending, observedAt) {
  const submissionId = getSubmissionId(result, url);
  const submission = submissionId ? pending.get(submissionId) : null;
  if (!submission || !isAcceptedResult(result)) return null;
  return { ...submission, submissionId, submittedAt: submission.submittedAt, acceptedAt: observedAt };
}
