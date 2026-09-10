import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const outputDirectory = path.resolve(projectRoot, '.output');
if (path.dirname(outputDirectory) !== projectRoot || path.basename(outputDirectory) !== '.output') {
  throw new Error('Refusing to clean an unexpected output directory.');
}

function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const node = process.execPath;
const wxt = path.join(projectRoot, 'node_modules', 'wxt', 'bin', 'wxt.mjs');
const eslint = path.join(projectRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
const npmCli = process.env.npm_execpath;

rmSync(outputDirectory, { recursive: true, force: true });
run('Generate icons', node, ['scripts/generate-icons.mjs']);
run('ESLint', node, [eslint, '.']);
run('Tests', node, ['--test', 'tests/*.test.js']);
run('1,000-installation simulation', node, ['scripts/simulate-scale.mjs']);

run('Chrome production package', node, [wxt, 'zip']);
run('Edge production package', node, [wxt, 'zip', '-b', 'edge']);
run('Firefox production package and sources', node, [wxt, 'zip', '-b', 'firefox', '--mv3', '--sources']);
run('Brave production package', node, [wxt, 'zip', '-b', 'brave']);

run('Manifest validation', node, ['scripts/check-manifest.mjs']);
run('Compiled-worker checks', node, ['scripts/check-runtime.mjs']);
run('Production security checks', node, ['scripts/check-security.mjs']);
run('Secret scan', node, ['scripts/check-sensitive-data.mjs']);
run('Generate checksums', node, ['scripts/generate-checksums.mjs']);
run('Release archive checks', node, ['scripts/check-release.mjs']);
run('Store-documentation checks', node, ['scripts/check-store-docs.mjs']);

if (npmCli) run('Dependency audit', node, [npmCli, 'audit', '--audit-level=moderate']);
else run('Dependency audit', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--audit-level=moderate']);
run('Git whitespace check', 'git', ['diff', '--check']);

console.log('\nRelease verification completed successfully. Artifacts and SHA256SUMS.txt are in .output/.');
