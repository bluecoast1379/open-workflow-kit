#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const init = path.join(root, 'bin/init-workspace.cjs');
const tools = 'codex,claude,cursor,copilot,codebuddy,kiro,trae';

const clean = makeLegacyFixture('clean');
runUpgrade(clean, []);
assertCohort(clean, 24, true);
assert(fs.existsSync(path.join(clean, 'TEAM-CUSTOM-COMMAND.md')));

const conflict = makeLegacyFixture('conflict');
fs.appendFileSync(path.join(conflict, 'workflow/core/command-manifest.yaml'), '# user conflict\n');
const beforeConflict = fs.readFileSync(path.join(conflict, 'workflow/core/command-manifest.yaml'));
const conflicted = runUpgrade(conflict, [], false);
assert.notEqual(conflicted.status, 0);
assert(`${conflicted.stdout}${conflicted.stderr}`.includes('升级冲突'));
assert(fs.readFileSync(path.join(conflict, 'workflow/core/command-manifest.yaml')).equals(beforeConflict));
assertCohort(conflict, 23, false);
runUpgrade(conflict, ['--force']);
assertCohort(conflict, 24, true);

const interrupted = makeLegacyFixture('interrupted');
const beforeManifest = fs.readFileSync(path.join(interrupted, 'workflow/core/command-manifest.yaml'));
const failed = runUpgrade(interrupted, [], false, { OWK_INSTALL_FAIL_AFTER: '5' });
assert.notEqual(failed.status, 0);
assert(`${failed.stdout}${failed.stderr}`.includes('injected failure'));
assert(fs.readFileSync(path.join(interrupted, 'workflow/core/command-manifest.yaml')).equals(beforeManifest));
assertCohort(interrupted, 23, false);
const journal = JSON.parse(fs.readFileSync(path.join(interrupted, 'workflow/.open-workflow-kit-transaction.json'), 'utf8'));
assert.equal(journal.status, 'rolled_back');
runUpgrade(interrupted, []);
assertCohort(interrupted, 24, true);

console.log('Editable prototype upgrade test passed: clean non-force, conflict fail-closed, force, interruption rollback/retry.');

