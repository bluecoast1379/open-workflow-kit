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
    throw new Error(`命令执行失败: ${result.stderr || result.stdout}`);
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
// 工具链探测正向路径：CI + 配置中心 + 数据库 + git 平台信号（曾因 TDZ 崩溃且 smoke 未覆盖，勿删）。
write('services/api/Jenkinsfile', 'pipeline { agent any }\n');
write('services/api/application.yml', 'spring:\n  cloud:\n    nacos:\n      server-addr: placeholder\n  datasource:\n    url: jdbc:mysql://localhost:3306/demo\n');
// 安全回归：remote URL 含 userinfo 凭证时，凭证绝不能进入任何生成文件（曾为 P0 泄漏，勿删）。
// 夹具 URL 用拼接构造，避免 kit 自身的 check-sanitized（URL userinfo 模式）误报本测试文件。
const fakeTokenUrl = 'https://SMOKE_FAKE_' + 'TOKEN_9f3@' + 'github.com/example/demo.git';
write('services/api/.git/config', `[remote "origin"]\n\turl = ${fakeTokenUrl}\n`);
write('apps/web/.git/config', '[remote "origin"]\n\turl = git@gitlab.example-selfhost.com:team/web.git\n');

run([
  '--target', tmp,
  '--tools', 'codex,claude,cursor,copilot,codebuddy,kiro,trea',
  '--yes'
]);

for (const rel of [
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/skills/agent-workflow/SKILL.md',
  '.claude/commands/04-代码实现.md',
  '.cursor/rules/agent-workflow-core.mdc',
  '.github/copilot-instructions.md',
  '.codebuddy/rules/agent-workflow/RULE.mdc',
  '.kiro/steering/agent-workflow.md',
  '.trae/instructions.md',
  'workflow/team-profile.yaml',
  'workflow/INITIALIZATION_QUESTIONS.md',
  'workflow/core/commands/init-workspace.md',
  'workflow/core/commands/02B-UI设计.md',
  'workflow/core/commands/04-代码实现.md',
  'workflow/core/capabilities/branch-gatekeeper.md',
  'workflow/core/capabilities/release-safety-checker.md',
  'workflow/core/capabilities/prd-code-diff-checker.md',
  'workflow/core/capabilities/contract-tracer.md',
  'workflow/core/capabilities/deployment-readiness-checker.md',
  'workflow/core/capabilities/runtime-evidence-triage.md',
  'workflow/core/capabilities/data-change-safety-checker.md',
  'workflow/core/capabilities/protocol-state-machine-checker.md',
  'workflow/core/capabilities/toolchain-mcp-planner.md',
  'workflow/core/capabilities/automated-test-runner.md',
  'workflow/core/checklists/README.md',
  'workflow/core/checklists/validation-change-review.md',
  'workflow/core/checklists/data-consistency-review.md',
  'workflow/core/checklists/branch-hygiene.md',
  'workflow/core/checklists/test-blind-spots.md',
  'workflow/core/checklists/third-party-integration-review.md',
  'workflow/core/checklists/language-pitfalls-java.md',
  'workflow/core/execution-policy.md',
  'workflow/core/testing-automation-guide.md',
  'workflow/core/templates/api-test-plan.md',
  'workflow/core/templates/ui-test-plan.md',
  'workflow/core/templates/prototype-page.html',
  'workflow/core/commands/02C-HTML原型.md',
  'workflow/core/commands/connect-toolchain.md',
  'workflow/TOOLCHAIN_MCP_PLAN.md',
  '.claude/commands/02C-HTML原型.md',
  '.claude/commands/connect-toolchain.md',
  '.cursor/commands/02C-HTML原型.md'
]) {
  assertFile(rel);
}

// Codex 官方约定回归：项目级 .codex/prompts/ 不被加载，kit 不得生成该目录。
if (fs.existsSync(path.join(tmp, '.codex'))) {
  throw new Error('kit 不应生成项目级 .codex/ 目录（Codex 不加载项目级 prompts）');
}
assertContains('.agents/skills/agent-workflow/SKILL.md', 'name: agent-workflow');

assertContains('workflow/team-profile.yaml', '- trae');
assertContains('workflow/team-profile.yaml', 'apps/web');
assertContains('workflow/team-profile.yaml', 'services/api');
assertContains('workflow/INSTALL_REPORT.md', '初始化器没有执行远程 Git 命令');

