import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function zipEntries(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  assert.ok(end >= 0, 'ZIP end record is missing');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'ZIP directory entry is invalid');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').replace(/\\/g, '/'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const files = (await readdir('.output')).filter((file) => file.endsWith('.zip'));
const packageData = JSON.parse(await readFile('package.json', 'utf8'));
const artifactPrefix = `${packageData.name}-${packageData.version}`;
for (const browser of ['chrome', 'edge', 'firefox']) {
  const matches = files.filter((file) => file === `${artifactPrefix}-${browser}.zip`);
  assert.equal(matches.length, 1, `Expected one ${browser} release ZIP`);
  const entries = zipEntries(await readFile(path.join('.output', matches[0])));
  assert.ok(entries.includes('manifest.json'), `${browser} manifest must be at ZIP root`);
  assert.ok(entries.includes('background.js'));
  assert.ok(entries.includes('popup.html'));
  assert.ok(entries.includes('options.html'));
  assert.ok(entries.every((entry) => !entry.startsWith('/') && !entry.split('/').includes('..')));
  assert.ok(entries.every((entry) => !/\.map$|(^|\/)\.env|(^|\/)node_modules\//.test(entry)));
  console.log(`${browser}: release ZIP structure verified (${entries.length} entries)`);
}

const sources = files.filter((file) => file === `${artifactPrefix}-sources.zip`);
assert.equal(sources.length, 1, 'Expected one Firefox source ZIP');
const sourceEntries = zipEntries(await readFile(path.join('.output', sources[0])));
assert.ok(sourceEntries.includes('package.json') && sourceEntries.includes('wxt.config.js'));
assert.ok(sourceEntries.some((entry) => entry === 'extension/entrypoints/background.js'));
assert.ok(sourceEntries.every((entry) => !entry.startsWith('/') && !entry.split('/').includes('..')));
assert.ok(sourceEntries.every((entry) => !/(^|\/)\.git\/|(^|\/)node_modules\/|(^|\/)\.output\/|(^|\/)\.env(?:\.|$)/.test(entry)));
console.log(`firefox: source ZIP structure verified (${sourceEntries.length} entries)`);
