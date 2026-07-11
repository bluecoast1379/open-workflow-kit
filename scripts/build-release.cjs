#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const localNpmCache = path.join(dist, '.npm-cache');
const localMiseCache = path.join(dist, '.mise-cache');
const sourceCommit = gitOutput(['rev-parse', 'HEAD']);
const sourceTree = gitOutput(['rev-parse', 'HEAD^{tree}']);
const dirtyState = gitOutput(['status', '--porcelain=v1', '--untracked-files=all']);
if (dirtyState) throw new Error('发布构建只允许从 clean reviewed commit 生成；请先审查并提交本地变更，再重跑 npm run build:release');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(localNpmCache, { recursive: true });
fs.mkdirSync(localMiseCache, { recursive: true });

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

runNpm(['run', 'check']);

const pack = runNpm(['pack', '--pack-destination', dist, '--json']);
let packed;
try {
  packed = JSON.parse(pack.stdout)[0];
} catch (error) {
  throw new Error(`无法解析 npm pack 输出: ${pack.stdout}`);
}
const packedPaths = new Set(packed.files.map((file) => file.path));
for (const rel of [
  'CHANGELOG.md',
  'docs/adapter-manual-acceptance.md',
  'workflow/core/capability-manifest.yaml',
  'workflow/core/rules/definition-quality-catalog.yaml',
  'workflow/core/schemas/completion-contract.schema.json',
  'workflow/core/schemas/evidence-ledger-entry.schema.json',
  'workflow/core/schemas/execution-permit.schema.json',
  'workflow/core/schemas/ledger-anchor.schema.json',
  'workflow/core/schemas/environment-manifest.schema.json',
  'workflow/core/schemas/findings-manifest.schema.json',
  'workflow/core/schemas/completion-run-state.schema.json',
  'workflow/core/schemas/completion-decision-packet.schema.json',
  'workflow/core/templates/completion-run-state.template.yaml',
  'workflow/core/templates/environment-manifest.template.yaml',
  'workflow/core/templates/findings-manifest.template.yaml',
  'workflow/core/command-manifest.yaml',
  'bin/command-manifest.cjs',
  'bin/check-command-manifest.cjs',
  'bin/check-definition-system.cjs',
  'bin/check-completion-contract.cjs',
  'bin/check-completion-schemas.cjs',
  'bin/evidence-ledger.cjs',
  'bin/evaluate-dod.cjs',
  'bin/run-until-done.cjs',
  'bin/sign-execution-permit.cjs',
  'bin/sign-ledger-anchor.cjs',
  'bin/generate-done-cockpit.cjs',
  'test/definition-to-done-e2e.cjs',
  'test/definition-to-done-cli-e2e.cjs',
  'examples/definition-to-done/oracle.cjs'
]) {
  if (!packedPaths.has(rel)) throw new Error(`发布包文件清单缺少 ${rel}`);
}

const tarball = path.join(dist, packed.filename);
const installSmokeRoot = path.join(dist, 'install-smoke');
const installPrefix = path.join(installSmokeRoot, 'consumer');
const installTarget = path.join(installSmokeRoot, 'target-workspace');

fs.rmSync(installSmokeRoot, { recursive: true, force: true });
fs.mkdirSync(installPrefix, { recursive: true });
fs.mkdirSync(path.join(installTarget, 'docs'), { recursive: true });
fs.mkdirSync(path.join(installTarget, 'app'), { recursive: true });
fs.writeFileSync(path.join(installTarget, 'docs', 'business-overview.md'), '# Business overview\n');
fs.writeFileSync(path.join(installTarget, 'app', 'package.json'), '{"dependencies":{"react":"latest"}}\n');

