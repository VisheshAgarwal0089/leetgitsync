import { CAPTURE_EVENT } from './protocol.js';
import { DIAGNOSTIC_EVENT, normalizeDiagnostic } from '../lib/diagnostics.js';

export const BRIDGE_PROTOCOL = 'leetgitsync-bridge-v2';
export const MAX_BRIDGE_BYTES = 1_100_000;

export function createBridgeNonce(cryptoObject = globalThis.crypto) {
  const bytes = new Uint8Array(24);
  cryptoObject.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function validBridgeNonce(value) { return typeof value === 'string' && /^[a-f0-9]{48}$/.test(value); }

export function bridgeEnvelope(nonce, sequence, payload) {
  return { protocol: BRIDGE_PROTOCOL, nonce, sequence, payload };
}

export function validCandidateShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = new Set(['submissionId', 'questionId', 'problemSlug', 'language', 'sourceCode', 'submittedAt', 'acceptedAt']);
  if (!Object.keys(value).every((key) => allowed.has(key))) return false;
  if (!/^\d{1,30}$/.test(String(value.submissionId ?? '')) || !/^\d{1,30}$/.test(String(value.questionId ?? ''))) return false;
  if (typeof value.problemSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.problemSlug) || value.problemSlug.length > 200) return false;
  if (typeof value.language !== 'string' || !value.language.trim() || value.language.length > 60) return false;
  if (typeof value.sourceCode !== 'string' || !value.sourceCode.trim() || value.sourceCode.length > 1_000_000) return false;
  if (!Number.isFinite(new Date(value.submittedAt).getTime())) return false;
  return value.acceptedAt === undefined || Number.isFinite(new Date(value.acceptedAt).getTime());
}

export function validateBridgeEnvelope(value, nonce, expectedSequence, { diagnosticsEnabled = false } = {}) {
  if (!value || value.protocol !== BRIDGE_PROTOCOL || value.nonce !== nonce || value.sequence !== expectedSequence || !Number.isSafeInteger(value.sequence) || value.sequence < 0) return null;
  let size;
  try { size = new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return null; }
  if (size > MAX_BRIDGE_BYTES || !value.payload || typeof value.payload !== 'object') return null;
  if (value.payload.type === 'BRIDGE_ACK') return expectedSequence === 0 ? value.payload : null;
  if (value.payload.type === CAPTURE_EVENT && Object.keys(value.payload).length === 2 && validCandidateShape(value.payload.candidate)) return value.payload;
  if (diagnosticsEnabled && value.payload.type === DIAGNOSTIC_EVENT && Object.keys(value.payload).length === 2 && normalizeDiagnostic(value.payload.diagnostic)) return value.payload;
  return null;
}
