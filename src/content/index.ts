// Content script that runs on all LeetCode pages
// Stores profile data in chrome.storage.local so the background can read it directly.

const LGS_PREFIX = '[LeetGitSync Content]';
const STORAGE_KEY_PROFILE = 'lgs-leetcode-profile';
const STORAGE_KEY_HISTORY = 'lgs-leetcode-history';
console.log(`${LGS_PREFIX} Loaded in ISOLATED world.`);

// ─── Profile Detection ────────────────────────────────────────────────────────

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

// On every page load: detect profile and store it for the background script
async function detectAndStoreProfile() {
  console.log(`${LGS_PREFIX} detectAndStoreProfile called`);

  // Try DOM first
  let profile = getCurrentLeetCodeProfile();
  console.log(`${LGS_PREFIX} DOM profile:`, profile);

  // If DOM didn't give a username, try GraphQL
  if (!profile.username) {
    console.log(`${LGS_PREFIX} No DOM username, trying GraphQL...`);
    profile = (await fetchLeetCodeProfileViaGraphQL()) || profile;
    console.log(`${LGS_PREFIX} GraphQL result:`, profile);
  }

  // Store in chrome.storage.local so background can read it
  try {
    chrome.storage.local.set({ [STORAGE_KEY_PROFILE]: profile }, () => {
      console.log(`${LGS_PREFIX} Successfully stored profile in chrome.storage.local:`, profile);
    });
  } catch (e) {
    console.warn(`${LGS_PREFIX} Failed to store profile:`, e);
  }

  return profile;
}

async function fetchLeetCodeProfileViaGraphQL() {
  try {
    const response = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        query: `query { userStatus { username isSignedIn } }`,
      }),
    });
    const data = await response.json().catch(() => ({}));
    const username = data?.data?.userStatus?.username || null;
    const isSignedIn = data?.data?.userStatus?.isSignedIn || false;
    if (isSignedIn && username) {
      return { username, displayName: username, connected: true, message: `LeetCode profile detected: ${username}` };
    }
  } catch (e) {
    console.warn(`${LGS_PREFIX} GraphQL profile fetch failed:`, e);
  }
  return null;
}

// ─── Import History ───────────────────────────────────────────────────────────

async function fetchAndStoreHistory() {
  const profile = await fetchLeetCodeProfileViaGraphQL();
  if (!profile?.username) {
    chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: [] });
    return [];
  }

  try {
    const response = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        query: `query userSolvedProblems($username: String!) {
          matchedUser(username: $username) {
            submitStatsGlobal {
              acSubmissionNum {
                difficulty
                count
                submissions
              }
            }
          }
        }`,
        variables: { username: profile.username },
      }),
    });
    const data = await response.json().catch(() => ({}));
    const stats = data?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum || [];
    const history = stats.map((entry: any, index: number) => ({
      id: `imported-${index}`,
      title: entry.difficulty || 'Accepted problem',
      slug: entry.difficulty?.toLowerCase() || 'accepted-problem',
      difficulty: entry.difficulty === 'Hard' ? 'Hard' : entry.difficulty === 'Medium' ? 'Medium' : 'Easy',
      tags: ['Imported'],
      acceptanceRate: 0,
      solvedAt: new Date().toISOString(),
    }));
    chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: history });
    console.log(`${LGS_PREFIX} Stored import history:`, history.length, 'entries');
    return history;
  } catch (e) {
    console.warn(`${LGS_PREFIX} History fetch failed:`, e);
    chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: [] });
    return [];
  }
}

// ─── API Interceptor Injection (problem pages only) ──────────────────────────

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

// ─── Fetch Problem Details ────────────────────────────────────────────────────

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
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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

// ─── Message Listener (backup for direct queries) ─────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'LEETCODE_GET_PROFILE') {
    // Return cached profile from storage, or detect fresh
    chrome.storage.local.get(STORAGE_KEY_PROFILE, (result) => {
      const cached = result[STORAGE_KEY_PROFILE];
      if (cached?.username) {
        sendResponse({ success: true, data: cached });
      } else {
        // Detect fresh and store
        detectAndStoreProfile().then((profile) => {
          sendResponse({ success: true, data: profile });
        });
      }
    });
    return true; // keep channel open for async
  }

  if (message?.type === 'LEETCODE_IMPORT_HISTORY') {
    fetchAndStoreHistory().then((history) => {
      sendResponse({ success: true, data: history });
    });
    return true; // keep channel open for async
  }

  return false;
});

// ─── Listen for accepted submissions from inject script ───────────────────────

window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'LEETGITSYNC_INJECT') {
    return;
  }

  if (event.data.type === 'SUBMISSION_ACCEPTED') {
    console.log(`${LGS_PREFIX} Received accepted submission payload!`);
    const payload = event.data.payload;

    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    const problemSlug = match ? match[1] : null;

    if (!problemSlug) {
      console.error(`${LGS_PREFIX} Could not extract problem slug from URL.`);
      return;
    }

    const problemDetails = await fetchProblemDetails(problemSlug);

    if (!problemDetails) {
      console.error(`${LGS_PREFIX} Failed to fetch problem details. Aborting sync.`);
      return;
    }

    const topicTags = Array.isArray(problemDetails.topicTags) ? problemDetails.topicTags : [];

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

    console.log(`${LGS_PREFIX} Sending sync request to background worker...`, syncPayload);
    chrome.runtime.sendMessage(syncPayload);
  }
});

// ─── Startup ──────────────────────────────────────────────────────────────────

// Always try to detect and store the profile on page load
console.log(`${LGS_PREFIX} Starting profile detection on page load...`);
detectAndStoreProfile().then((p) => {
  console.log(`${LGS_PREFIX} Profile detection complete:`, p);
});

// Only inject the API interceptor on problem pages
if (/\/problems\//.test(window.location.pathname)) {
  injectInterceptor();
}