// v0.5.0: 分级执行策略、工具链槽位、测试双轨必须写入 team-profile。
assertContains('workflow/team-profile.yaml', 'schema_version: "1.1"');
assertContains('workflow/team-profile.yaml', 'execution_policy:');
assertContains('workflow/team-profile.yaml', 'default_mode: "ask"');
assertContains('workflow/team-profile.yaml', 'audit_log: "workflow/EXECUTION_AUDIT.md"');
assertContains('workflow/team-profile.yaml', 'toolchain:');
assertContains('workflow/team-profile.yaml', 'testing:');
assertContains('workflow/team-profile.yaml', 'environment_allowlist');
// 工具链探测：正向命中（Jenkinsfile / nacos / jdbc:mysql / .git/config→github）与未命中槽位并存。
assertContains('workflow/TOOLCHAIN_MCP_PLAN.md', '工具链 MCP 连接计划');
assertContains('workflow/TOOLCHAIN_MCP_PLAN.md', 'pending-question');
assertContains('workflow/TOOLCHAIN_MCP_PLAN.md', 'jenkins');
assertContains('workflow/TOOLCHAIN_MCP_PLAN.md', '`proposed`');
assertContains('workflow/TOOLCHAIN_MCP_PLAN.md', 'github');
assertContains('workflow/team-profile.yaml', 'nacos');
assertContains('workflow/team-profile.yaml', 'mysql');

// P0 回归：凭证 userinfo 绝不出现在任何生成文件；scp 形式自建域名 host 正常提取。
{
  const generated = ['workflow/team-profile.yaml', 'workflow/TOOLCHAIN_MCP_PLAN.md', 'AGENTS.md', 'workflow/INSTALL_REPORT.md'];
  for (const rel of generated) {
    const content = fs.readFileSync(path.join(tmp, rel), 'utf8');
    if (content.includes('SMOKE_FAKE_TOKEN')) {
      throw new Error(`credential leaked into generated file: ${rel}`);
    }
  }
  assertContains('workflow/team-profile.yaml', 'gitlab.example-selfhost.com');
}

// P0 回归：凭证目录必须自动生成 .gitignore（默认忽略全部内容）。
assertFile('workflow/local/.gitignore');
assertContains('workflow/local/.gitignore', '*');
assertContains('workflow/local/.gitignore', '!.gitignore');

// 规则挂接完整性：每个清单必须被 ≥1 个阶段命令引用，且被 ≥1 个能力文件引用。
{
  const checklistNames = fs
    .readdirSync(path.join(tmp, 'workflow/core/checklists'))
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .map((n) => n.replace(/\.md$/, ''));
  const readAll = (dir) =>
    fs.readdirSync(path.join(tmp, dir))
      .filter((n) => n.endsWith('.md'))
      .map((n) => fs.readFileSync(path.join(tmp, dir, n), 'utf8'))
      .join('\n');
  const commandsText = readAll('workflow/core/commands');
  const capabilitiesText = readAll('workflow/core/capabilities');
  for (const name of checklistNames) {
    if (!commandsText.includes(name)) throw new Error(`清单 ${name} 未被任何阶段命令引用`);
    if (!capabilitiesText.includes(name)) throw new Error(`清单 ${name} 未被任何能力文件引用`);
  }
  assertFile('workflow/core/checklists/rule-catalog.yaml');
}

