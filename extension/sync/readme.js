import { encodeRepositoryPath } from './solution-path.js';
import { validateConfig } from '../lib/config.js';

export const README_START = '<!-- LEETGITSYNC:START -->';
export const README_END = '<!-- LEETGITSYNC:END -->';

function readmeError() {
  const error = new Error('Managed README content is invalid.');
  error.code = 'README_INVALID';
  throw error;
}

function normalizeText(value) {
  if (typeof value !== 'string') readmeError();
  const withoutControls = [...value.normalize('NFKC')].map((character) => {
    const code = character.codePointAt(0);
    return code <= 31 || code === 127 ? ' ' : character;
  }).join('');
  const normalized = withoutControls.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 300) readmeError();
  return normalized;
}

export function escapeMarkdown(value) {
  return [...normalizeText(value)].map((character) => /[&<>\\`*_{}[\]()#!|~]/.test(character) ? `&#${character.codePointAt(0)};` : character).join('');
}

function unescapeMarkdown(value) {
  if (value.replace(/&#\d{1,7};/g, '').includes('&')) readmeError();
  const decoded = value.replace(/&#(\d{1,7});/g, (_, code) => {
    const number = Number(code);
    if (!Number.isSafeInteger(number) || number <= 0 || number > 0x10ffff) readmeError();
    return String.fromCodePoint(number);
  });
  return normalizeText(decoded);
}

function strictEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function buildGitHubFileUrl(target, path) {
  let safeTarget;
  try { safeTarget = validateConfig(target); } catch { readmeError(); }
  if (typeof path !== 'string' || path.length > 500 || !path.startsWith(`${safeTarget.directory}/`) || path.split('/').some((part) => !part || part === '.' || part === '..')) readmeError();
  const url = `https://github.com/${strictEncode(safeTarget.owner)}/${strictEncode(safeTarget.repository)}/blob/${strictEncode(safeTarget.branch)}/${encodeRepositoryPath(path)}`;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://github.com' || parsed.username || parsed.password || parsed.search || parsed.hash) readmeError();
  } catch { readmeError(); }
  return url;
}

function count(text, marker) {
  let total = 0;
  for (let index = text.indexOf(marker); index >= 0; index = text.indexOf(marker, index + marker.length)) total += 1;
  return total;
}

export function splitManagedReadme(readme) {
  if (typeof readme !== 'string') readmeError();
  const starts = count(readme, README_START);
  const ends = count(readme, README_END);
  if (starts === 0 && ends === 0) return { exists: false, content: '', prefix: readme, suffix: '' };
  if (starts !== 1 || ends !== 1) readmeError();
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (end < start + README_START.length) readmeError();
  return {
    exists: true,
    prefix: readme.slice(0, start + README_START.length),
    content: readme.slice(start + README_START.length, end),
    suffix: readme.slice(end),
  };
}

function parseFilePath(url, target) {
  const repoPrefix = `https://github.com/${strictEncode(target.owner)}/${strictEncode(target.repository)}/blob/`;
  const directoryMarker = `/${encodeRepositoryPath(target.directory)}/`;
  if (!url.startsWith(repoPrefix)) readmeError();
  const markerIndex = url.indexOf(directoryMarker, repoPrefix.length);
  if (markerIndex < 0 || markerIndex === repoPrefix.length) readmeError();
  const encodedFile = url.slice(markerIndex + directoryMarker.length);
  if (!encodedFile || encodedFile.includes('/')) readmeError();
  let file;
  try { file = decodeURIComponent(encodedFile); } catch { readmeError(); }
  if (!/^\d+-[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/.test(file)) readmeError();
  return `${target.directory}/${file}`;
}

function parseRow(line, topic, target) {
  const match = /^\| (\d+) \| \[([^\]]+)\]\((https:\/\/[^\s)]+)\)((?: \[[^\]]+\])*) \| \[([^\]]+)\]\((https:\/\/[^\s)]+)\) \|$/.exec(line);
  if (!match) readmeError();
  const problemNumber = Number(match[1]);
  if (!Number.isSafeInteger(problemNumber) || problemNumber <= 0 || match[3] !== match[6]) readmeError();
  const companies = [];
  for (const company of match[4].matchAll(/ \[([^\]]+)\]/g)) companies.push(unescapeMarkdown(company[1]));
  return {
    topic,
    problemNumber,
    problemTitle: unescapeMarkdown(match[2]),
    companies: [...new Set(companies)].sort(compareText),
    language: unescapeMarkdown(match[5]),
    path: parseFilePath(match[3], target),
  };
}