runNpm(['install', '--prefix', installPrefix, '--no-audit', '--no-fund', tarball]);
const installedPackageRoot = path.join(installPrefix, 'node_modules', packageJson.name);
const installedInit = path.join(installedPackageRoot, 'bin', 'init-workspace.cjs');
run(process.execPath, [installedInit, '--target', installTarget, '--tools', 'codex,claude,cursor,copilot,codebuddy,kiro,trae', '--yes']);
for (const rel of [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/commands/define-done.md',
  '.cursor/commands/deliver-until-done.md',
  '.github/prompts/workflow-define-done.prompt.md',
  '.kiro/steering/workflow-deliver-until-done.md',
  '.kiro/skills/workflow-deliver-until-done/SKILL.md',
  '.trae/commands/define-done.md',
  '.trae/skills/workflow-define-done/SKILL.md',
  '.trae-cn/commands/define-done.md',
  '.agents/skills/workflow-04-code-implementation/SKILL.md',
  '.agents/skills/workflow-04-code-implementation/agents/openai.yaml',
  '.codebuddy/rules/agent-workflow.md',
  '.codebuddy/commands/04-代码实现.md',
  'workflow/team-profile.yaml',
  'workflow/local/.gitignore',
  'workflow/local/team-profile.local.yaml',
  'workflow/local/rule-provenance.private.yaml',
  'workflow/core/rules/rule-catalog.yaml',
  'workflow/core/rules/definition-quality-catalog.yaml',
  'workflow/core/capability-manifest.yaml',
  'workflow/core/policy-packs/standard.yaml',
  'workflow/core/schemas/completion-contract.schema.json',
  'workflow/core/schemas/evidence-ledger-entry.schema.json',
  'workflow/core/schemas/execution-permit.schema.json',
  'workflow/core/schemas/ledger-anchor.schema.json',
  'workflow/core/schemas/environment-manifest.schema.json',
  'workflow/core/schemas/findings-manifest.schema.json',
  'workflow/core/schemas/completion-run-state.schema.json',
  'workflow/core/schemas/completion-decision-packet.schema.json',
  'workflow/core/templates/completion-contract.template.yaml',
  'workflow/core/templates/environment-manifest.template.yaml',
  'workflow/core/templates/findings-manifest.template.yaml',
  'workflow/core/command-manifest.yaml',
  'workflow/adapters/support-matrix.yaml',
  'workflow/bin/check-rule-catalog.cjs',
  'workflow/bin/command-manifest.cjs',
  'workflow/bin/check-command-manifest.cjs',
  'workflow/bin/check-definition-system.cjs',
  'workflow/bin/check-support-matrix.cjs',
  'workflow/bin/check-markdown-links.cjs',
  'workflow/bin/completion-core.cjs',
  'workflow/bin/check-completion-contract.cjs',
  'workflow/bin/check-completion-schemas.cjs',
  'workflow/bin/evidence-ledger.cjs',
  'workflow/bin/evaluate-dod.cjs',
  'workflow/bin/run-until-done.cjs',
  'workflow/bin/sign-execution-permit.cjs',
  'workflow/bin/sign-ledger-anchor.cjs',
  'workflow/bin/generate-done-cockpit.cjs',
  'workflow/bin/run-api-tests.cjs',
  'workflow/INITIALIZATION_QUESTIONS.md'
]) {
  const file = path.join(installTarget, rel);
  if (!fs.existsSync(file)) throw new Error(`发布包安装 smoke 缺少 ${rel}`);
}
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-rule-catalog.cjs')]);
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-command-manifest.cjs')]);
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-definition-system.cjs')]);
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-completion-schemas.cjs')]);
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-support-matrix.cjs')]);
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-markdown-links.cjs')]);
run(process.execPath, [path.join(installedPackageRoot, 'bin/check-completion-schemas.cjs')]);
const installedCompletionCheck = path.join(installTarget, 'workflow/bin/check-completion-contract.cjs');
run(process.execPath, [installedCompletionCheck, '--init', '--feature', 'release-smoke', '--workspace', installTarget]);
for (const rel of [
  'features/release-smoke/completion/contract.yaml',
  'features/release-smoke/completion/environment.yaml',
  'features/release-smoke/completion/findings.yaml',
  'features/release-smoke/completion/run-state.yaml'
]) {
  if (!fs.existsSync(path.join(installTarget, rel))) throw new Error(`Completion init smoke 缺少 ${rel}`);
}
const draftLint = runExpectFailure(process.execPath, [installedCompletionCheck, '--contract', path.join(installTarget, 'features/release-smoke/completion/contract.yaml'), '--json']);
if (!`${draftLint.stdout}\n${draftLint.stderr}`.includes('PLACEHOLDER')) throw new Error('初始化后的 draft Contract 必须因 PLACEHOLDER 被 lint 拒绝');
run(process.execPath, [path.join(installedPackageRoot, 'test/completion-core.cjs')]);
run(process.execPath, [path.join(installedPackageRoot, 'test/definition-to-done-e2e.cjs')]);
run(process.execPath, [path.join(installedPackageRoot, 'test/definition-to-done-cli-e2e.cjs')]);

const bytes = fs.readFileSync(tarball);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = [
  '# 发布清单',
  '',
  `- package: ${packageJson.name}`,
  `- version: ${packageJson.version}`,
  `- license: ${packageJson.license}`,
  `- tarball: ${packed.filename}`,
  `- size: ${packed.size}`,
  `- unpacked_size: ${packed.unpackedSize}`,
  `- sha256: ${sha256}`,
  `- source_commit: ${sourceCommit}`,
  `- source_tree: ${sourceTree}`,
  '- source_dirty: false',
  '- install_smoke: passed',
  `- generated_at: ${new Date().toISOString()}`,
  '',
  '## 文件内容',
  '',
  ...packed.files.map((file) => `- ${file.path} (${file.size} bytes)`),
  '',
  '## 人工发布边界',
  '',
  '本清单由本地构建生成。创建远程仓库、git push、创建 tag、npm publish 或其他远程写入动作都必须由维护者手动执行。',
  ''
].join('\n');

fs.rmSync(installSmokeRoot, { recursive: true, force: true });
fs.rmSync(localNpmCache, { recursive: true, force: true });
fs.rmSync(localMiseCache, { recursive: true, force: true });

fs.writeFileSync(path.join(dist, 'RELEASE_MANIFEST.md'), manifest);
console.log(manifest);

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      npm_config_cache: localNpmCache,
      MISE_CACHE_DIR: localMiseCache
    })
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} 执行失败\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

function runNpm(args) {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ].filter(Boolean);
  const cli = candidates.find((candidate) => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  });
  if (cli) return run(process.execPath, [cli, ...args]);
  if (process.platform === 'win32') throw new Error('Windows 上找不到 npm-cli.js；请通过 npm run build:release 启动发布构建');
  return run('npm', args);
}

function runExpectFailure(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      npm_config_cache: localNpmCache,
      MISE_CACHE_DIR: localMiseCache
    })
  });
  if (result.status === 0) throw new Error(`${cmd} ${args.join(' ')} 应失败但退出码为 0`);
  return result;
}

function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} 执行失败: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
