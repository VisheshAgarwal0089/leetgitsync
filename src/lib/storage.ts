// Typed wrapper around chrome.storage.local for secure token storage.
// Tokens are stored in chrome.storage.local which is sandboxed per-extension
// and never exposed to web page scripts.

import type { GitHubUser } from './github';

const SHARED_AUTH_KEY = 'githubsync-auth';
const LEGACY_KEYS = {
  TOKEN: 'gh_token',
  USER: 'gh_user',
} as const;

export interface StoredAuth {
  token: string;
  user: GitHubUser;
}

interface StoredAuthRecord extends StoredAuth {
  storedAt: number;
}

async function readStorage(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

async function writeStorage(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

async function removeStorage(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

export async function saveGitHubAuth(token: string, user: GitHubUser): Promise<void> {
  console.debug('[LeetGitSync Auth] storing GitHub credentials in chrome.storage.local', { tokenLength: token?.length, login: user?.login });
  const record: StoredAuthRecord = {
    token,
    user,
    storedAt: Date.now(),
  };

  await writeStorage({
    [SHARED_AUTH_KEY]: record,
    [LEGACY_KEYS.TOKEN]: token,
    [LEGACY_KEYS.USER]: user,
  });
}

export async function getGitHubAuth(): Promise<StoredAuth | null> {
  console.debug('[LeetGitSync Auth] reading GitHub credentials from chrome.storage.local');
  const result = await readStorage([SHARED_AUTH_KEY, LEGACY_KEYS.TOKEN, LEGACY_KEYS.USER]);
  const sharedAuth = result[SHARED_AUTH_KEY] as StoredAuthRecord | undefined;

  if (sharedAuth?.token && sharedAuth.user) {
    return { token: sharedAuth.token, user: sharedAuth.user };
  }

  const token = result[LEGACY_KEYS.TOKEN] as string | undefined;
  const user = result[LEGACY_KEYS.USER] as GitHubUser | undefined;

  if (token && user) {
    return { token, user };
  }

  return null;
}

export async function clearGitHubAuth(): Promise<void> {
  console.debug('[LeetGitSync Auth] clearing GitHub credentials from chrome.storage.local');
  await removeStorage([SHARED_AUTH_KEY, LEGACY_KEYS.TOKEN, LEGACY_KEYS.USER]);
}
