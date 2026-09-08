import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [listing, privacy, checklist, packageText] = await Promise.all([
  readFile('STORE_LISTING.md', 'utf8'),
  readFile('PRIVACY.md', 'utf8'),
  readFile('RELEASE_CHECKLIST.md', 'utf8'),
  readFile('package.json', 'utf8'),
]);
const packageData = JSON.parse(packageText);

assert.match(listing, /## Single purpose/);
assert.match(listing, /## Permission justifications/);
assert.match(listing, /## Data disclosure/);
assert.match(listing, /VisheshAgarwal0089\/leetgitsync\/blob\/v2\/PRIVACY\.md/);
for (const permission of ['storage', 'alarms', 'https://leetcode.com/problems/*', 'https://github.com/*', 'https://api.github.com/*']) assert.ok(listing.includes(`\`${permission}\``), `Missing listing justification for ${permission}`);

for (const disclosure of ['GitHub access token', 'source code', 'problem metadata', 'extension storage', 'Disconnecting GitHub', 'Removing the extension']) assert.ok(privacy.includes(disclosure), `Privacy policy is missing ${disclosure}`);
assert.ok(privacy.includes('no LeetGitSync backend'));

assert.ok(checklist.includes(`Version under review: ${packageData.version}`), 'Release checklist version does not match package.json');
assert.match(checklist, /Chrome 152\.0\.7977\.82/);
assert.match(checklist, /Edge 152\.0\.4191\.66/);
assert.match(checklist, /LeetCode submission ID:/);
assert.match(checklist, /GitHub commit SHA and URL:/);
assert.ok(!/(access[_ -]?token\s*[:=]\s*\S+|client[_ -]?secret\s*[:=]\s*\S+)/i.test(`${listing}\n${privacy}\n${checklist}`), 'Store documents appear to contain a secret');

console.log('Store listing, privacy disclosure and release checklist verified');
