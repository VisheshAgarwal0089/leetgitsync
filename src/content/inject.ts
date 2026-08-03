/**
 * LeetGitSync API Interceptor
 * 
 * Injected into the MAIN world (page context) to monkey-patch fetch and XMLHttpRequest.
 * This allows us to reliably intercept LeetCode's submission API calls to extract
 * the exact code submitted and the results, avoiding brittle DOM scraping.
 */

(function () {
  const LGS_PREFIX = '[LeetGitSync Interceptor]';
  console.log(`${LGS_PREFIX} Initialized.`);

  // Store submissions: Map<submission_id, { code, lang, question_id }>
  const pendingSubmissions = new Map<string, any>();

  // Helper to notify the content script (ISOLATED world)
  function notifyContentScript(type: string, payload: any) {
    try {
      window.postMessage(
        {
          source: 'LEETGITSYNC_INJECT',
          type,
          payload,
        },
        '*'
      );
    } catch (e) {
      console.warn(`${LGS_PREFIX} Failed to notify content script:`, e);
    }
  }

  const debugApi = {
    emitAccepted(payload: any) {
      notifyContentScript('SUBMISSION_ACCEPTED', payload);
    },
    getState() {
      return { pendingCount: pendingSubmissions.size };
    },
  };

  (window as Window & { __LGS_DEBUG__?: typeof debugApi }).__LGS_DEBUG__ = debugApi;

  // Helper to parse fetch requests
  async function handleFetchRequest(url: string, options: any) {
    try {
      if (!url) return;
      
      // 1. Intercept Submission POST
      // Example URL: https://leetcode.com/problems/two-sum/submit/
      if (url.includes('/submit/') && options?.method?.toUpperCase() === 'POST') {
        const bodyStr = typeof options.body === 'string' ? options.body : null;
        if (bodyStr) {
          try {
            const body = JSON.parse(bodyStr);
            if (body.typed_code && body.lang) {
              // We'll attach a unique ID to this request so we can map it to the response
              // Actually, we can intercept the response and read the submission_id
              return { isSubmit: true, body };
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    } catch (e) {
      console.error(`${LGS_PREFIX} Error handling fetch request:`, e);
    }
    return null;
  }

  // 1. Monkey-patch fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request | { url?: string }).url;
    const options = args[1] || {};

    let submitPayload: any = null;
    if (typeof url === 'string') {
      submitPayload = await handleFetchRequest(url, options);
    }

    try {
      const response = await originalFetch.apply(this, args);
      const clonedResponse = response.clone();

      if (typeof url === 'string') {
        if (submitPayload && submitPayload.isSubmit) {
          clonedResponse.json().then((resData) => {
            const submissionId = resData?.submission_id;
            if (submissionId) {
              console.log(`${LGS_PREFIX} Captured submission ${submissionId}`);
              pendingSubmissions.set(String(submissionId), {
                code: submitPayload.body?.typed_code ?? '',
                lang: submitPayload.body?.lang ?? 'unknown',
                question_id: submitPayload.body?.question_id,
              });
            }
          }).catch(() => {});
        }

        if (url.includes('/check/') && response.ok) {
          const match = url.match(/\/submissions\/detail\/(\d+)\/check/);
          const submissionId = match ? match[1] : null;

          if (submissionId && pendingSubmissions.has(submissionId)) {
            clonedResponse.json().then((resData) => {
              const submissionData = pendingSubmissions.get(submissionId);
              if (!submissionData) return;

              if (resData?.state === 'SUCCESS') {
                if (resData?.status_msg === 'Accepted') {
                  console.log(`${LGS_PREFIX} Submission ${submissionId} Accepted!`);

                  notifyContentScript('SUBMISSION_ACCEPTED', {
                    submissionId,
                    code: submissionData.code,
                    language: submissionData.lang,
                    questionId: submissionData.question_id,
                    stats: {
                      runtime: resData.status_runtime,
                      memory: resData.status_memory,
                      runtimePercentile: resData.runtime_percentile,
                      memoryPercentile: resData.memory_percentile,
                    }
                  });
                }

                pendingSubmissions.delete(submissionId);
              }
            }).catch(() => {});
          }
        }
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  // 2. Monkey-patch XMLHttpRequest (just in case LeetCode uses it for some requests)
  const originalXHR = window.XMLHttpRequest;
  class InterceptedXHR extends originalXHR {
    private _url: string = '';
    private _method: string = '';
    private _body: any = null;

    open(method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
      this._method = method;
      this._url = url.toString();
      return arguments.length >= 3 
        ? super.open(method, url, !!async, user, password)
        : super.open(method, url);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null) {
      this._body = body;

      this.addEventListener('load', () => {
        try {
          if (this._url.includes('/submit/') && this._method.toUpperCase() === 'POST' && typeof this._body === 'string') {
            const bodyJson = JSON.parse(this._body);
            if (bodyJson?.typed_code && bodyJson?.lang) {
              const resData = JSON.parse(this.responseText || '{}');
              if (resData?.submission_id) {
                pendingSubmissions.set(String(resData.submission_id), {
                  code: bodyJson.typed_code,
                  lang: bodyJson.lang,
                  question_id: bodyJson.question_id,
                });
              }
            }
          }

          if (this._url.includes('/check/')) {
            const match = this._url.match(/\/submissions\/detail\/(\d+)\/check/);
            const submissionId = match ? match[1] : null;

            if (submissionId && pendingSubmissions.has(submissionId)) {
              const resData = JSON.parse(this.responseText || '{}');
              const submissionData = pendingSubmissions.get(submissionId);
              if (!submissionData) return;

              if (resData?.state === 'SUCCESS') {
                if (resData?.status_msg === 'Accepted') {
                  notifyContentScript('SUBMISSION_ACCEPTED', {
                    submissionId,
                    code: submissionData.code,
                    language: submissionData.lang,
                    questionId: submissionData.question_id,
                    stats: {
                      runtime: resData.status_runtime,
                      memory: resData.status_memory,
                      runtimePercentile: resData.runtime_percentile,
                      memoryPercentile: resData.memory_percentile,
                    }
                  });
                }
                pendingSubmissions.delete(submissionId);
              }
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      });

      return super.send(body);
    }
  }
  
  window.XMLHttpRequest = InterceptedXHR;

})();
