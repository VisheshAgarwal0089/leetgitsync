import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const packageData = JSON.parse(await readFile('package.json', 'utf8'));
const shared = [];
for (const target of ['brave', 'chrome', 'edge', 'firefox']) {
  const root = path.resolve(`.output/${target}-mv3`);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'LeetGitSync');
  assert.equal(manifest.version, packageData.version);
  assert.equal(manifest.description, 'Save accepted LeetCode solutions directly to your GitHub repository.');
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
    assert.equal(manifest.browser_specific_settings.gecko.id, 'leetgitsync@extensions.local');
    assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
    assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['authenticationInfo', 'websiteContent']);
  } else assert.equal(manifest.minimum_chrome_version, '120');
  assert.ok(background?.length);
  for (const file of ['popup.html', 'options.html', ...background, ...manifest.content_scripts.flatMap((script) => script.js), ...Object.values(manifest.icons)]) {
    assert.ok(!/\.tsx?$/.test(file)); await access(path.join(root, file));
  }
  for (const [size, icon] of Object.entries(manifest.icons)) {
    const png = await readFile(path.join(root, icon));
    assert.equal(png.readUInt32BE(16), Number(size), `${target}: ${icon} width mismatch`);
    assert.equal(png.readUInt32BE(20), Number(size), `${target}: ${icon} height mismatch`);
    assert.equal(png[25], 6, `${target}: ${icon} must be an RGBA PNG`);
    assert.ok(png.length > 200, `${target}: ${icon} is unexpectedly empty`);
  }
  shared.push(JSON.stringify({ name: manifest.name, version: manifest.version, description: manifest.description, permissions: manifest.permissions, hosts: manifest.host_permissions, icons: manifest.icons, action: manifest.action, options: manifest.options_ui, contentScripts: manifest.content_scripts, csp: manifest.content_security_policy }));
  console.log(`${target}: MV3 manifest and referenced files verified`);
}
assert.equal(new Set(shared).size, 1, 'Shared manifest fields differ across production builds');
