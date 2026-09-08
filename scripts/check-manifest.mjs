import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

for (const target of ['brave', 'chrome', 'edge', 'firefox']) {
  const root = path.resolve(`.output/${target}-mv3`);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.homepage_url, 'https://github.com/VisheshAgarwal0089/leetgitsync');
  assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'storage']);
  assert.deepEqual([...manifest.host_permissions].sort(), ['https://api.github.com/*', 'https://github.com/*']);
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.options_ui.page, 'options.html');
  assert.equal(manifest.content_scripts.length, 2);
  assert.ok(manifest.content_scripts.every((script) => JSON.stringify(script.matches) === JSON.stringify(['https://leetcode.com/problems/*'])));
  const mainWorld = manifest.content_scripts.find((script) => script.world === 'MAIN');
  const isolatedWorld = manifest.content_scripts.find((script) => !script.world || script.world === 'ISOLATED');
  assert.equal(mainWorld?.run_at, 'document_start');
  assert.equal(isolatedWorld?.run_at, 'document_start');
  assert.ok(!manifest.web_accessible_resources?.length);
  assert.ok(!manifest.externally_connectable);
  assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
  const background = target === 'firefox' ? manifest.background.scripts : [manifest.background.service_worker];
  if (target === 'firefox') {
    assert.ok(manifest.browser_specific_settings.gecko.id);
    assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['authenticationInfo', 'websiteContent']);
  }
  assert.ok(background?.length);
  for (const file of ['popup.html', 'options.html', ...background, ...manifest.content_scripts.flatMap((script) => script.js), ...Object.values(manifest.icons)]) {
    assert.ok(!/\.tsx?$/.test(file)); await access(path.join(root, file));
  }
  console.log(`${target}: MV3 manifest and referenced files verified`);
}
