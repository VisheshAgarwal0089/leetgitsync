// Background Service Worker — handles GitHub OAuth Device Flow polling and API calls.
// Runs persistently in MV3 service worker context with full network access.

const AUTH_DEBUG_PREFIX = '[LeetGitSync Auth]';

import {
  startDeviceFlow,
  pollForToken,
  getAuthenticatedUser,
  listRepositories,
  listBranches,
  createRepository,
  type DeviceFlowInit,
} from '@/lib/github';
import { saveGitHubAuth, getGitHubAuth, clearGitHubAuth } from '@/lib/storage';
import { handleLeetCodeSync } from './sync';

// ─── Message Types ─────────────────────────────────────────────────────────────

export type BgMessage =
  | { type: 'GITHUB_START_AUTH' }
  | { type: 'GITHUB_CANCEL_AUTH' }
  | { type: 'GITHUB_LOGOUT' }
  | { type: 'GITHUB_GET_AUTH' }
  | { type: 'GITHUB_LIST_REPOS' }
  | { type: 'GITHUB_LIST_BRANCHES'; owner: string; repo: string }
  | { type: 'GITHUB_CREATE_REPO'; name: string; isPrivate: boolean; description: string }
  | { type: 'LEETCODE_SYNC_REQUEST'; data: any }
  | { type: 'LEETCODE_GET_PROFILE' }
  | { type: 'LEETCODE_IMPORT_HISTORY' }
  | { type: 'APP_GET_STATE' };

export type BgResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

// Track ongoing auth so we can cancel it
let authAbortController: AbortController | null = null;

function notifyAuthState(type: 'GITHUB_AUTH_SUCCESS' | 'GITHUB_AUTH_ERROR', payload: Record<string, unknown>) {
  console.debug(`${AUTH_DEBUG_PREFIX} sending ${type} to extension pages`, payload);
  chrome.runtime.sendMessage({ type, ...payload }, () => {
    if (chrome.runtime.lastError) {
      console.warn(`${AUTH_DEBUG_PREFIX} failed to deliver ${type}`, chrome.runtime.lastError.message);
    } else {
      console.debug(`${AUTH_DEBUG_PREFIX} delivered ${type} to extension pages`);
    }
  });
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeetGitSync] Extension installed');
});

// ─── Message Handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: BgMessage, _sender, sendResponse: (r: BgResponse) => void) => {
    handleMessage(message)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[LeetGitSync] BG error:', msg);
        sendResponse({ success: false, error: msg });
      });

    // Return true to keep channel open for async response
    return true;
  }
);

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleMessage(msg: BgMessage): Promise<unknown> {
  switch (msg.type) {
    case 'GITHUB_START_AUTH':
      return handleStartAuth();

    case 'GITHUB_CANCEL_AUTH':
      return handleCancelAuth();

    case 'GITHUB_LOGOUT':
      return handleLogout();

    case 'GITHUB_GET_AUTH':
      return handleGetAuth();

    case 'GITHUB_LIST_REPOS':
      return handleListRepos();

    case 'GITHUB_LIST_BRANCHES':
      return handleListBranches(msg.owner, msg.repo);

    case 'GITHUB_CREATE_REPO':
      return handleCreateRepo(msg.name, msg.isPrivate, msg.description);

    case 'LEETCODE_SYNC_REQUEST':
      return handleLeetCodeSync(msg);

    case 'LEETCODE_GET_PROFILE':
      return handleLeetCodeProfile();

    case 'LEETCODE_IMPORT_HISTORY':
      return handleLeetCodeImportHistory();

    case 'APP_GET_STATE':
      return handleAppGetState();

    default:
      throw new Error('Unknown message type');
  }
}