export function parseManagedEntries(readme, target) {
  const managed = splitManagedReadme(readme);
  const lines = managed.content.replace(/\r\n?/g, '\n').split('\n').filter((line) => line !== '');
  if (lines.length === 0) return [];
  const entries = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].startsWith('## ')) readmeError();
    const topic = unescapeMarkdown(lines[index].slice(3));
    if (lines[index + 1] !== '| # | Problem | File |' || lines[index + 2] !== '|---:|---------|------|') readmeError();
    index += 3;
    const firstRow = index;
    while (index < lines.length && !lines[index].startsWith('## ')) {
      entries.push(parseRow(lines[index], topic, target));
      index += 1;
    }
    if (index === firstRow) readmeError();
  }
  return dedupeEntries(entries);
}

function compareText(left, right) {
  const a = left.toLocaleLowerCase('en-US');
  const b = right.toLocaleLowerCase('en-US');
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0;
}

function entryKey(entry) {
  return `${entry.topic.toLocaleLowerCase('en-US')}\u0000${entry.problemNumber}\u0000${entry.language.toLocaleLowerCase('en-US')}`;
}

function dedupeEntries(entries) {
  const byKey = new Map();
  for (const entry of entries) byKey.set(entryKey(entry), entry);
  return [...byKey.values()];
}

export function mergeSubmission(entries, record, path) {
  const languageKey = normalizeText(record.language).toLocaleLowerCase('en-US');
  const retained = entries.filter((entry) => !(entry.problemNumber === record.problemNumber && entry.language.toLocaleLowerCase('en-US') === languageKey));
  const topics = record.topics.length ? record.topics : ['Uncategorized'];
  const normalizedTopics = new Map();
  for (const topic of topics) {
    const value = normalizeText(topic);
    const key = value.toLocaleLowerCase('en-US');
    const prior = normalizedTopics.get(key);
    if (!prior || compareText(value, prior) < 0) normalizedTopics.set(key, value);
  }
  const companies = [...new Set(record.companies.map(normalizeText))].sort(compareText);
  for (const topic of normalizedTopics.values()) retained.push({
    topic,
    problemNumber: record.problemNumber,
    problemTitle: normalizeText(record.problemTitle),
    companies,
    language: normalizeText(record.language),
    path,
  });
  return dedupeEntries(retained);
}

export function renderManagedBlock(entries, target) {
  const groups = new Map();
  for (const entry of dedupeEntries(entries)) {
    const key = entry.topic.toLocaleLowerCase('en-US');
    if (!groups.has(key)) groups.set(key, { topic: entry.topic, entries: [] });
    groups.get(key).entries.push(entry);
  }
  const sections = [...groups.values()].sort((left, right) => compareText(left.topic, right.topic)).map((group) => {
    const rows = group.entries.sort((left, right) => left.problemNumber - right.problemNumber || compareText(left.problemTitle, right.problemTitle) || compareText(left.language, right.language) || compareText(left.path, right.path)).map((entry) => {
      const url = buildGitHubFileUrl(target, entry.path);
      const companies = [...new Set(entry.companies)].sort(compareText).map((company) => ` [${escapeMarkdown(company)}]`).join('');
      return `| ${entry.problemNumber} | [${escapeMarkdown(entry.problemTitle)}](${url})${companies} | [${escapeMarkdown(entry.language)}](${url}) |`;
    });
    return `## ${escapeMarkdown(group.topic)}\n\n| # | Problem | File |\n|---:|---------|------|\n${rows.join('\n')}`;
  });
  return `${README_START}\n\n${sections.join('\n\n')}\n\n${README_END}`;
}

export function updateReadme(readme, record, target, path) {
  const split = splitManagedReadme(readme);
  const entries = mergeSubmission(parseManagedEntries(readme, target), record, path);
  const block = renderManagedBlock(entries, target);
  if (split.exists) return { content: `${split.prefix}${block.slice(README_START.length, -README_END.length)}${split.suffix}`, entries };
  const separator = readme.length === 0 || readme.endsWith('\n\n') ? '' : readme.endsWith('\n') ? '\n' : '\n\n';
  return { content: `${readme}${separator}${block}`, entries };
}
