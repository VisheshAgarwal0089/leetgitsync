import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

for (const browser of ['brave', 'chrome', 'edge', 'firefox']) {
  const root = path.join('.output', `${browser}-mv3`);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'storage']);
  assert.deepEqual([...manifest.host_permissions].sort(), ['https://api.github.com/*', 'https://github.com/*']);
  const csp = manifest.content_security_policy?.extension_pages;
  for (const directive of ["default-src 'none'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"]) assert.ok(csp.includes(directive), `${browser}: missing CSP ${directive}`);
  assert.ok(!/unsafe-eval|unsafe-inline|https?:\/\/[^ ;]+\s+.*script-src/.test(csp), `${browser}: unsafe CSP`);
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const item = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(item);
      else if (/\.(?:js|html)$/.test(entry.name)) {
        const text = await readFile(item, 'utf8');
        assert.doesNotMatch(text, /\beval\s*\(|new\s+Function\s*\(/, `${browser}: dynamic executable pattern in ${item}`);
        assert.doesNotMatch(text, /Live integration diagnostics/, `${browser}: development diagnostics in ${item}`);
      }
    }
  }
  console.log(`${browser}: CSP, permissions, scripts, and production exclusions verified`);
}

const sourceFiles = [];
const sourceStack = ['extension'];
while (sourceStack.length) {
  const current = sourceStack.pop();
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const item = path.join(current, entry.name);
    if (entry.isDirectory()) sourceStack.push(item);
    else if (/\.(?:js|jsx)$/.test(entry.name)) sourceFiles.push(item);
  }
}
for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8');
  assert.doesNotMatch(text, /\beval\s*\(|new\s+Function\s*\(|dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\(/, `unsafe source pattern in ${file}`);
}
console.log(`${sourceFiles.length} extension source files contain no dynamic-code or unsafe HTML sinks`);
