// Background Service Worker — handles GitHub OAuth Device Flow polling and API calls.
// Runs persistently in MV3 service worker context with full network access.

const AUTH_DEBUG_PREFIX = '[LeetGitSync Auth]';
console.log('[LGS Debug] Background service worker loaded');

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
  | { type: 'GITHUB_CONNECT_PAT'; token: string }
  | { type: 'GITHUB_VERIFY_TOKEN' }
  | { type: 'LEETCODE_SYNC_REQUEST'; data: any }
  | { type: 'LEETCODE_GET_PROFILE' }
  | { type: 'LEETCODE_IMPORT_HISTORY' }
  | { type: 'APP_GET_STATE' };

export type BgResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

// Track ongoing auth so we can cancel it
let authAbortController: AbortController | null = null;

function notifyAuthState(type: 'GITHUB_AUTH_SUCCESS' | 'GITHUB_AUTH_ERROR' | 'GITHUB_DEVICE_FLOW', payload: Record<string, unknown>) {
  console.debug(`${AUTH_DEBUG_PREFIX} sending ${type} to extension pages`, payload);
  // Broadcast to all extension views (popup, dashboard, etc.)
  chrome.runtime.sendMessage({ type, ...payload }, () => {
    // Suppress "no listeners" error — the popup might not be open
    void chrome.runtime.lastError;
  });
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeetGitSync] Extension installed');
});

// ─── Message Handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: BgMessage, _sender, sendResponse: (r: BgResponse) => void) => {
    console.log('[LGS Debug] BG received message:', message?.type, message);
    handleMessage(message)
      .then((data) => {
        console.log('[LGS Debug] BG sending success response:', message?.type);
        sendResponse({ success: true, data });
      })
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

    // ── Persist device flow so any extension page can read it on open ──────
    await chrome.storage.local.set({ 'githubsync-device-flow': deviceFlow });

    // ── Broadcast to all currently-open extension views ────────────────────
    // (popup, options/dashboard page, etc.)
    notifyAuthState('GITHUB_DEVICE_FLOW', { deviceFlow });

    // ── Open the GitHub authorization page automatically ───────────────────
    // This ensures the user sees the authorization page even if the dialog
    // isn't visible (e.g. when triggered from the extension popup).
    const authUrl = deviceFlow.verification_uri_complete || deviceFlow.verification_uri;
    console.debug(`${AUTH_DEBUG_PREFIX} step 3 -> opening GitHub authorization tab`, { authUrl });
    chrome.tabs.create({ url: authUrl }).catch((e) => {
      console.warn(`${AUTH_DEBUG_PREFIX} could not open auth tab`, e);
    });

    // ── Start polling in the background ───────────────────────────────────
    console.debug(`${AUTH_DEBUG_PREFIX} step 4 -> starting polling loop`);
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

        // Clear the pending device flow data now that auth is complete
        await chrome.storage.local.remove('githubsync-device-flow');

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
        await chrome.storage.local.remove('githubsync-device-flow');
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
    await chrome.storage.local.remove('githubsync-device-flow').catch(() => {});
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

const LGS_PROFILE_STORAGE_KEY = 'lgs-leetcode-profile';
const LGS_HISTORY_STORAGE_KEY = 'lgs-leetcode-history';

async function handleLeetCodeProfile() {
  console.log('[LGS Debug] handleLeetCodeProfile called');

  // 1. Check if the content script has already stored a profile
  try {
    const stored = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get(LGS_PROFILE_STORAGE_KEY, (r) => resolve(r));
    });
    const cached = stored[LGS_PROFILE_STORAGE_KEY] as { username?: string | null; connected?: boolean } | undefined;
    console.log('[LGS Debug] Storage check:', cached);
    if (cached?.username && cached?.connected) {
      console.log('[LGS Debug] Returning cached profile:', cached.username);
      return {
        username: cached.username,
        displayName: cached.username,
        connected: true,
        message: `LeetCode profile detected: ${cached.username}`,
      };
    }
  } catch (e) {
    console.warn('[LGS Debug] Storage read failed:', e);
  }

  // 2. No cached profile — ask the content script on any open LeetCode tab
  console.log('[LGS Debug] No cached profile, trying to message content script...');
  try {
    const tabs = await chrome.tabs.query({ url: ['https://leetcode.com/*', 'https://*.leetcode.com/*'] });
    console.log('[LGS Debug] Found LeetCode tabs:', tabs.length);
    for (const tab of tabs) {
      console.log('[LGS Debug] Trying tab:', tab.id, tab.url);
      if (tab?.id && tab.url && /leetcode\.com/.test(tab.url)) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'LEETCODE_GET_PROFILE' });
          console.log('[LGS Debug] Content script response:', response);
          if (response?.success && response.data) {
            return {
              ...response.data,
              connected: Boolean(response.data.username),
            };
          }
        } catch (e) {
          console.warn('[LGS Debug] Failed to message tab:', tab.id, e);
        }
      }
    }
  } catch (e) {
    console.warn('[LGS Debug] Tabs query failed:', e);
  }

  console.log('[LGS Debug] No profile found anywhere');
  return {
    username: null,
    displayName: null,
    connected: false,
    message: 'No LeetCode tab found. Please open a LeetCode page and try again.',
  };
}

async function handleLeetCodeImportHistory() {
  // 1. Check if the content script has already stored history
  try {
    const stored = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get(LGS_HISTORY_STORAGE_KEY, (r) => resolve(r));
    });
    const cached = stored[LGS_HISTORY_STORAGE_KEY];
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } catch {
    // Ignore storage errors.
  }

  // 2. No cached history — ask the content script to fetch and store it
  try {
    const tabs = await chrome.tabs.query({ url: ['https://leetcode.com/*', 'https://*.leetcode.com/*'] });
    for (const tab of tabs) {
      if (tab?.id && tab.url && /leetcode\.com/.test(tab.url)) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'LEETCODE_IMPORT_HISTORY' });
          if (response?.success && Array.isArray(response.data)) {
            return response.data;
          }
        } catch {
          // This tab's content script may not be ready; try the next tab.
        }
      }
    }
  } catch {
    // No LeetCode tabs found.
  }
  return [];
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
