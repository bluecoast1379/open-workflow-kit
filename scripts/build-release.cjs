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
  throw new Error(`Unable to parse npm pack output: ${pack.stdout}`);
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
  '.codebuddy/instructions.md',
  'workflow/team-profile.yaml',
  'workflow/INITIALIZATION_QUESTIONS.md'
]) {
  const file = path.join(installTarget, rel);
  if (!fs.existsSync(file)) throw new Error(`Release install smoke missing ${rel}`);
}

const bytes = fs.readFileSync(tarball);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = [
  '# Release Manifest',
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
  '## Contents',
  '',
  ...packed.files.map((file) => `- ${file.path} (${file.size} bytes)`),
  '',
  '## Manual Publish Boundary',
  '',
  'This manifest is generated locally. Remote repository creation, git push, tag creation, npm publish, or any other remote write must be performed manually by the user.',
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
    throw new Error(`${cmd} ${args.join(' ')} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}