function makeLegacyFixture(name) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), `owk-upgrade-${name}-`));
  fs.mkdirSync(path.join(target, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(target, 'docs/business-overview.md'), '# Business overview\n');
  run(init, ['--target', target, '--tools', tools, '--yes']);
  replaceWithV101(target, 'workflow/core/command-manifest.yaml', 'workflow/core/command-manifest.yaml');
  replaceWithV101(target, 'workflow/core/capability-manifest.yaml', 'workflow/core/capability-manifest.yaml');
  replaceWithV101(target, 'workflow/core/commands/02C-HTML原型.md', 'workflow/core/commands/02C-HTML原型.md');
  replaceWithV101(target, 'workflow/core/commands/02B-UI设计.md', 'workflow/core/commands/02B-UI设计.md');
  replaceWithV101(target, 'workflow/core/commands/04A-前端代码实现.md', 'workflow/core/commands/04A-前端代码实现.md');
  replaceWithV101(target, 'workflow/core/commands/06-测试用例.md', 'workflow/core/commands/06-测试用例.md');
  replaceWithV101(target, 'workflow/core/templates/prototype-page.html', 'workflow/core/templates/prototype-page.html');
  replaceWithV101(target, 'workflow/core/README.md', 'workflow/core/README.md');
  replaceWithV101(target, 'workflow/core/templates/README.md', 'workflow/core/templates/README.md');
  replaceWithV101(target, 'workflow/bin/check-command-manifest.cjs', 'bin/check-command-manifest.cjs');
  for (const rel of [
    'workflow/core/commands/02D-可编辑原型交付.md',
    'workflow/core/capabilities/editable-export-reviewer.md',
    'workflow/core/schemas/prototype-model.schema.json',
    'workflow/core/schemas/prototype-provenance.schema.json',
    'workflow/core/schemas/prototype-export-manifest.schema.json',
    'workflow/core/schemas/prototype-export-report.schema.json',
    'workflow/core/schemas/install-state.schema.json',
    'workflow/core/schemas/install-transaction.schema.json',
    'workflow/prototype-targets',
    'workflow/bin/prototype-core.cjs', 'workflow/bin/prototype-coverage.cjs', 'workflow/bin/prototype-output.cjs',
    'workflow/bin/deterministic-zip.cjs', 'workflow/bin/render-html-prototype.cjs', 'workflow/bin/render-figma-bundle.cjs',
    'workflow/bin/render-sketch-document.cjs', 'workflow/bin/render-axure-handoff.cjs', 'workflow/bin/export-editable-prototype.cjs',
    'workflow/bin/install-transaction-core.cjs',
    '.agents/skills/workflow-02d-editable-prototype',
    '.claude/commands/02D-可编辑原型交付.md', '.cursor/commands/02D-可编辑原型交付.md',
    '.github/prompts/workflow-02d-editable-prototype.prompt.md', '.codebuddy/commands/02D-可编辑原型交付.md',
    '.kiro/steering/workflow-02d-editable-prototype.md', '.kiro/skills/workflow-02d-editable-prototype',
    '.trae/commands/02D-可编辑原型交付.md'
  ]) fs.rmSync(path.join(target, rel), { recursive: true, force: true });
  for (const rel of ['AGENTS.md', 'workflow/README.md', 'workflow/INSTALL_REPORT.md']) {
    const file = path.join(target, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => !line.includes('02D-可编辑原型交付')).join('\n').replace(/open-workflow-kit 1\.1\.0/g, 'open-workflow-kit 1.0.1');
    fs.writeFileSync(file, `${text.replace(/\n+$/, '')}\n`);
  }
  const stateFile = path.join(target, 'workflow/.open-workflow-kit-install.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  state.kit_version = '1.0.1';
  state.command_count = 23;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(path.join(target, 'TEAM-CUSTOM-COMMAND.md'), '# user custom bytes\n');
  assertCohort(target, 23, false);
  return target;
}

function replaceWithV101(target, destination, source) {
  const shown = spawnSync('git', ['show', `v1.0.1:${source}`], { cwd: root, encoding: null });
  if (shown.status !== 0) throw new Error(`git show failed for ${source}: ${shown.stderr}`);
  fs.mkdirSync(path.dirname(path.join(target, destination)), { recursive: true });
  fs.writeFileSync(path.join(target, destination), shown.stdout);
}

function runUpgrade(target, extra, expectSuccess = true, env = {}) {
  const result = run(init, ['--target', target, '--tools', tools, '--upgrade', '--yes', ...extra], expectSuccess, env);
  return result;
}

function assertCohort(target, count, expect02D) {
  const manifest = fs.readFileSync(path.join(target, 'workflow/core/command-manifest.yaml'), 'utf8');
  assert(manifest.includes(`command_count: ${count}`));
  const coreExists = fs.existsSync(path.join(target, 'workflow/core/commands/02D-可编辑原型交付.md'));
  assert.equal(coreExists, expect02D);
  const entryPaths = [
    '.agents/skills/workflow-02d-editable-prototype/SKILL.md', '.claude/commands/02D-可编辑原型交付.md',
    '.cursor/commands/02D-可编辑原型交付.md', '.github/prompts/workflow-02d-editable-prototype.prompt.md',
    '.codebuddy/commands/02D-可编辑原型交付.md', '.kiro/steering/workflow-02d-editable-prototype.md',
    '.kiro/skills/workflow-02d-editable-prototype/SKILL.md', '.trae/commands/02D-可编辑原型交付.md'
  ];
  for (const rel of entryPaths) assert.equal(fs.existsSync(path.join(target, rel)), expect02D, `${rel} cohort mismatch`);
}

function run(command, args, expectSuccess = true, env = {}) {
  const result = spawnSync(process.execPath, command === init ? [command, ...args] : args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 20 * 1024 * 1024
  });
  if (expectSuccess && result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}
