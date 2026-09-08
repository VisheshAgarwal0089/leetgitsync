import {
  createAcceptedCandidate, getProblemSlug, getSubmissionId, getSubmissionStatus,
  isResultRequest, isSubmissionRequest, isTerminalResult, parseSubmitBody,
} from './protocol.js';

export function installNetworkObserver(window, onAccepted, now = () => new Date().toISOString(), onDiagnostic = () => {}) {
  const pending = new Map();
  const emitted = new Set();
  const absoluteUrl = (value) => {
    try { return new URL(typeof value === 'string' ? value : value?.url, window.location.href).href; } catch { return ''; }
  };
  function consumeResult(result, url) {
    const id = getSubmissionId(result, url);
    onDiagnostic({ stage: 'SUBMISSION_RESPONSE_DETECTED', submissionId: id });
    onDiagnostic({ stage: 'STATUS_NORMALIZED', submissionId: id, status: getSubmissionStatus(result) || String(result?.state ?? 'unknown').toLowerCase() });
    const candidate = createAcceptedCandidate(result, url, pending, now());
    if (candidate && !emitted.has(candidate.submissionId)) {
      emitted.add(candidate.submissionId);
      onAccepted(candidate);
    }
    if (id && isTerminalResult(result)) pending.delete(id);
  }
  async function requestDetails(input, init = {}) {
    const url = absoluteUrl(input);
    const RequestClass = window.Request;
    const request = RequestClass && input instanceof RequestClass;
    const method = init.method ?? (request ? input.method : 'GET');
    if (!isSubmissionRequest(url, method)) return null;
    let body = init.body;
    if (body == null && request) {
      try { body = await input.clone().text(); } catch { return null; }
    }
    const parsed = parseSubmitBody(typeof body === 'string' ? body : '');
    const problemSlug = getProblemSlug(url);
    return parsed && problemSlug ? { ...parsed, problemSlug, submittedAt: now() } : null;
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const detailsPromise = requestDetails(args[0], args[1]);
    const response = await originalFetch.apply(this, args);
    const url = absoluteUrl(args[0]);
    if (isSubmissionRequest(url, args[1]?.method ?? args[0]?.method ?? 'GET')) {
      onDiagnostic({ stage: 'FETCH_INTERCEPTED', slug: getProblemSlug(url), status: 'submit' });
      void Promise.all([detailsPromise, response.clone().json()]).then(([details, data]) => {
        const id = getSubmissionId(data);
        if (id && details) {
          pending.set(id, details);
          onDiagnostic({ stage: 'SUBMIT_CONTEXT_STORED', submissionId: id, slug: details.problemSlug });
        } else onDiagnostic({ stage: 'DIAGNOSTIC_ERROR', submissionId: id, slug: getProblemSlug(url), errorCode: 'SUBMIT_CONTEXT_INVALID' });
      }).catch(() => onDiagnostic({ stage: 'DIAGNOSTIC_ERROR', slug: getProblemSlug(url), errorCode: 'SUBMIT_RESPONSE_PARSE_FAILED' }));
    } else if (isResultRequest(url) && response.ok) {
      onDiagnostic({ stage: 'FETCH_INTERCEPTED', submissionId: getSubmissionId({}, url), status: 'result' });
      void response.clone().json().then((data) => consumeResult(data, url)).catch(() => onDiagnostic({ stage: 'DIAGNOSTIC_ERROR', submissionId: getSubmissionId({}, url), errorCode: 'RESULT_RESPONSE_PARSE_FAILED' }));
    }
    return response;
  };
  const observedFetch = window.fetch;

  const NativeXHR = window.XMLHttpRequest;
  class ObservedXHR extends NativeXHR {
    open(method, url, ...rest) {
      this.__lgsMethod = method;
      this.__lgsUrl = absoluteUrl(url);
      return super.open(method, url, ...rest);
    }
    send(body) {
      const submittedAt = now();
      const submit = isSubmissionRequest(this.__lgsUrl, this.__lgsMethod) ? parseSubmitBody(typeof body === 'string' ? body : '') : null;
      this.addEventListener('load', () => {
        try {
          const data = JSON.parse(this.responseText || '{}');
          if (submit) {
            const id = getSubmissionId(data);
            const problemSlug = getProblemSlug(this.__lgsUrl);
            if (id && problemSlug) {
              pending.set(id, { ...submit, problemSlug, submittedAt });
              onDiagnostic({ stage: 'SUBMIT_CONTEXT_STORED', submissionId: id, slug: problemSlug });
            }
          } else if (isResultRequest(this.__lgsUrl) && this.status >= 200 && this.status < 300) consumeResult(data, this.__lgsUrl);
        } catch { /* Ignore non-JSON LeetCode responses. */ }
      });
      return super.send(body);
    }
  }
  window.XMLHttpRequest = ObservedXHR;
  onDiagnostic({ stage: 'PAGE_OBSERVER_READY', slug: getProblemSlug(window.location.href) });
  return () => {
    if (window.fetch === observedFetch) window.fetch = originalFetch;
    if (window.XMLHttpRequest === ObservedXHR) window.XMLHttpRequest = NativeXHR;
    pending.clear(); emitted.clear();
  };
}