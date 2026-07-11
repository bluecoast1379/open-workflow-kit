#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const localNpmCache = path.join(dist, '.npm-cache');
const localMiseCache = path.join(dist, '.mise-cache');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(localNpmCache, { recursive: true });
fs.mkdirSync(localMiseCache, { recursive: true });

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

run('npm', ['run', 'check', '--', '--skip-release-build']);

const pack = run('npm', ['pack', '--pack-destination', dist, '--json']);
let packed;
try {
  packed = JSON.parse(pack.stdout)[0];
} catch (error) {
  throw new Error(`无法解析 npm pack 输出: ${pack.stdout}`);
}
const packedPaths = new Set(packed.files.map((file) => file.path));
for (const rel of [
  'docs/adapter-manual-acceptance.md',
  'workflow/core/command-manifest.yaml',
  'bin/command-manifest.cjs',
  'bin/check-command-manifest.cjs'
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

run('npm', ['install', '--prefix', installPrefix, '--no-audit', '--no-fund', tarball]);
const installedBin = path.join(installPrefix, 'node_modules', '.bin', process.platform === 'win32' ? 'agent-workflow-init.cmd' : 'agent-workflow-init');
run(installedBin, ['--target', installTarget, '--tools', 'codex,trea,codebuddy', '--yes']);
for (const rel of [
  'AGENTS.md',
  '.trae/instructions.md',
  '.agents/skills/workflow-04-code-implementation/SKILL.md',
  '.agents/skills/workflow-04-code-implementation/agents/openai.yaml',
  '.codebuddy/rules/agent-workflow.md',
  '.codebuddy/commands/04-代码实现.md',
  'workflow/team-profile.yaml',
  'workflow/local/.gitignore',
  'workflow/local/team-profile.local.yaml',
  'workflow/local/rule-provenance.private.yaml',
  'workflow/core/rules/rule-catalog.yaml',
  'workflow/core/command-manifest.yaml',
  'workflow/adapters/support-matrix.yaml',
  'workflow/bin/check-rule-catalog.cjs',
  'workflow/bin/command-manifest.cjs',
  'workflow/bin/check-command-manifest.cjs',
  'workflow/bin/check-support-matrix.cjs',
  'workflow/bin/check-markdown-links.cjs',
  'workflow/bin/run-api-tests.cjs',
  'workflow/INITIALIZATION_QUESTIONS.md'
]) {
  const file = path.join(installTarget, rel);
  if (!fs.existsSync(file)) throw new Error(`发布包安装 smoke 缺少 ${rel}`);
}
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-rule-catalog.cjs')]);
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-command-manifest.cjs')]);
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-support-matrix.cjs')]);
run(process.execPath, [path.join(installTarget, 'workflow/bin/check-markdown-links.cjs')]);

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
      AGENT_WORKFLOW_SKIP_RELEASE_BUILD: '1',
      npm_config_cache: localNpmCache,
      MISE_CACHE_DIR: localMiseCache
    })
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} 执行失败\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}
