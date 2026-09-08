import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = ['extension', 'scripts', 'tests', '.output/brave-mv3', '.output/chrome-mv3', '.output/edge-mv3', '.output/firefox-mv3'];
const patterns = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const extensions = new Set(['.js', '.jsx', '.mjs', '.json', '.html', '.css']);
const files = [];
async function walk(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) await walk(item);
    else if (extensions.has(path.extname(entry.name))) files.push(item);
  }
}
for (const root of roots) await walk(root);
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const pattern of patterns) assert.equal(pattern.test(text), false, `sensitive credential pattern found in ${file}`);
}
console.log(`${files.length} source and built files contain no GitHub token or private-key patterns`);
