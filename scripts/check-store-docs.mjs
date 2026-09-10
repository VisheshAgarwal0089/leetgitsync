import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredDocuments = [
  'PRIVACY.md',
  'docs/USER_DATA_DISCLOSURE.md',
  'docs/PERMISSION_JUSTIFICATIONS.md',
  'docs/STORE_LISTING.md',
  'docs/INSTALLATION.md',
  'docs/TROUBLESHOOTING.md',
  'docs/RELEASE_CHECKLIST.md',
  'docs/ROLLBACK.md',
  'docs/RELEASE_REQUIREMENTS.md',
];

const documents = new Map();
for (const file of requiredDocuments) documents.set(file, await readFile(file, 'utf8'));
const combined = [...documents.values()].join('\n');

for (const phrase of [
  'submitted source code',
  'problem metadata',
  'selected GitHub repository',
  'Company names are included only when LeetCode provides them',
  'GitHub Device Flow',
  'browser extension storage',
  'Disconnect',
  'private repositories',
]) assert.ok(combined.includes(phrase), `Store documents must disclose: ${phrase}`);

assert.match(documents.get('PRIVACY.md'), /Effective: [A-Z][a-z]+ \d{1,2}, \d{4}/);
const storeListing = documents.get('docs/STORE_LISTING.md');
assert.match(storeListing, /\*\*Short description:\*\* ([^\n]+)/);
const shortDescription = storeListing.match(/\*\*Short description:\*\* ([^\n]+)/)[1];
assert.ok(shortDescription.length <= 132, 'Chrome short description exceeds 132 characters');
assert.doesNotMatch(combined, /(?:store|extension) (?:is|has been) approved|certified by/i, 'Documents must not claim store approval');
assert.match(documents.get('docs/RELEASE_CHECKLIST.md'), /two-factor authentication/i);
assert.match(documents.get('docs/ROLLBACK.md'), /version numbers to increase/i);

console.log(`${requiredDocuments.length} release and store documents verified.`);
