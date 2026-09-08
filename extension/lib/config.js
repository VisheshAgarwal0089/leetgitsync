import { PublicError } from './errors.js';

export const emptyConfig = { owner: '', repository: '', branch: '', directory: 'solutions' };
export function validateConfig(input) {
  const config = Object.fromEntries(Object.keys(emptyConfig).map((key) => [key, typeof input?.[key] === 'string' ? input[key].trim() : '']));
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(config.owner)) throw new PublicError('Enter a valid GitHub owner.');
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(config.repository) || /^\.{1,2}$/.test(config.repository)) throw new PublicError('Enter a valid repository name.');
  const branch = config.branch;
  if (!branch || branch.length > 255 || branch === '@' || ([...branch].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) || /[~^:?*[\\]/.test(branch)) || branch.includes('..') || branch.includes('@{') || branch.endsWith('.') || branch.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.lock'))) throw new PublicError('Enter a valid target branch.');
  if (config.directory.length > 240 || !config.directory || config.directory.split('/').some((part) => !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part) || part.endsWith('.') || part.toLowerCase() === '.git')) throw new PublicError('Use a relative solutions directory with letters, numbers, hyphens or underscores; no traversal or empty segments.');
  return config;
}
