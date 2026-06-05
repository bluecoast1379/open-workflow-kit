#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const init = path.join(root, 'bin', 'init-workspace.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-smoke-'));

function mkdir(rel) {
  fs.mkdirSync(path.join(tmp, rel), { recursive: true });
}

function write(rel, content) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [init, ...args], {
    cwd: tmp,
    encoding: 'utf8',
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`command failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function assertFile(rel) {
  const file = path.join(tmp, rel);
  if (!fs.existsSync(file)) throw new Error(`missing file: ${rel}`);
}

function assertContains(rel, text) {
  const file = path.join(tmp, rel);
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(text)) throw new Error(`${rel} does not contain ${text}`);
}

mkdir('docs/product');
write('docs/business-overview.md', '# Business overview\n');
write('docs/frontend-rules.md', '# Frontend rules\n');
write('apps/web/package.json', JSON.stringify({
  dependencies: { vue: 'latest', vite: 'latest', typescript: 'latest' }
}, null, 2));
write('services/api/pom.xml', '<project></project>\n');

run([
  '--target', tmp,
  '--tools', 'codex,claude,cursor,copilot,codebuddy,kiro,trea',
  '--yes'
]);

for (const rel of [
  'AGENTS.md',
  'CLAUDE.md',
  '.codex/prompts/init-workspace.md',
  '.codex/prompts/04-代码实现.md',
  '.codex/prompts/05-代码审查.md',
  '.codex/prompts/12-复盘总结.md',
  '.claude/commands/04-代码实现.md',
  '.cursor/rules/agent-workflow-core.mdc',
  '.github/copilot-instructions.md',
  '.codebuddy/instructions.md',
  '.kiro/instructions.md',
  '.trae/instructions.md',
  'workflow/team-profile.yaml',
  'workflow/INITIALIZATION_QUESTIONS.md',
  'workflow/core/commands/init-workspace.md',
  'workflow/core/commands/04-代码实现.md',
  'workflow/core/capabilities/branch-gatekeeper.md',
  'workflow/core/capabilities/release-safety-checker.md',
  'workflow/core/capabilities/prd-code-diff-checker.md',
  'workflow/core/capabilities/contract-tracer.md'
]) {
  assertFile(rel);
}

assertContains('workflow/team-profile.yaml', '- trae');
assertContains('workflow/team-profile.yaml', 'apps/web');
assertContains('workflow/team-profile.yaml', 'services/api');
assertContains('workflow/INSTALL_REPORT.md', 'The initializer did not run remote Git commands');

run(['--target', tmp, '--tools', 'codex', '--yes']);
assertFile('workflow/team-profile.yaml.agent-workflow-new');

const beforeDryRun = fs.readdirSync(tmp).sort().join('\n');
run(['--target', tmp, '--tools', 'codex', '--dry-run']);
const afterDryRun = fs.readdirSync(tmp).sort().join('\n');
if (beforeDryRun !== afterDryRun) {
  throw new Error('dry-run changed top-level files');
}

// Upgrade path: --upgrade --force should overwrite in place without writing new
// .agent-workflow-new files. Clean up stale .agent-workflow-new files left by
// previous non-force runs before measuring.
for (const stale of fs.readdirSync(path.join(tmp, 'workflow'))) {
  if (stale.endsWith('.agent-workflow-new')) {
    fs.unlinkSync(path.join(tmp, 'workflow', stale));
  }
}
const profileBefore = fs.readFileSync(path.join(tmp, 'workflow/team-profile.yaml'), 'utf8');
fs.writeFileSync(path.join(tmp, 'workflow/team-profile.yaml'), profileBefore + '\n# user note\n');
run(['--target', tmp, '--tools', 'codex,claude,cursor', '--upgrade', '--force', '--yes']);
const profileAfter = fs.readFileSync(path.join(tmp, 'workflow/team-profile.yaml'), 'utf8');
if (profileAfter.includes('# user note')) {
  throw new Error('upgrade --force did not overwrite team-profile.yaml');
}
const upgradeStrayFiles = fs
  .readdirSync(path.join(tmp, 'workflow'))
  .filter((name) => name.endsWith('.agent-workflow-new'));
if (upgradeStrayFiles.length) {
  throw new Error(`upgrade --force should not produce new .agent-workflow-new files, found: ${upgradeStrayFiles.join(',')}`);
}

console.log('Smoke test passed.');
