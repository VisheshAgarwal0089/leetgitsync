import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function readZip(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  assert.ok(end >= 0, 'ZIP end record is missing');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'ZIP directory entry is invalid');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').replace(/\\/g, '/');
    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, `Invalid local header for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    assert.ok(data, `Unsupported ZIP compression method ${method} for ${name}`);
    assert.equal(data.length, uncompressedSize, `Unexpected extracted size for ${name}`);
    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryMap(entries) {
  return new Map(entries.map((entry) => [entry.name, entry.data]));
}

function validateSafeNames(entries) {
  for (const { name } of entries) {
    assert.ok(name && !name.startsWith('/') && !/^[A-Za-z]:/.test(name), `Unsafe archive path: ${name}`);
    assert.ok(!name.split('/').includes('..'), `Archive traversal path: ${name}`);
  }
}

const packageData = JSON.parse(await readFile('package.json', 'utf8'));
const prefix = `${packageData.name}-${packageData.version}`;
const archiveNames = (await readdir('.output')).filter((file) => file.endsWith('.zip')).sort();
const browserArchives = ['brave', 'chrome', 'edge', 'firefox'].map((browser) => `${prefix}-${browser}.zip`);
assert.deepEqual(archiveNames, [...browserArchives, `${prefix}-sources.zip`].sort(), 'Unexpected or missing release archives');

const expectedDescription = 'Save accepted LeetCode solutions directly to your GitHub repository.';
const sharedManifestFields = [];
const credentialPatterns = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const disallowedPackagePath = /(?:^|\/)(?:node_modules|tests?|scripts?|docs?|coverage)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.map$|\.(?:har|pem|key|log)$/i;
const solutionFileExtension = /\.(?:c|cc|cpp|cs|go|java|kt|php|py|rb|rs|swift)$/i;

for (const browser of ['brave', 'chrome', 'edge', 'firefox']) {
  const archive = `${prefix}-${browser}.zip`;
  const entries = readZip(await readFile(path.join('.output', archive)));
  const files = entryMap(entries);
  validateSafeNames(entries);
  for (const { name } of entries) {
    assert.doesNotMatch(name, disallowedPackagePath, `${browser}: unnecessary release file ${name}`);
    assert.doesNotMatch(name, solutionFileExtension, `${browser}: submitted source-code file in package ${name}`);
  }
  for (const required of ['manifest.json', 'background.js', 'popup.html', 'options.html']) {
    assert.ok(files.has(required), `${browser}: missing ${required}`);
  }

  const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
  assert.equal(manifest.name, 'LeetGitSync');
  assert.equal(manifest.version, packageData.version);
  assert.equal(manifest.description, expectedDescription);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.icons, { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' });
  sharedManifestFields.push(JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    permissions: manifest.permissions,
    hostPermissions: manifest.host_permissions,
    contentScripts: manifest.content_scripts,
    action: manifest.action,
    options: manifest.options_ui,
    icons: manifest.icons,
    csp: manifest.content_security_policy,
  }));

  for (const { name, data } of entries) {
    if (!/\.(?:js|html|css|json|txt)$/i.test(name)) continue;
    const text = data.toString('utf8');
    for (const pattern of credentialPatterns) assert.doesNotMatch(text, pattern, `${browser}: credential-like value in ${name}`);
    assert.doesNotMatch(text, /Live integration diagnostics|No LeetCode activity recorded yet/, `${browser}: development-only diagnostics in ${name}`);
  }
  console.log(`${browser}: release archive content verified (${entries.length} entries)`);
}
assert.equal(new Set(sharedManifestFields).size, 1, 'Shared manifest identity, permissions, UI, or content-script behavior differs by browser');

const sourceArchive = `${prefix}-sources.zip`;
const sourceEntries = readZip(await readFile(path.join('.output', sourceArchive)));
const sourceFiles = entryMap(sourceEntries);
validateSafeNames(sourceEntries);
for (const required of ['package.json', 'package-lock.json', 'wxt.config.js', 'README.md', 'PRIVACY.md', 'extension/entrypoints/background.js']) {
  assert.ok(sourceFiles.has(required), `Firefox source archive is missing ${required}`);
}
for (const { name, data } of sourceEntries) {
  assert.doesNotMatch(name, /(?:^|\/)(?:\.git|node_modules|\.output|tests?|coverage)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.map$/i, `Unsafe/unnecessary source archive file ${name}`);
  if (/\.(?:js|jsx|mjs|json|md|html|css)$/i.test(name)) {
    const text = data.toString('utf8');
    for (const pattern of credentialPatterns) assert.doesNotMatch(text, pattern, `Credential-like value in source archive ${name}`);
  }
}
console.log(`firefox: source archive verified (${sourceEntries.length} entries)`);

const checksumText = await readFile(path.join('.output', 'SHA256SUMS.txt'), 'utf8');
const checksumLines = checksumText.trim().split(/\r?\n/);
assert.equal(checksumLines.length, 5, 'Expected checksums for all five archives');
for (const line of checksumLines) {
  const match = line.match(/^([a-f0-9]{64}) {2}(.+\.zip)$/);
  assert.ok(match, `Invalid checksum line: ${line}`);
  assert.ok(archiveNames.includes(match[2]), `Checksum references unknown archive: ${match[2]}`);
  const actual = createHash('sha256').update(await readFile(path.join('.output', match[2]))).digest('hex');
  assert.equal(match[1], actual, `Checksum mismatch for ${match[2]}`);
}
console.log('All release archive SHA-256 checksums verified.');
