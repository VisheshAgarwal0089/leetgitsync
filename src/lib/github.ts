// GitHub API Service — Device Flow OAuth + REST API

export const GITHUB_CLIENT_ID = 'Ov23liXPQo5wDZqbHFsd';
export const GITHUB_SCOPES = 'repo user read:org';

export interface DeviceFlowInit {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  followers: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commit: {
    sha: string;
  };
}

// ─── Device Flow ──────────────────────────────────────────────────────────────

export async function startDeviceFlow(): Promise<DeviceFlowInit> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_SCOPES,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub Device Flow init failed: ${res.status}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data as DeviceFlowInit;
}

export async function pollForToken(
  deviceCode: string,
  interval: number,
  signal: AbortSignal
): Promise<GitHubTokenResponse> {
  let currentDelayMs = Math.max(interval, 5) * 1000;

  while (!signal.aborted) {
    console.debug('[LeetGitSync Auth] waiting before next device-flow poll', {
      deviceCode,
      intervalSeconds: interval,
      waitMs: currentDelayMs,
    });
    await delay(currentDelayMs);

    if (signal.aborted) break;

    const requestBody = {
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    };

    console.debug('[LeetGitSync Auth] sending device-flow poll request', requestBody);

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await res.text();
    let data: Record<string, unknown> & { error_description?: string; interval?: number; access_token?: string } = {};

    try {
      data = responseText ? JSON.parse(responseText) as Record<string, unknown> & { error_description?: string; interval?: number; access_token?: string } : {};
    } catch (error) {
      console.warn('[LeetGitSync Auth] failed to parse poll response payload', error);
      data = { raw: responseText } as Record<string, unknown> & { error_description?: string; interval?: number; access_token?: string };
    }

    console.debug('[LeetGitSync Auth] received device-flow poll response', {
      status: res.status,
      body: data,
    });

    if (data.access_token) {
      console.debug('[LeetGitSync Auth] token exchange succeeded');
      return {
        access_token: data.access_token,
        token_type: (data.token_type as string | undefined) ?? 'bearer',
        scope: (data.scope as string | undefined) ?? '',
      } as GitHubTokenResponse;
    }

    if (data.error === 'slow_down') {
      const nextInterval = Math.max(Number(data.interval ?? interval) || 5, 5);
      currentDelayMs = nextInterval * 1000;
      console.debug('[LeetGitSync Auth] GitHub requested slower polling', { nextIntervalSeconds: nextInterval });
      continue;
    }

    if (data.error === 'authorization_pending') {
      console.debug('[LeetGitSync Auth] authorization still pending');
      continue;
    }

    if (data.error === 'expired_token') {
      console.error('[LeetGitSync Auth] device code expired');
      throw new Error('Device code expired. Please try again.');
    }

    if (data.error === 'access_denied') {
      console.error('[LeetGitSync Auth] authorization denied by user');
      throw new Error('Authorization was denied.');
    }

    if (data.error) {
      console.error('[LeetGitSync Auth] polling returned error', data.error);
      throw new Error(data.error_description || String(data.error));
    }
  }

  console.debug('[LeetGitSync Auth] polling loop ended without completion');
  throw new Error('Authorization cancelled.');
}

// ─── GitHub REST API ───────────────────────────────────────────────────────────

export async function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  const res = await githubFetch('/user', token);
  return res as GitHubUser;
}

export async function listRepositories(token: string): Promise<GitHubRepo[]> {
  const allRepos: GitHubRepo[] = [];
  let page = 1;

  while (true) {
    const repos = await githubFetch(
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator`,
      token
    ) as GitHubRepo[];

    allRepos.push(...repos);

    if (repos.length < 100) break;
    page++;
  }

  return allRepos;
}

export async function listBranches(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubBranch[]> {
  const branches = await githubFetch(
    `/repos/${owner}/${repo}/branches?per_page=100`,
    token
  );
  return branches as GitHubBranch[];
}

export async function createRepository(
  token: string,
  name: string,
  isPrivate: boolean,
  description: string
): Promise<GitHubRepo> {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    }),
  });

  if (res.status === 422) {
    throw new Error(`Repository "${name}" already exists or name is invalid.`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to create repository: ${res.status}`);
  }

  return res.json() as Promise<GitHubRepo>;
}

export async function uploadFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  commitMessage: string
): Promise<any> {
  // First, check if the file already exists to get its SHA
  let sha = undefined;
  try {
    const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      sha = fileData.sha;
    }
  } catch (e) {
    // Ignore, file doesn't exist yet
  }

  // Base64 encode the content (Unicode safe)
  const base64Content = btoa(encodeURIComponent(content).replace(/%([0-9A-F]{2})/g, (_, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  }));

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: base64Content,
      branch,
      sha, // Required if updating an existing file
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to upload file: ${res.status}`);
  }

  return res.json();
}

export async function uploadFileWithRetry(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  commitMessage: string,
  attempts = 3
): Promise<any> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await uploadFile(token, owner, repo, branch, path, content, commitMessage);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        throw error;
      }

      const delayMs = 1000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Upload failed');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function githubFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 401) {
    throw new Error('GitHub token is invalid or expired. Please reconnect.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }

  return res.json();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
