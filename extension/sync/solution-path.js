const languageExtensions = new Map([
  ['bash', 'sh'], ['c', 'c'], ['c#', 'cs'], ['csharp', 'cs'], ['c++', 'cpp'], ['cpp', 'cpp'],
  ['dart', 'dart'], ['elixir', 'ex'], ['erlang', 'erl'], ['go', 'go'], ['golang', 'go'],
  ['java', 'java'], ['javascript', 'js'], ['javascript (node.js)', 'js'], ['kotlin', 'kt'],
  ['mysql', 'sql'], ['mssql', 'sql'], ['ms sql server', 'sql'], ['oracle', 'sql'], ['postgresql', 'sql'],
  ['pandas', 'py'], ['php', 'php'], ['python', 'py'], ['python2', 'py'], ['python3', 'py'],
  ['racket', 'rkt'], ['ruby', 'rb'], ['rust', 'rs'],
  ['scala', 'scala'], ['swift', 'swift'], ['typescript', 'ts'],
]);

export function extensionForLanguage(language) {
  const key = typeof language === 'string' ? language.trim().toLowerCase() : '';
  const extension = languageExtensions.get(key);
  if (!extension) {
    const error = new Error('Unsupported programming language.');
    error.code = 'INVALID_DATA';
    throw error;
  }
  return extension;
}

export function buildSolutionPath(record, directory) {
  if (!Number.isSafeInteger(record?.problemNumber) || record.problemNumber <= 0) invalidPath();
  const slug = typeof record?.problemSlug === 'string' ? record.problemSlug.trim().toLowerCase() : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) invalidPath();
  if (typeof directory !== 'string' || !directory || directory.split('/').some((part) => !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part) || part.endsWith('.') || part.toLowerCase() === '.git')) invalidPath();
  return `${directory}/${record.problemNumber}-${slug}.${extensionForLanguage(record.language)}`;
}

export function encodeRepositoryPath(path) {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function invalidPath() {
  const error = new Error('Invalid solution path.');
  error.code = 'INVALID_DATA';
  throw error;
}
