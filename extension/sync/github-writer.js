import { keys } from '../lib/storage.js';
import { buildSolutionPath } from './solution-path.js';
import { updateReadme } from './readme.js';

const apiRoot = 'https://api.github.com';
export const MAX_CONFLICT_REBUILDS = 3;

export class SyncError extends Error {
  constructor(code, status, retryAt = null) {
    super('GitHub synchronization request failed.');
    this.name = 'SyncError';
    this.code = code;
    this.status = status;
    this.retryAt = retryAt;
  }
}

export function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function strictEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function repositoryBase(target) {
  return `/repos/${strictEncode(target.owner)}/${strictEncode(target.repository)}`;
}

function retryAt(response) {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  return Number.isFinite(reset) && reset > 0 ? reset * 1000 : null;
}

function responseError(response, context) {
  const status = response.status;
  if ((status === 409 || status === 422) && context === 'ref-update') return new SyncError('CONFLICT', status);
  if (status === 401) return new SyncError('AUTH_EXPIRED', status);
  if (status === 429 || (status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) return new SyncError('RATE_LIMITED', status, retryAt(response));
  if (status === 403) return new SyncError('FORBIDDEN', status);
  if (status === 404) return new SyncError(context === 'ref' ? 'BRANCH_NOT_FOUND' : 'REPOSITORY_NOT_FOUND', status);
  if (status === 409) return new SyncError('CONFLICT', status);
  if (status === 400 || status === 422) return new SyncError('INVALID_DATA', status);
  return new SyncError(status >= 500 ? 'SERVER_ERROR' : 'GITHUB_ERROR', status);
}

async function request(fetcher, path, token, options = {}, context = 'read') {
  let response;
  try {
    response = await fetcher(`${apiRoot}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      credentials: 'omit',
      redirect: 'error',
    });
  } catch {
    throw new SyncError('NETWORK_ERROR', 0);
  }
  if (!response.ok) throw responseError(response, context);
  try { return await response.json(); } catch { throw new SyncError('INVALID_DATA', response.status); }
}

function validSha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/i.test(value)) throw new SyncError('INVALID_DATA', 200);
  return value;
}

function commitUrl(target, sha) {
  return `https://github.com/${strictEncode(target.owner)}/${strictEncode(target.repository)}/commit/${validSha(sha)}`;
}

function validTree(value) {
  if (!Array.isArray(value?.tree) || value.truncated) throw new SyncError('INVALID_DATA', 200);
  return value;
}

async function getTree(fetcher, target, sha, token) {
  return validTree(await request(fetcher, `${repositoryBase(target)}/git/trees/${validSha(sha)}`, token));
}

async function findBlob(fetcher, target, rootTree, path, token) {
  const parts = path.split('/');
  let tree = rootTree;
  for (let index = 0; index < parts.length; index += 1) {
    const entry = tree.tree.find((item) => item.path === parts[index]);
    if (!entry) return null;
    if (index === parts.length - 1) return entry.type === 'blob' ? validSha(entry.sha) : null;
    if (entry.type !== 'tree') return null;
    tree = await getTree(fetcher, target, entry.sha, token);
  }
  return null;
}

async function readBlob(fetcher, target, sha, token) {
  const blob = await request(fetcher, `${repositoryBase(target)}/git/blobs/${validSha(sha)}`, token);
  if (blob?.encoding !== 'base64' || typeof blob.content !== 'string') throw new SyncError('INVALID_DATA', 200);
  try { return decodeBase64(blob.content); } catch { throw new SyncError('INVALID_DATA', 200); }
}

async function createBlob(fetcher, target, content, token) {
  const blob = await request(fetcher, `${repositoryBase(target)}/git/blobs`, token, {
    method: 'POST', body: JSON.stringify({ content, encoding: 'utf-8' }),
  }, 'write');
  return validSha(blob?.sha);
}

async function atomicAttempt(fetcher, target, record, token) {
  const base = repositoryBase(target);
  const refPath = `${base}/git/ref/heads/${strictEncode(target.branch)}`;
  const ref = await request(fetcher, refPath, token, {}, 'ref');
  const headSha = validSha(ref?.object?.sha);
  const commit = await request(fetcher, `${base}/git/commits/${headSha}`, token);
  const rootTree = await getTree(fetcher, target, commit?.tree?.sha, token);
  const path = buildSolutionPath(record, target.directory);
  const readmeSha = await findBlob(fetcher, target, rootTree, 'README.md', token);
  const solutionSha = await findBlob(fetcher, target, rootTree, path, token);
  const currentReadme = readmeSha ? await readBlob(fetcher, target, readmeSha, token) : '';
  const currentSolution = solutionSha ? await readBlob(fetcher, target, solutionSha, token) : null;
  let nextReadme;
  try { nextReadme = updateReadme(currentReadme, record, target, path).content; } catch (error) {
    if (error?.code === 'README_INVALID') throw new SyncError('README_INVALID', 0);
    throw error;
  }
  if (currentSolution === record.sourceCode && currentReadme === nextReadme) {
    return { commitSha: headSha, commitUrl: commitUrl(target, headSha), path, action: 'unchanged' };
  }
  const action = solutionSha ? 'update' : 'add';
  const solutionBlobSha = await createBlob(fetcher, target, record.sourceCode, token);
  const readmeBlobSha = await createBlob(fetcher, target, nextReadme, token);
  const tree = await request(fetcher, `${base}/git/trees`, token, {
    method: 'POST', body: JSON.stringify({
      base_tree: validSha(commit?.tree?.sha),
      tree: [
        { path, mode: '100644', type: 'blob', sha: solutionBlobSha },
        { path: 'README.md', mode: '100644', type: 'blob', sha: readmeBlobSha },
      ],
    }),
  }, 'write');
  const nextCommit = await request(fetcher, `${base}/git/commits`, token, {
    method: 'POST', body: JSON.stringify({ message: `sync: ${action} ${record.problemTitle}`, tree: validSha(tree?.sha), parents: [headSha] }),
  }, 'write');
  const nextCommitSha = validSha(nextCommit?.sha);
  const updated = await request(fetcher, `${base}/git/refs/heads/${strictEncode(target.branch)}`, token, {
    method: 'PATCH', body: JSON.stringify({ sha: nextCommitSha, force: false }),
  }, 'ref-update');
  if (validSha(updated?.object?.sha) !== nextCommitSha) throw new SyncError('CONFLICT', 409);
  return { commitSha: nextCommitSha, commitUrl: commitUrl(target, nextCommitSha), path, action };
}

export async function syncSolution({ job, token, fetcher = fetch, maxConflictRebuilds = MAX_CONFLICT_REBUILDS }) {
  if (typeof token !== 'string' || !token) throw new SyncError('AUTH_REQUIRED', 0);
  const target = job?.target;
  if (!target?.owner || !target?.repository || !target?.branch || !target?.directory || !Number.isInteger(maxConflictRebuilds) || maxConflictRebuilds < 1 || maxConflictRebuilds > MAX_CONFLICT_REBUILDS) throw new SyncError('INVALID_DATA', 0);
  let conflict;
  for (let attempt = 0; attempt < maxConflictRebuilds; attempt += 1) {
    try { return await atomicAttempt(fetcher, target, job.record, token); } catch (error) {
      if (!(error instanceof SyncError) || error.code !== 'CONFLICT') throw error;
      conflict = error;
    }
  }
  throw conflict;
}

export function createGitHubSolutionExecutor({ store, fetcher = fetch }) {
  return async (job) => {
    const auth = await store.get(keys.auth);
    return syncSolution({ job, token: auth?.token, fetcher });
  };
}
