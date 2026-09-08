import { PublicError } from './errors.js';

// Preserved public OAuth application identifier from src/lib/github.ts; not a secret.
export const GITHUB_CLIENT_ID = 'Ov23liXPQo5wDZqbHFsd';
// Device Flow OAuth needs repo for private repositories. user/read:org were unnecessary.
export const GITHUB_SCOPES = 'repo';
async function oauth(path, values) {
  const response = await fetch(`https://github.com/login/${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, ...values }).toString(),
    signal: AbortSignal.timeout(20000),
    credentials: 'omit',
  });
  if (!response.ok) throw new PublicError('GitHub authorization is unavailable. Please try again.');
  return response.json();
}
export async function startDeviceFlow() {
  const data = await oauth('device/code', { scope: GITHUB_SCOPES });
  if (typeof data.device_code !== 'string' || typeof data.user_code !== 'string' || data.verification_uri !== 'https://github.com/login/device' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new PublicError('GitHub returned an invalid authorization response. Please try again.');
  return { device_code: data.device_code, user_code: data.user_code, verification_uri: data.verification_uri, expires_in: data.expires_in, interval: Math.max(Number(data.interval) || 5, 5) };
}
export async function pollForToken(deviceCode) {
  return oauth('oauth/access_token', { device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
}
export async function githubFetch(path, token, { notFoundMessage = 'GitHub resource was not found, or your account cannot access it.' } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(20000), credentials: 'omit', redirect: 'error',
  });
  if (response.status === 401) throw new PublicError('GitHub authentication expired. Disconnect and reconnect.');
  if (response.status === 403 || response.status === 429) throw new PublicError('GitHub denied access or rate limited the request. Check repository access and try again later.');
  if (response.status === 404) throw new PublicError(notFoundMessage);
  if (!response.ok) throw new PublicError('GitHub request failed. Please try again later.');
  return response.json();
}
export async function getAuthenticatedUser(token) {
  const user = await githubFetch('/user', token);
  if (!user?.id || typeof user.login !== 'string') throw new PublicError('GitHub returned an invalid account response.');
  return { id: user.id, login: user.login };
}
export async function validateRepository(config, token) {
  const path = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}`;
  const repo = await githubFetch(path, token, { notFoundMessage: 'Repository not found, or your account cannot access it.' });
  if (!repo.permissions?.push || repo.archived || repo.disabled) throw new PublicError('Choose an active repository where your account has write access.');
  await githubFetch(`${path}/branches/${encodeURIComponent(config.branch)}`, token, { notFoundMessage: 'Target branch was not found. Check its name; an empty repository needs an initial commit first.' });
  return { validatedAt: Date.now() };
}
