import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const packageData = JSON.parse(await readFile('package.json', 'utf8'));
const prefix = `${packageData.name}-${packageData.version}`;
const archives = (await readdir('.output'))
  .filter((file) => file.startsWith(`${prefix}-`) && file.endsWith('.zip'))
  .sort();

if (archives.length !== 5) throw new Error(`Expected five release archives, found ${archives.length}.`);
const lines = [];
for (const archive of archives) {
  const digest = createHash('sha256').update(await readFile(path.join('.output', archive))).digest('hex');
  lines.push(`${digest}  ${archive}`);
}
await writeFile(path.join('.output', 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8');
console.log(`Generated SHA-256 checksums for ${archives.length} archives.`);