// 生成的 team-profile.yaml 最小结构校验：无 tab、缩进为偶数空格、行内引号成对。
{
  const yamlText = fs.readFileSync(path.join(tmp, 'workflow/team-profile.yaml'), 'utf8');
  yamlText.split('\n').forEach((line, i) => {
    if (line.includes('\t')) throw new Error(`team-profile.yaml:${i + 1} 含 tab`);
    const indent = line.match(/^ */)[0].length;
    if (line.trim() && indent % 2 !== 0) throw new Error(`team-profile.yaml:${i + 1} 缩进非偶数: ${JSON.stringify(line)}`);
    const quotes = (line.match(/"/g) || []).length;
    if (quotes % 2 !== 0) throw new Error(`team-profile.yaml:${i + 1} 引号不成对: ${JSON.stringify(line)}`);
  });
}
// AGENTS.md 必须体现执行策略与新阶段。
assertContains('AGENTS.md', 'execution-policy');
assertContains('AGENTS.md', '/02C-HTML原型');
assertContains('AGENTS.md', '/connect-toolchain');
assertContains('AGENTS.md', 'EXECUTION_AUDIT');

// AGENTS.md must contain the comprehensive usage guide, not just hard gates.
assertContains('AGENTS.md', '## 快速开始');
assertContains('AGENTS.md', '## 工作流命令');
assertContains('AGENTS.md', '## 任务描述模板');
assertContains('AGENTS.md', '## 工具使用方式');
assertContains('AGENTS.md', '### Cursor');
assertContains('AGENTS.md', '/02B-UI设计');
assertContains('AGENTS.md', '/04-代码实现');
// The command table must list every stage.
assertContains('AGENTS.md', '/12-复盘总结');

// The Cursor rule must explain how to run a stage via Cursor custom commands.
assertContains('.cursor/rules/agent-workflow-core.mdc', '.cursor/commands/');
assertContains('.cursor/rules/agent-workflow-core.mdc', 'workflow/core/commands/04-代码实现.md');
// Cursor custom slash command adapters must be generated for every stage.
assertFile('.cursor/commands/02B-UI设计.md');
assertFile('.cursor/commands/04-代码实现.md');
assertFile('.cursor/commands/12-复盘总结.md');
assertContains('.cursor/commands/04-代码实现.md', 'workflow/core/commands/04-代码实现.md');

run(['--target', tmp, '--tools', 'codex', '--yes']);
assertFile('workflow/team-profile.yaml.agent-workflow-new');

const beforeDryRun = fs.readdirSync(tmp).sort().join('\n');
run(['--target', tmp, '--tools', 'codex', '--dry-run']);
const afterDryRun = fs.readdirSync(tmp).sort().join('\n');
if (beforeDryRun !== afterDryRun) {
  throw new Error('dry-run changed top-level files');
}

// Upgrade path: --upgrade --force 覆盖其余生成文件，但 team-profile 是团队手工契约，
// 永不原地覆盖：保留原文件，新版写 .agent-workflow-new 供人工比对。
for (const stale of fs.readdirSync(path.join(tmp, 'workflow'))) {
  if (stale.endsWith('.agent-workflow-new')) {
    fs.unlinkSync(path.join(tmp, 'workflow', stale));
  }
}
const profileBefore = fs.readFileSync(path.join(tmp, 'workflow/team-profile.yaml'), 'utf8');
fs.writeFileSync(path.join(tmp, 'workflow/team-profile.yaml'), profileBefore + '\n# user note\n');
run(['--target', tmp, '--tools', 'codex,claude,cursor', '--upgrade', '--force', '--yes']);
const profileAfter = fs.readFileSync(path.join(tmp, 'workflow/team-profile.yaml'), 'utf8');
if (!profileAfter.includes('# user note')) {
  throw new Error('upgrade must preserve user-maintained team-profile.yaml');
}
assertFile('workflow/team-profile.yaml.agent-workflow-new');
const upgradeStrayFiles = fs
  .readdirSync(path.join(tmp, 'workflow'))
  .filter((name) => name.endsWith('.agent-workflow-new'))
  .filter((name) => name !== 'team-profile.yaml.agent-workflow-new');
if (upgradeStrayFiles.length) {
  throw new Error(`upgrade --force 除 team-profile 外不应产生 .agent-workflow-new，发现: ${upgradeStrayFiles.join(',')}`);
}

// Cursor-only install must still generate AGENTS.md (the tool-neutral usage guide),
// even though codex is not selected.
const cursorTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-cursor-'));
spawnSync(process.execPath, [init, '--target', cursorTmp, '--tools', 'cursor', '--yes'], {
  cwd: cursorTmp,
  encoding: 'utf8'
});
for (const rel of [
  'AGENTS.md',
  '.cursor/rules/agent-workflow-core.mdc',
  '.cursor/commands/04-代码实现.md'
]) {
  if (!fs.existsSync(path.join(cursorTmp, rel))) {
    throw new Error(`cursor-only install missing file: ${rel}`);
  }
}
const cursorAgents = fs.readFileSync(path.join(cursorTmp, 'AGENTS.md'), 'utf8');
if (!cursorAgents.includes('### Cursor')) {
  throw new Error('cursor-only AGENTS.md missing the Cursor usage section');
}

console.log('Smoke test passed.');
