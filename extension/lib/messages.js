import { normalizeDiagnostic } from './diagnostics.js';

export const MAX_CAPTURE_MESSAGE_BYTES = 1_100_000;
const MAX_CONTROL_MESSAGE_BYTES = 8_192;
const uiTypes = new Set(['GET_STATE', 'START_AUTH', 'CANCEL_AUTH', 'DISCONNECT', 'VERIFY_AUTH', 'SAVE_CONFIG', 'VALIDATE_CONFIG', 'RETRY_SYNC_JOB']);
const recordFields = new Set(['schemaVersion', 'platform', 'submissionId', 'problemNumber', 'problemTitle', 'problemSlug', 'problemUrl', 'language', 'sourceCode', 'topics', 'companies', 'submittedAt', 'capturedAt', 'contest']);

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]';
}

function byteLength(value) {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return Infinity; }
}

function hasOnly(value, allowed) {
  return plainObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function validConfigShape(value) {
  return hasOnly(value, new Set(['owner', 'repository', 'branch', 'directory'])) && Object.values(value).every((item) => typeof item === 'string');
}

export function validRecordShape(value) {
  return hasOnly(value, recordFields) && value.schemaVersion === 1 && value.platform === 'leetcode' &&
    typeof value.sourceCode === 'string' && value.sourceCode.length <= 1_000_000 &&
    Array.isArray(value.topics) && Array.isArray(value.companies);
}

export function validateRuntimeMessage(message, senderKind, { diagnosticsEnabled = false } = {}) {
  if (!plainObject(message) || typeof message.type !== 'string') return null;
  if (senderKind === 'leetcode') {
    if (message.type === 'CAPTURE_LEETCODE_SUBMISSION' && hasOnly(message, new Set(['type', 'data'])) && validRecordShape(message.data) && byteLength(message) <= MAX_CAPTURE_MESSAGE_BYTES) return message;
    if (diagnosticsEnabled && message.type === 'LEETGITSYNC_DIAGNOSTIC' && hasOnly(message, new Set(['type', 'data'])) && normalizeDiagnostic(message.data) && byteLength(message) <= MAX_CONTROL_MESSAGE_BYTES) return message;
    return null;
  }
  if (senderKind !== 'extension' || !uiTypes.has(message.type) || byteLength(message) > MAX_CONTROL_MESSAGE_BYTES || !hasOnly(message, new Set(['type', 'data']))) return null;
  if (['GET_STATE', 'START_AUTH', 'CANCEL_AUTH', 'DISCONNECT', 'VERIFY_AUTH'].includes(message.type)) return message.data == null ? message : null;
  if (message.type === 'VALIDATE_CONFIG') return validConfigShape(message.data) ? message : null;
  if (message.type === 'SAVE_CONFIG') return hasOnly(message.data, new Set(['config', 'confirmPending'])) && validConfigShape(message.data.config) && (message.data.confirmPending === undefined || typeof message.data.confirmPending === 'boolean') ? message : null;
  if (message.type === 'RETRY_SYNC_JOB') return hasOnly(message.data, new Set(['jobId'])) && /^\d{1,30}$/.test(String(message.data.jobId ?? '')) ? message : null;
  return null;
}

export function validateUiResponse(response) {
  if (!plainObject(response) || typeof response.success !== 'boolean' || byteLength(response) > MAX_CAPTURE_MESSAGE_BYTES) return false;
  if (!response.success) return typeof response.error === 'string' && response.error.length <= 300 && Object.keys(response).every((key) => ['success', 'error'].includes(key));
  const forbidden = new Set(['token', 'access_token', 'device_code', 'sourcecode', 'cookie', 'authorization', 'headers']);
  const inspect = (value, depth = 0) => {
    if (depth > 12) return false;
    if (Array.isArray(value)) return value.length <= 1_100 && value.every((item) => inspect(item, depth + 1));
    if (!plainObject(value)) return value == null || ['string', 'number', 'boolean'].includes(typeof value);
    return Object.entries(value).every(([key, item]) => !forbidden.has(key.toLowerCase()) && inspect(item, depth + 1));
  };
  return Object.keys(response).every((key) => ['success', 'data'].includes(key)) && inspect(response.data);
}
