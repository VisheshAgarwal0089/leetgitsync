import { PublicError } from '../lib/errors.js';

const languageNames = new Map(Object.entries({
  bash: 'Bash', c: 'C', cpp: 'C++', csharp: 'C#', dart: 'Dart', elixir: 'Elixir', erlang: 'Erlang',
  golang: 'Go', go: 'Go', java: 'Java', javascript: 'JavaScript', js: 'JavaScript', kotlin: 'Kotlin',
  mysql: 'MySQL', mssql: 'MS SQL Server', oracle: 'Oracle', php: 'PHP', python: 'Python', python3: 'Python',
  racket: 'Racket', ruby: 'Ruby', rust: 'Rust', scala: 'Scala', swift: 'Swift', typescript: 'TypeScript', ts: 'TypeScript',
}));

function plainText(value, label, maxLength) {
  if (typeof value !== 'string') throw new PublicError(`LeetCode ${label} is missing.`);
  const withoutControls = [...value.normalize('NFKC')].map((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? ' ' : character;
  }).join('');
  const normalized = withoutControls.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maxLength) throw new PublicError(`LeetCode ${label} is invalid.`);
  return normalized;
}

function stringList(values, maxItems = 50) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.flatMap((value) => {
    try { return [plainText(typeof value === 'string' ? value : value?.name, 'tag', 100)]; } catch { return []; }
  }))].slice(0, maxItems);
}

export function normalizeLanguage(value) {
  const raw = plainText(value, 'language', 60);
  return languageNames.get(raw.toLowerCase().replace(/\s+/g, '')) ?? raw;
}

export function normalizeRecord(candidate, metadata, capturedAt = new Date().toISOString()) {
  const submissionId = String(candidate?.submissionId ?? '');
  if (!/^\d{1,30}$/.test(submissionId)) throw new PublicError('LeetCode submission ID is invalid.');
  const slug = plainText(metadata?.problemSlug ?? candidate?.problemSlug, 'problem slug', 200).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new PublicError('LeetCode problem slug is invalid.');
  const numberValue = metadata?.problemNumber ?? candidate?.questionId;
  const problemNumber = Number(numberValue);
  if (!Number.isSafeInteger(problemNumber) || problemNumber <= 0) throw new PublicError('LeetCode problem number is invalid.');
  if (typeof candidate?.sourceCode !== 'string' || !candidate.sourceCode.trim() || candidate.sourceCode.length > 1_000_000) throw new PublicError('Submitted source code is missing or too large.');
  const submittedAt = new Date(candidate.submittedAt);
  const captured = new Date(capturedAt);
  if (!Number.isFinite(submittedAt.getTime()) || !Number.isFinite(captured.getTime())) throw new PublicError('LeetCode submission timestamp is invalid.');
  return {
    schemaVersion: 1,
    platform: 'leetcode',
    submissionId,
    problemNumber,
    problemTitle: plainText(metadata?.problemTitle, 'problem title', 300),
    problemSlug: slug,
    problemUrl: `https://leetcode.com/problems/${slug}/`,
    language: normalizeLanguage(candidate.language),
    sourceCode: candidate.sourceCode,
    topics: stringList(metadata?.topics),
    companies: stringList(metadata?.companies),
    submittedAt: submittedAt.toISOString(),
    capturedAt: captured.toISOString(),
  };
}

export function validateRecord(record) {
  const normalized = normalizeRecord({
    submissionId: record?.submissionId, questionId: record?.problemNumber, language: record?.language,
    sourceCode: record?.sourceCode, submittedAt: record?.submittedAt, problemSlug: record?.problemSlug,
  }, {
    problemNumber: record?.problemNumber, problemTitle: record?.problemTitle, problemSlug: record?.problemSlug,
    topics: record?.topics, companies: record?.companies,
  }, record?.capturedAt);
  if (record?.schemaVersion !== 1 || record?.platform !== 'leetcode' || record?.problemUrl !== normalized.problemUrl) throw new PublicError('Captured LeetCode record is invalid.');
  return normalized;
}