async function handleStartAuth(): Promise<DeviceFlowInit> {
  console.debug(`${AUTH_DEBUG_PREFIX} step 1 -> starting auth flow in background worker`);

  if (authAbortController) {
    authAbortController.abort();
  }
  authAbortController = new AbortController();
  const signal = authAbortController.signal;

  try {
    const deviceFlow = await startDeviceFlow();
    console.debug(`${AUTH_DEBUG_PREFIX} step 2 -> device code received`, deviceFlow);

    const verificationUrl = deviceFlow.verification_uri_complete || deviceFlow.verification_uri;
    console.debug(`${AUTH_DEBUG_PREFIX} step 3 -> opening GitHub verification page`, { verificationUrl });

    await new Promise<void>((resolve, reject) => {
      chrome.tabs.create({ url: verificationUrl, active: true }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });

    console.debug(`${AUTH_DEBUG_PREFIX} step 4 -> verification page opened; starting polling loop`);

    (async () => {
      try {
        const tokenResponse = await pollForToken(deviceFlow.device_code, deviceFlow.interval, signal);

        if (signal.aborted) {
          console.debug(`${AUTH_DEBUG_PREFIX} auth aborted before token exchange completed`);
          return;
        }

        console.debug(`${AUTH_DEBUG_PREFIX} step 5 -> token received, exchanging for GitHub user profile`);
        const user = await getAuthenticatedUser(tokenResponse.access_token);
        console.debug(`${AUTH_DEBUG_PREFIX} step 6 -> storing GitHub credentials in extension storage`);
        await saveGitHubAuth(tokenResponse.access_token, user);

        console.debug(`${AUTH_DEBUG_PREFIX} step 7 -> notifying popup/dashboard that auth completed`);
        notifyAuthState('GITHUB_AUTH_SUCCESS', {
          user,
          token: tokenResponse.access_token,
        });
      } catch (err) {
        if (signal.aborted) {
          console.debug(`${AUTH_DEBUG_PREFIX} auth aborted while handling completion`);
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${AUTH_DEBUG_PREFIX} auth flow failed`, msg);
        notifyAuthState('GITHUB_AUTH_ERROR', { error: msg });
      } finally {
        authAbortController = null;
        console.debug(`${AUTH_DEBUG_PREFIX} step 8 -> auth flow finished; loading state should now be cleared`);
      }
    })();

    return deviceFlow;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${AUTH_DEBUG_PREFIX} device flow initialization failed`, msg);
    notifyAuthState('GITHUB_AUTH_ERROR', { error: msg });
    throw err;
  }
}

async function handleCancelAuth(): Promise<void> {
  if (authAbortController) {
    authAbortController.abort();
    authAbortController = null;
  }
}

async function handleLogout(): Promise<void> {
  await clearGitHubAuth();
}

async function handleGetAuth() {
  return getGitHubAuth();
}

async function handleListRepos() {
  const auth = await getGitHubAuth();
  if (!auth) throw new Error('Not authenticated with GitHub.');
  return listRepositories(auth.token);
}

async function handleListBranches(owner: string, repo: string) {
  const auth = await getGitHubAuth();
  if (!auth) throw new Error('Not authenticated with GitHub.');
  return listBranches(auth.token, owner, repo);
}

async function handleCreateRepo(name: string, isPrivate: boolean, description: string) {
  const auth = await getGitHubAuth();
  if (!auth) throw new Error('Not authenticated with GitHub.');
  const repo = await createRepository(auth.token, name, isPrivate, description);
  return repo;
}

async function handleLeetCodeProfile() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'LEETCODE_GET_PROFILE' });
      if (response?.success && response.data) {
        return {
          ...response.data,
          connected: Boolean(response.data.username),
        };
      }
    }
  } catch {
    // Fall back to the generic GraphQL lookup if the content script is unavailable.
  }

  try {
    const response = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query userStatus {
          matchedUser(username: "") {
            username
            profile {
              realName
            }
          }
        }`,
      }),
    });

    const data = await response.json().catch(() => ({}));
    const username = data?.data?.matchedUser?.username || null;
    const displayName = data?.data?.matchedUser?.profile?.realName || username || null;

    return {
      username,
      displayName,
      connected: Boolean(username),
      message: username ? 'LeetCode profile detected.' : 'LeetCode profile unavailable from this environment.',
    };
  } catch {
    return {
      username: null,
      displayName: null,
      connected: false,
      message: 'Unable to resolve LeetCode profile.',
    };
  }
}

async function handleLeetCodeImportHistory() {
  try {
    const profile = await handleLeetCodeProfile();
    if (!profile.connected) {
      return [];
    }

    const history = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    const data = await history.json().catch(() => ({}));
    const stats = data?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum || [];

    return stats.map((entry: any, index: number) => ({
      id: `imported-${index}`,
      title: entry.difficulty || 'Accepted problem',
      slug: entry.difficulty?.toLowerCase() || 'accepted-problem',
      difficulty: entry.difficulty === 'Hard' ? 'Hard' : entry.difficulty === 'Medium' ? 'Medium' : 'Easy',
      tags: ['Imported'],
      acceptanceRate: 0,
      solvedAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

async function handleAppGetState() {
  const state = await new Promise<Record<string, any>>((resolve) => {
    chrome.storage.local.get('githubsync-storage', (res) => resolve(res['githubsync-storage'] || {}));
  });

  if (!state) return {};

  try {
    const parsed = typeof state === 'string' ? JSON.parse(state) : state;
    return parsed?.state || parsed || {};
  } catch {
    return {};
  }
}

export {};
