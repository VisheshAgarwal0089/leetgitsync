import { DIAGNOSTIC_STAGES, keys, STORAGE_LIMITS } from './storage.js';

export const DIAGNOSTIC_MESSAGE = 'LEETGITSYNC_DIAGNOSTIC';
export const DIAGNOSTIC_EVENT = 'LEETGITSYNC_DIAGNOSTIC_V1';
export const BRIDGE_EVENT = 'LEETGITSYNC_BRIDGE_V1';
export const BRIDGE_READY_EVENT = 'LEETGITSYNC_BRIDGE_READY_V1';
export const DIAGNOSTIC_LIMIT = STORAGE_LIMITS.diagnostics;

const fields = new Set(['submissionId', 'problemNumber', 'problemTitle', 'problemSlug', 'sourceCode', 'language', 'submittedAt']);

function safeText(value, pattern, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, maxLength);
  return pattern.test(text) ? text : null;
}

// Only allow fixed status data into storage. Never persist page payloads,
// exception messages, source code, credentials, or request headers here.
export function normalizeDiagnostic(value, at = new Date().toISOString()) {
  const stage = DIAGNOSTIC_STAGES.has(value?.stage) ? value.stage : null;
  if (!stage) return null;
  const diagnostic = { stage, at: new Date(at).toISOString() };
  const slug = safeText(value?.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 200);
  const submissionId = safeText(String(value?.submissionId ?? ''), /^\d{1,30}$/, 30);
  const status = safeText(value?.status, /^[a-z0-9_ :.-]+$/i, 50);
  const errorCode = safeText(value?.errorCode, /^[A-Z0-9_]+$/, 60);
  const missingFields = Array.isArray(value?.missingFields)
    ? [...new Set(value.missingFields.filter((field) => fields.has(field)))].slice(0, fields.size)
    : [];
  if (slug) diagnostic.slug = slug;
  if (submissionId) diagnostic.submissionId = submissionId;
  if (status) diagnostic.status = status.toLowerCase();
  if (missingFields.length) diagnostic.missingFields = missingFields;
  if (errorCode) diagnostic.errorCode = errorCode;
  return diagnostic;
}

export async function appendDiagnostic(store, value, now = Date.now) {
  const diagnostic = normalizeDiagnostic(value, new Date(now()).toISOString());
  if (!diagnostic) return null;
  const stored = await store.get(keys.diagnostics);
  const current = Array.isArray(stored) ? stored : [];
  await store.set(keys.diagnostics, [diagnostic, ...current].slice(0, DIAGNOSTIC_LIMIT));
  return diagnostic;
}
