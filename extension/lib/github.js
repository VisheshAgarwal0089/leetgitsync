import { PublicError } from './errors.js';

export const GITHUB_CLIENT_ID = 'Ov23liXPQo5wDZqbHFsd';
export const GITHUB_SCOPES = 'repo';

export function githubRateLimitReset(response, now = Date.now()) {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) return reset * 1000;
  const retryAfter = response.headers.get('retry-after');
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1000;
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) && date > now ? date : null;
}

function isRateLimited(response) {
  return response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
}

async function fetchSafely(url, options) {
  try { return await fetch(url, options); } catch {
    throw new PublicError('Network connection unavailable.', 'NETWORK_ERROR');
  }
}

async function oauth(path, values) {
  const response = await fetchSafely(`https://github.com/login/${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, ...values }).toString(),
    signal: AbortSignal.timeout(20_000),
    credentials: 'omit',
  });
  if (isRateLimited(response)) throw new PublicError('GitHub rate limited authorization. Retrying automatically.', 'RATE_LIMITED', githubRateLimitReset(response));
  if (!response.ok) throw new PublicError('GitHub authorization is unavailable. Please try again.', 'AUTH_UNAVAILABLE');
  try { return await response.json(); } catch { throw new PublicError('GitHub returned an invalid authorization response. Please try again.', 'INVALID_DATA'); }
}

export async function startDeviceFlow() {
  const data = await oauth('device/code', { scope: GITHUB_SCOPES });
  if (typeof data.device_code !== 'string' || typeof data.user_code !== 'string' || data.verification_uri !== 'https://github.com/login/device' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new PublicError('GitHub returned an invalid authorization response. Please try again.', 'INVALID_DATA');
  }
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expires_in: data.expires_in,
    interval: Math.max(Number(data.interval) || 5, 5),
  };
}

export async function pollForToken(deviceCode) {
  return oauth('oauth/access_token', { device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
}

export async function githubFetch(path, token, { notFoundMessage = 'GitHub resource was not found, or your account cannot access it.' } = {}) {
  const response = await fetchSafely(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(20_000),
    credentials: 'omit',
    redirect: 'error',
  });
  if (response.status === 401) throw new PublicError('GitHub authentication expired. Disconnect and reconnect.', 'AUTH_EXPIRED');
  if (isRateLimited(response)) throw new PublicError('GitHub rate limit reached. Try again after the reset time.', 'RATE_LIMITED', githubRateLimitReset(response));
  if (response.status === 403) throw new PublicError('GitHub denied access. Check repository permissions.', 'FORBIDDEN');
  if (response.status === 404) throw new PublicError(notFoundMessage, 'REPOSITORY_NOT_FOUND');
  if (!response.ok) throw new PublicError('GitHub request failed. Please try again later.', response.status >= 500 ? 'SERVER_ERROR' : 'GITHUB_ERROR');
  try { return await response.json(); } catch { throw new PublicError('GitHub returned an invalid response.', 'INVALID_DATA'); }
}

export async function getAuthenticatedUser(token) {
  const user = await githubFetch('/user', token);
  if (!user?.id || typeof user.login !== 'string') throw new PublicError('GitHub returned an invalid account response.', 'INVALID_DATA');
  return { id: user.id, login: user.login };
}

export async function validateRepository(config, token) {
  const path = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}`;
  const repo = await githubFetch(path, token, { notFoundMessage: 'Repository not found, or your account cannot access it.' });
  if (!repo.permissions?.push || repo.archived || repo.disabled) throw new PublicError('Choose an active repository where your account has write access.', 'FORBIDDEN');
  try {
    await githubFetch(`${path}/branches/${encodeURIComponent(config.branch)}`, token, { notFoundMessage: 'Target branch was not found. Check its name; an empty repository needs an initial commit first.' });
  } catch (error) {
    if (error?.code === 'REPOSITORY_NOT_FOUND') error.code = 'BRANCH_NOT_FOUND';
    throw error;
  }
  return { validatedAt: Date.now() };
}
