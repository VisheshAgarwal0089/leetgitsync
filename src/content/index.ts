// Content script that runs on LeetCode problem pages

const LGS_PREFIX = '[LeetGitSync Content]';
console.log(`${LGS_PREFIX} Loaded in ISOLATED world.`);

function getCurrentLeetCodeProfile() {
  try {
    const link = Array.from(document.querySelectorAll('a[href^="/u/"]'))
      .map((anchor) => anchor.getAttribute('href'))
      .find((href): href is string => Boolean(href));

    if (link) {
      const username = link.replace(/^\/u\//, '').split('/')[0];
      if (username) {
        return {
          username,
          displayName: username,
          connected: true,
          message: 'LeetCode profile detected from the current page.',
        };
      }
    }
  } catch (error) {
    console.warn(`${LGS_PREFIX} Could not resolve LeetCode profile from DOM:`, error);
  }

  return {
    username: null,
    displayName: null,
    connected: false,
    message: 'LeetCode profile is not available from this page.',
  };
}

// 1. Inject the API Interceptor into the MAIN world
function injectInterceptor() {
  try {
    if ((window as Window & { __LGS_INJECTED__?: boolean }).__LGS_INJECTED__) {
      return;
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = chrome.runtime.getURL('src/content/inject.js');
    script.onload = function () {
      (this as HTMLScriptElement).remove();
      (window as Window & { __LGS_INJECTED__?: boolean }).__LGS_INJECTED__ = true;
    };
    script.onerror = function () {
      console.error(`${LGS_PREFIX} Failed to load injected script.`);
    };
    (document.head || document.documentElement).appendChild(script);
    console.log(`${LGS_PREFIX} Injected API interceptor.`);
  } catch (e) {
    console.error(`${LGS_PREFIX} Failed to inject API interceptor:`, e);
  }
}

// 2. Fetch Problem Details from LeetCode GraphQL API
async function fetchProblemDetails(problemSlug: string) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        content
        difficulty
        topicTags {
          name
        }
      }
    }
  `;

  try {
    const response = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { titleSlug: problemSlug },
        operationName: 'questionData',
      }),
    });

    const data = await response.json();
    return data?.data?.question;
  } catch (e) {
    console.error(`${LGS_PREFIX} Failed to fetch problem details:`, e);
    return null;
  }
}

// 3. Listen for messages from the injected script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'LEETCODE_GET_PROFILE') {
    sendResponse({ success: true, data: getCurrentLeetCodeProfile() });
    return true;
  }

  return false;
});

window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'LEETGITSYNC_INJECT') {
    return;
  }

  if (event.data.type === 'SUBMISSION_ACCEPTED') {
    console.log(`${LGS_PREFIX} Received accepted submission payload!`);
    const payload = event.data.payload;

    // Extract problem slug from URL (e.g. https://leetcode.com/problems/two-sum/...)
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    const problemSlug = match ? match[1] : null;

    if (!problemSlug) {
      console.error(`${LGS_PREFIX} Could not extract problem slug from URL.`);
      return;
    }

    // Fetch full problem details
    const problemDetails = await fetchProblemDetails(problemSlug);

    if (!problemDetails) {
      console.error(`${LGS_PREFIX} Failed to fetch problem details. Aborting sync.`);
      return;
    }

    const topicTags = Array.isArray(problemDetails.topicTags) ? problemDetails.topicTags : [];

    // Prepare final payload for background script
    const syncPayload = {
      type: 'LEETCODE_SYNC_REQUEST',
      data: {
        problem: {
          id: problemDetails.questionFrontendId ?? problemDetails.questionId ?? problemSlug,
          title: problemDetails.title ?? problemSlug,
          slug: problemDetails.titleSlug ?? problemSlug,
          difficulty: problemDetails.difficulty ?? 'Unknown',
          tags: topicTags.map((t: any) => t?.name).filter(Boolean),
          description: problemDetails.content ?? '',
        },
        submission: {
          id: payload.submissionId,
          code: payload.code ?? '',
          language: payload.language ?? 'unknown',
          stats: payload.stats ?? {},
        },
      },
    };

    // Send to background service worker for GitHub syncing
    console.log(`${LGS_PREFIX} Sending sync request to background worker...`, syncPayload);
    chrome.runtime.sendMessage(syncPayload);
  }
});

// Start
injectInterceptor();
