import { fetchContestTiming } from './contest.js';
import { normalizeRecord } from './record.js';

function missingFields(candidate, metadata) {
  const missing = [];
  const number = Number(metadata?.problemNumber ?? candidate?.questionId);
  if (!/^\d+$/.test(String(candidate?.submissionId ?? ''))) missing.push('submissionId');
  if (!Number.isSafeInteger(number) || number <= 0) missing.push('problemNumber');
  if (typeof metadata?.problemTitle !== 'string' || !metadata.problemTitle.trim()) missing.push('problemTitle');
  const slug = metadata?.problemSlug ?? candidate?.problemSlug;
  if (typeof slug !== 'string' || !slug.trim()) missing.push('problemSlug');
  if (typeof candidate?.sourceCode !== 'string' || !candidate.sourceCode.trim()) missing.push('sourceCode');
  if (typeof candidate?.language !== 'string' || !candidate.language.trim()) missing.push('language');
  if (!Number.isFinite(new Date(candidate?.submittedAt).getTime())) missing.push('submittedAt');
  return missing;
}

export function createCapturePipeline({ metadata, send, now = () => new Date().toISOString(), report = () => {}, diagnose = () => {}, page = () => null, contestTiming = fetchContestTiming }) {
  const completed = new Set();
  const inFlight = new Map();
  async function capture(candidate) {
    const id = String(candidate?.submissionId ?? '');
    if (completed.has(id)) return { duplicate: true };
    if (inFlight.has(id)) return inFlight.get(id);
    const context = page();
    // A result may arrive after SPA navigation. Keep its observed origin; current
    // contest pages still force a hold for candidates without contest context.
    const contestSlug = context?.problemSlug === candidate.problemSlug ? context.contestSlug ?? candidate.contestSlug : candidate.contestSlug ?? context?.contestSlug;
    const operation = (async () => {
      let phase = 'metadata';
      try {
        const details = await metadata.get(candidate.problemSlug, contestSlug);
        const missing = missingFields(candidate, details);
        if (missing.length) diagnose({ stage: 'METADATA_FAILED', submissionId: id, slug: candidate?.problemSlug, missingFields: missing });
        else diagnose({ stage: 'METADATA_EXTRACTED', submissionId: id, slug: candidate?.problemSlug });
        const contest = contestSlug ? await contestTiming(contestSlug) : null;
        const record = normalizeRecord({ ...candidate, ...(contest ? { contest } : {}) }, details, now());
        phase = 'message';
        diagnose({ stage: 'CAPTURE_MESSAGE_SENT', submissionId: id, slug: record.problemSlug });
        const result = await send(record);
        completed.add(id);
        return result;
      } catch (error) {
        diagnose({ stage: 'DIAGNOSTIC_ERROR', submissionId: id, slug: candidate?.problemSlug, errorCode: phase === 'message' ? 'CAPTURE_MESSAGE_FAILED' : 'METADATA_OR_RECORD_INVALID' });
        report('LeetGitSync could not capture the accepted submission.');
        throw error;
      } finally { inFlight.delete(id); }
    })();
    inFlight.set(id, operation);
    return operation;
  }
  return { capture, navigation() { metadata.navigation(); } };
}
