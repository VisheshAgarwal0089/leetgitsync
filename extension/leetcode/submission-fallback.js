import { parseProblemUrl, parseSubmitUrl } from './url.js';
import { getProblemSlug, getSubmissionId, isResultRequest } from './protocol.js';

const submissionListQuery = `query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!) {
  questionSubmissionList(offset: $offset, limit: $limit, lastKey: $lastKey, questionSlug: $questionSlug) {
    submissions { id title titleSlug status statusDisplay lang langName timestamp isPending frontendId }
  }
}`;
const submissionCodeQuery = `query submissionCode($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) { code }
}`;
const contestDetailsQuery = `query contestSubmissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    statusDisplay timestamp code lang { name verboseName }
    question { questionFrontendId titleSlug }
  }
}`;

async function graphql(fetcher, query, variables) {
  const response = await fetcher('https://leetcode.com/graphql/', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error('LEETCODE_GRAPHQL_FAILED');
  const payload = await response.json();
  if (payload?.errors?.length) throw new Error('LEETCODE_GRAPHQL_FAILED');
  return payload?.data;
}

function submittedAt(value) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function accepted(item) {
  const label = String(item?.statusDisplay ?? item?.status ?? '').trim().toLowerCase();
  return Number(item?.status) === 10 || label === 'accepted' || label === 'ac';
}

export async function resolveObservedSubmission({ submissionId, problemSlug, contestSlug = null, fetcher = fetch, diagnose = () => {} }) {
  diagnose({ stage: 'SUBMISSION_LOOKUP_STARTED', submissionId, slug: problemSlug });
  let list;
  try { list = await graphql(fetcher, submissionListQuery, { offset: 0, limit: 20, lastKey: null, questionSlug: problemSlug }); }
  catch (error) { if (!contestSlug) throw error; }
  const submissions = list?.questionSubmissionList?.submissions;
  const item = Array.isArray(submissions) ? submissions.find((entry) => String(entry?.id ?? '') === String(submissionId)) : null;
  // Active-contest submissions may not appear in the normal problem submission list.
  // Use ID-specific details instead; never infer acceptance from resource timing alone.
  if (!item && contestSlug) {
    let detail;
    try { detail = (await graphql(fetcher, contestDetailsQuery, { submissionId: Number(submissionId) }))?.submissionDetails; } catch { return { state: 'pending' }; }
    const status = String(detail?.statusDisplay ?? '').trim().toLowerCase();
    if (!status || ['pending', 'judging', 'started'].includes(status)) return { state: 'pending' };
    if (!['accepted', 'ac'].includes(status)) return { state: 'rejected' };
    const timestamp = submittedAt(detail.timestamp);
    const language = detail.lang?.name ?? detail.lang?.verboseName;
    if (detail.question?.titleSlug !== problemSlug || !timestamp || typeof detail.code !== 'string' || !detail.code.trim() || typeof language !== 'string' || !language.trim()) return { state: 'pending' };
    return { state: 'accepted', candidate: { submissionId: String(submissionId), problemSlug, contestSlug, questionId: String(detail.question.questionFrontendId ?? ''), language, sourceCode: detail.code, submittedAt: timestamp } };
  }
  if (!item || item.isPending) {
    diagnose({ stage: 'STATUS_NORMALIZED', submissionId, slug: problemSlug, status: item ? 'pending' : 'not-listed' });
    diagnose({ stage: 'SUBMISSION_LOOKUP_PENDING', submissionId, slug: problemSlug });
    return { state: 'pending' };
  }
  if (!accepted(item)) {
    diagnose({ stage: 'STATUS_NORMALIZED', submissionId, slug: problemSlug, status: String(item.statusDisplay ?? item.status ?? 'rejected') });
    diagnose({ stage: 'SUBMISSION_LOOKUP_REJECTED', submissionId, slug: problemSlug, status: String(item.statusDisplay ?? item.status ?? 'rejected') });
    return { state: 'rejected' };
  }
  diagnose({ stage: 'STATUS_NORMALIZED', submissionId, slug: problemSlug, status: 'accepted' });
  const details = await graphql(fetcher, submissionCodeQuery, { submissionId: Number(submissionId) });
  const sourceCode = details?.submissionDetails?.code;
  const timestamp = submittedAt(item.timestamp);
  const questionId = String(item.frontendId ?? '');
  const language = item.lang ?? item.langName;
  const slug = item.titleSlug ?? problemSlug;
  const missingFields = [];
  if (typeof sourceCode !== 'string' || !sourceCode.trim()) missingFields.push('sourceCode');
  if (!timestamp) missingFields.push('submittedAt');
  if ((!contestSlug || questionId) && !/^\d+$/.test(questionId)) missingFields.push('problemNumber');
  if (typeof language !== 'string' || !language.trim()) missingFields.push('language');
  if (slug !== problemSlug) missingFields.push('problemSlug');
  if (missingFields.length) {
    diagnose({ stage: 'METADATA_FAILED', submissionId, slug: problemSlug, missingFields });
    return { state: 'invalid' };
  }
  diagnose({ stage: 'SUBMISSION_CODE_FETCHED', submissionId, slug: problemSlug });
  return {
    state: 'accepted',
    candidate: { ...(contestSlug ? { contestSlug } : {}), submissionId: String(submissionId), questionId, problemSlug: slug, language, sourceCode, submittedAt: timestamp },
  };
}

export function installSubmissionFallback({ window, capture, fetcher = fetch, diagnose = () => {} }) {
  const inFlight = new Map();
  const rerun = new Map();
  const finalized = new Set();
  const observedContexts = new Map();
  let latestSubmission = null;
  async function inspect(url) {
    const submitPage = parseSubmitUrl(url);
    if (submitPage) {
      const current = parseProblemUrl(window.location.href);
      latestSubmission = current?.problemSlug === submitPage.problemSlug ? current : submitPage;
      return;
    }
    if (!isResultRequest(url)) return;
    const submissionId = getSubmissionId({}, url);
    const page = observedContexts.get(submissionId) ?? latestSubmission ?? parseProblemUrl(window.location.href);
    const problemSlug = page?.problemSlug;
    if (!submissionId || !problemSlug || finalized.has(submissionId)) return;
    observedContexts.set(submissionId, page);
    if (observedContexts.size > 100) observedContexts.delete(observedContexts.keys().next().value);
    if (inFlight.has(submissionId)) { rerun.set(submissionId, url); return; }
    diagnose({ stage: 'RESULT_RESOURCE_DETECTED', submissionId, slug: problemSlug });
    diagnose({ stage: 'SUBMISSION_RESPONSE_DETECTED', submissionId, slug: problemSlug });
    const operation = resolveObservedSubmission({ submissionId, problemSlug, contestSlug: page.contestSlug, fetcher, diagnose }).then(async (result) => {
      if (result.state === 'accepted') {
        await capture(result.candidate);
        finalized.add(submissionId);
      } else if (result.state === 'rejected' || result.state === 'invalid') finalized.add(submissionId);
    }).catch(() => {
      diagnose({ stage: 'DIAGNOSTIC_ERROR', submissionId, slug: problemSlug, errorCode: 'SUBMISSION_LOOKUP_FAILED' });
    }).finally(() => {
      inFlight.delete(submissionId);
      const nextUrl = rerun.get(submissionId);
      rerun.delete(submissionId);
      if (nextUrl && !finalized.has(submissionId)) void inspect(nextUrl);
    });
    inFlight.set(submissionId, operation);
    await operation;
  }
  const observer = new window.PerformanceObserver((list) => {
    for (const entry of list.getEntries()) void inspect(entry.name);
  });
  try { observer.observe({ type: 'resource' }); }
  catch { observer.observe({ entryTypes: ['resource'] }); }
  diagnose({ stage: 'FALLBACK_OBSERVER_READY', slug: getProblemSlug(window.location.href) });
  return { inspect, stop() { observer.disconnect(); inFlight.clear(); rerun.clear(); observedContexts.clear(); latestSubmission = null; } };
}
