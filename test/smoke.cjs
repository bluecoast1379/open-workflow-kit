#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const init = path.join(root, 'bin', 'init-workspace.cjs');
const commandCheck = path.join(root, 'bin', 'check-command-manifest.cjs');
const supportCheck = path.join(root, 'bin', 'check-support-matrix.cjs');
const sanitizedCheck = path.join(root, 'bin', 'check-sanitized.cjs');
const historyCheck = path.join(root, 'bin', 'check-history.cjs');
const { classifySourcePaths, toPortablePath } = require(init);
const { loadCommandManifest } = require(path.join(root, 'bin', 'command-manifest.cjs'));
const commands = loadCommandManifest(path.join(root, 'workflow/core/command-manifest.yaml')).commands;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-smoke-'));

// Windows path.relative() emits backslashes. Generated team-profile/toolchain
// paths are portable identifiers and must always use POSIX separators.
const windowsRepoPath = path.win32.relative('C:\\workspace', 'C:\\workspace\\apps\\web');
if (toPortablePath(windowsRepoPath) !== 'apps/web') {
  throw new Error(`Windows relative path was not normalized: ${windowsRepoPath}`);
}

function mkdir(rel) {
  fs.mkdirSync(path.join(tmp, rel), { recursive: true });
}

function write(rel, content) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function legacyV01Adapter(toolName, id) {
  return `# ${toolName} adapter for /${id}\n\n这是薄 adapter。执行时必须按顺序读取：\n\n1. \`AGENTS.md\`\n2. \`workflow/team-profile.yaml\`\n3. \`workflow/core/commands/${id}.md\`\n\n不得加入与 workflow/core 冲突的工具特定行为。\n`;
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

if (process.platform !== 'win32') {
  const symlinkWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-symlink-'));
  const outsideManagedPath = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-outside-'));
  fs.symlinkSync(outsideManagedPath, path.join(symlinkWorkspace, '.agents'));
  const unsafeInit = spawnSync(process.execPath, [init, '--target', symlinkWorkspace, '--tools', 'codex', '--yes'], { encoding: 'utf8' });
  if (unsafeInit.status === 0 || !/symbolic link/.test(unsafeInit.stderr)) throw new Error(`initializer 必须拒绝 managed path symlink:\n${unsafeInit.stdout}\n${unsafeInit.stderr}`);
  if (fs.readdirSync(outsideManagedPath).length !== 0) throw new Error('initializer 通过 managed path symlink 写出了工作区');
  if (fs.existsSync(path.join(symlinkWorkspace, 'workflow'))) throw new Error('symlink preflight 失败前不应留下部分 workflow 安装');
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
  '.agents/skills/workflow-04-code-implementation/SKILL.md',
  '.agents/skills/workflow-04-code-implementation/agents/openai.yaml',
  '.claude/commands/04-代码实现.md',
  '.cursor/rules/agent-workflow-core.mdc',
  '.github/copilot-instructions.md',
  '.github/prompts/workflow-04-code-implementation.prompt.md',
  '.codebuddy/rules/agent-workflow.md',
  '.codebuddy/commands/04-代码实现.md',
  '.kiro/steering/agent-workflow.md',
  '.kiro/steering/workflow-04-code-implementation.md',
  '.kiro/skills/workflow-04-code-implementation/SKILL.md',
  '.trae/commands/04-代码实现.md',
  '.trae/skills/agent-workflow/SKILL.md',
  'workflow/team-profile.yaml',
  'workflow/local/.gitignore',
  'workflow/local/team-profile.local.yaml',
  'workflow/local/rule-provenance.private.yaml',
  'workflow/INITIALIZATION_QUESTIONS.md',
  'workflow/core/commands/init-workspace.md',
  'workflow/core/command-manifest.yaml',
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
  'workflow/core/templates/api-test-plan.example.json',
  'workflow/core/templates/ui-test-plan.md',
  'workflow/core/templates/trusted-execution-policy.template.yaml',
  'workflow/core/templates/prototype-page.html',
  'workflow/core/commands/02C-HTML原型.md',
  'workflow/core/commands/connect-toolchain.md',
  'workflow/TOOLCHAIN_MCP_PLAN.md',
  'workflow/core/rules/rule-catalog.yaml',
  'workflow/adapters/support-matrix.yaml',
  'workflow/bin/check-rule-catalog.cjs',
  'workflow/bin/command-manifest.cjs',
  'workflow/bin/check-command-manifest.cjs',
  'workflow/bin/check-support-matrix.cjs',
  'workflow/bin/check-markdown-links.cjs',
  'workflow/bin/run-api-tests.cjs',
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
assertContains('.agents/skills/agent-workflow/SKILL.md', '不等于用户显式选择了阶段');
assertContains('.agents/skills/workflow-04-code-implementation/SKILL.md', 'name: workflow-04-code-implementation');
assertContains('.agents/skills/workflow-04-code-implementation/SKILL.md', 'workflow/core/commands/04-代码实现.md');
assertContains('.agents/skills/workflow-04-code-implementation/agents/openai.yaml', 'display_name: "04-代码实现 代码实现总览"');
assertContains('.agents/skills/workflow-04-code-implementation/agents/openai.yaml', 'allow_implicit_invocation: false');
// Claude 官方推荐 skills 格式入口（与 commands 并存）。
assertFile('.claude/skills/agent-workflow/SKILL.md');
assertContains('.claude/skills/agent-workflow/SKILL.md', 'name: agent-workflow');
assertContains('.claude/skills/agent-workflow/SKILL.md', 'execution-policy');
assertContains('.claude/skills/agent-workflow/SKILL.md', '不等于授权 `/04` 修改代码');

assertContains('workflow/team-profile.yaml', '- trae');
assertContains('workflow/team-profile.yaml', 'apps/web');
assertContains('workflow/team-profile.yaml', 'services/api');
assertContains('workflow/INSTALL_REPORT.md', '初始化器没有执行远程 Git 命令');
assertContains('workflow/core/command-manifest.yaml', `command_count: ${commands.length}`);

// 同一 manifest 必须为各平台生成数量一致的命令/skill 入口。
if (commands.length < 23) throw new Error(`源命令清单应包含 Definition-to-Done 命令，当前 ${commands.length}`);
for (const rel of [
  '.claude/commands',
  '.cursor/commands',
  '.codebuddy/commands',
  '.trae/commands'
]) {
  const count = fs.readdirSync(path.join(tmp, rel)).filter((name) => name.endsWith('.md')).length;
  if (count !== commands.length) throw new Error(`${rel} 命令数量应为 ${commands.length}，当前 ${count}`);
}
const stageSkillCount = fs
  .readdirSync(path.join(tmp, '.agents/skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('workflow-')).length;
if (stageSkillCount !== commands.length) {
  throw new Error(`分阶段 Agent Skills 数量应为 ${commands.length}，当前 ${stageSkillCount}`);
}
const copilotPromptCount = fs.readdirSync(path.join(tmp, '.github/prompts')).filter((name) => name.endsWith('.prompt.md')).length;
if (copilotPromptCount !== commands.length) throw new Error(`Copilot prompt 数量应为 ${commands.length}`);
const kiroSteeringCount = fs.readdirSync(path.join(tmp, '.kiro/steering')).filter((name) => name.endsWith('.md') && name !== 'agent-workflow.md').length;
if (kiroSteeringCount !== commands.length) throw new Error(`Kiro steering 数量应为 ${commands.length}`);
for (const command of commands) {
  const coreReference = `workflow/core/commands/${command.id}.md`;
  for (const dir of ['.claude/commands', '.cursor/commands', '.codebuddy/commands']) {
    assertContains(`${dir}/${command.id}.md`, coreReference);
  }
  assertContains(`.agents/skills/${command.skill_slug}/SKILL.md`, coreReference);
  assertContains(`.agents/skills/${command.skill_slug}/agents/openai.yaml`, 'allow_implicit_invocation: false');
  assertContains(`.github/prompts/${command.skill_slug}.prompt.md`, coreReference);
  assertContains(`.kiro/steering/${command.skill_slug}.md`, coreReference);
  assertContains(`.kiro/skills/${command.skill_slug}/SKILL.md`, coreReference);
  assertContains(`.trae/commands/${command.id}.md`, coreReference);
  if (fs.existsSync(path.join(tmp, `.trae/skills/${command.skill_slug}`))) {
    throw new Error(`Trae 不得为 ${command.id} 生成重复的分阶段 Skill`);
  }
}
if (fs.existsSync(path.join(tmp, '.trae-cn'))) throw new Error('kit 不应生成项目级 .trae-cn 镜像');
const cursorCommand = fs.readFileSync(path.join(tmp, '.cursor/commands/04-代码实现.md'), 'utf8');
if (cursorCommand.startsWith('---\n')) {
  throw new Error('Cursor 命令必须使用纯 Markdown，不能把 frontmatter 注入 prompt');
}
if (!cursorCommand.startsWith('# /04-代码实现 代码实现总览\n\n在准入通过后')) {
  throw new Error('Cursor 命令首段必须提供可读标题与描述，不能让 managed marker 进入菜单描述');
}
assertContains('.codebuddy/commands/04-代码实现.md', 'argument-hint: "<功能名称>"');
assertContains('.codebuddy/commands/04-代码实现.md', 'disable-model-invocation: true');
assertContains('.codebuddy/commands/04-代码实现.md', '$ARGUMENTS');
if (fs.readFileSync(path.join(tmp, '.codebuddy/commands/04-代码实现.md'), 'utf8').includes('allowed-tools:')) {
  throw new Error('CodeBuddy 阶段命令不得声明 allowed-tools');
}

// team-profile schema 必须与 core 模板保持一致；不在 smoke 里重复硬编码版本。
const profileSchemaLine = fs
  .readFileSync(path.join(root, 'workflow/core/templates/team-profile.template.yaml'), 'utf8')
  .match(/^schema_version:\s*.+$/m);
if (!profileSchemaLine) throw new Error('team-profile template 缺少 schema_version');
assertContains('workflow/team-profile.yaml', profileSchemaLine[0]);
// 仓库只能请求执行模式，高危 auto 需外部受信策略。
assertContains('workflow/team-profile.yaml', 'execution_policy:');
assertContains('workflow/team-profile.yaml', 'requested_default_mode: "ask"');
assertContains('workflow/team-profile.yaml', 'external_trust_policy:');
assertContains('workflow/team-profile.yaml', 'non_repo_auto_categories:');
assertContains('workflow/team-profile.yaml', 'protected_branch_write');
assertContains('workflow/team-profile.yaml', 'package_publish');
for (const category of [
  'protected_branch_write',
  'db_ddl',
  'db_dml',
  'production_config_write',
  'build_deploy_trigger',
  'package_publish'
]) {
  assertContains('workflow/team-profile.yaml', `    - "${category}"`);
  assertContains('workflow/core/execution-policy.md', `- \`${category}\``);
}
assertContains('workflow/team-profile.yaml', 'audit_log: "workflow/local/execution-audit.jsonl"');
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
  assertContains('workflow/team-profile.yaml', 'gitlab');
  for (const rel of ['workflow/team-profile.yaml', 'workflow/TOOLCHAIN_MCP_PLAN.md']) {
    const content = fs.readFileSync(path.join(tmp, rel), 'utf8');
    if (content.includes('gitlab.example-selfhost.com')) {
      throw new Error(`private git host leaked into committed artifact: ${rel}`);
    }
  }
}

// P0 回归：凭证目录必须自动生成 .gitignore（默认忽略全部内容）。
assertFile('workflow/local/.gitignore');
assertContains('workflow/local/.gitignore', '*');
assertContains('workflow/local/.gitignore', '!.gitignore');
assertContains('workflow/local/team-profile.local.yaml', 'local_only: true');
assertContains('workflow/local/rule-provenance.private.yaml', 'OWK-PRIVATE-RULE-001');
assertContains('workflow/local/rule-provenance.private.yaml', 'OWK-PRIVATE-RULE-037');
write('workflow/local/test-credentials.env', 'PLACEHOLDER_ONLY=1\n');
{
  const initGit = spawnSync('git', ['init', '-q'], { cwd: tmp, encoding: 'utf8' });
  if (initGit.status !== 0) throw new Error(`git init failed: ${initGit.stderr}`);
  const ignored = spawnSync('git', ['check-ignore', '-q', 'workflow/local/test-credentials.env'], { cwd: tmp });
  if (ignored.status !== 0) throw new Error('workflow/local/test-credentials.env 未被 Git 忽略');
  for (const rel of ['workflow/local/team-profile.local.yaml', 'workflow/local/rule-provenance.private.yaml']) {
    const result = spawnSync('git', ['check-ignore', '-q', rel], { cwd: tmp });
    if (result.status !== 0) throw new Error(`${rel} 未被 Git 忽略`);
  }
}

// 可提交 profile 只允许工作区内相对路径；外部路径、URL 和 home 缩写必须分流到 local profile。
{
  const outside = path.join(path.dirname(tmp), 'outside-private-docs');
  const insideAbsolute = path.join(tmp, 'docs', 'business-overview.md');
  const classified = classifySourcePaths(tmp, [
    'docs/frontend-rules.md',
    insideAbsolute,
    outside,
    '../outside-relative',
    'https://private.example.invalid/spec',
    '~/private-specs'
  ]);
  if (!classified.shared.includes('docs/frontend-rules.md') || !classified.shared.includes('docs/business-overview.md')) {
    throw new Error('工作区内路径未规范化为相对路径');
  }
  if (classified.shared.some((value) => path.isAbsolute(value) || value.includes('private.example.invalid'))) {
    throw new Error('可提交 source path 泄漏了绝对路径或私有 URL');
  }
  if (classified.local.length !== 4) throw new Error('本地私有路径分流数量不正确');
}

// v0.8.0 审计级规则完整性：37 规则 / 79 item / capability / command / evidence 全链路校验。
{
  const generatedRuleCheck = path.join(tmp, 'workflow/bin/check-rule-catalog.cjs');
  const result = spawnSync(process.execPath, [generatedRuleCheck], { cwd: tmp, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`生成物规则目录校验失败:\n${result.stdout}\n${result.stderr}`);
  assertContains('workflow/core/rules/rule-catalog.yaml', 'rule_count: 37');
  assertContains('workflow/core/rules/rule-catalog.yaml', 'OWK-RULE-037');

  const placeholder = spawnSync(
    process.execPath,
    [generatedRuleCheck, '--provenance', path.join(tmp, 'workflow/local/rule-provenance.private.yaml')],
    { cwd: tmp, encoding: 'utf8' }
  );
  if (placeholder.status === 0) throw new Error('未填充的私有 provenance 骨架不得校验通过');

  const validProvenance = ['schema_version: "1.0"', 'local_only: true', 'entries:'];
  for (let index = 1; index <= 37; index++) {
    const suffix = String(index).padStart(3, '0');
    validProvenance.push(`  - ref: "OWK-PRIVATE-RULE-${suffix}"`);
    validProvenance.push(`    source_fingerprint: "sha256:${suffix.padEnd(64, 'a')}"`);
  }
  write('workflow/local/rule-provenance.valid.yaml', validProvenance.join('\n') + '\n');
  const privateResult = spawnSync(
    process.execPath,
    [generatedRuleCheck, '--provenance', path.join(tmp, 'workflow/local/rule-provenance.valid.yaml')],
    { cwd: tmp, encoding: 'utf8' }
  );
  if (privateResult.status !== 0) {
    throw new Error(`完整私有 provenance 校验失败:\n${privateResult.stdout}\n${privateResult.stderr}`);
  }
}

assertContains('workflow/adapters/support-matrix.yaml', 'claim: "7 official project-level adapters; generated conformance is not real-tool certification"');
assertContains('workflow/adapters/support-matrix.yaml', 'support_level: "native"');
assertContains('workflow/adapters/support-matrix.yaml', 'invocation_style: "slash_fuzzy"');
assertContains('workflow/adapters/support-matrix.yaml', 'invocation_style: "skill_picker_fuzzy"');
assertContains('workflow/adapters/support-matrix.yaml', 'exact_command_id_slash: "unsupported"');
assertContains('workflow/adapters/support-matrix.yaml', 'multi_tool_coexistence_note: "Codex requires shared .agents/skills');
assertContains('workflow/adapters/support-matrix.yaml', 'Codex .agents/skills entries may additionally appear in Cursor');
assertContains('workflow/adapters/support-matrix.yaml', 'Codex .agents/skills entries may additionally appear in Trae');
assertContains('workflow/adapters/support-matrix.yaml', 'invocation_style: "prompt_fuzzy"');
{
  const generatedCommandCheck = path.join(tmp, 'workflow/bin/check-command-manifest.cjs');
  const commandResult = spawnSync(process.execPath, [generatedCommandCheck], { cwd: tmp, encoding: 'utf8' });
  if (commandResult.status !== 0) {
    throw new Error(`生成物命令清单校验失败:\n${commandResult.stdout}\n${commandResult.stderr}`);
  }

  const generatedSupportCheck = path.join(tmp, 'workflow/bin/check-support-matrix.cjs');
  const result = spawnSync(process.execPath, [generatedSupportCheck], { cwd: tmp, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`生成物 adapter 支持矩阵校验失败:\n${result.stdout}\n${result.stderr}`);

  const invalidMatrixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-matrix-'));
  const matrixDir = path.join(invalidMatrixRoot, 'workflow/adapters');
  fs.mkdirSync(matrixDir, { recursive: true });
  const matrix = fs
    .readFileSync(path.join(tmp, 'workflow/adapters/support-matrix.yaml'), 'utf8')
    .replace('verification_status: "native_not_yet_manually_certified"', 'verification_status: "native_verified"');
  fs.writeFileSync(path.join(matrixDir, 'support-matrix.yaml'), matrix);
  const invalid = spawnSync(process.execPath, [supportCheck, '--root', invalidMatrixRoot], { encoding: 'utf8' });
  if (invalid.status === 0) throw new Error('无人工验收证据的 native_verified 必须被阻断');
}

// manifest 自身是命令单一事实源，声明数量与实际条目不一致必须阻断。
{
  const invalidCommandRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-command-manifest-'));
  fs.cpSync(path.join(tmp, 'workflow'), path.join(invalidCommandRoot, 'workflow'), { recursive: true });
  const manifestFile = path.join(invalidCommandRoot, 'workflow/core/command-manifest.yaml');
  const invalidManifest = fs
    .readFileSync(manifestFile, 'utf8')
    .replace(`command_count: ${commands.length}`, `command_count: ${commands.length - 1}`);
  fs.writeFileSync(manifestFile, invalidManifest);
  const invalid = spawnSync(process.execPath, [commandCheck, '--root', invalidCommandRoot], { encoding: 'utf8' });
  if (invalid.status === 0) throw new Error('command_count 与实际命令数不一致时必须阻断');

  const invalidGateManifest = fs
    .readFileSync(path.join(tmp, 'workflow/core/command-manifest.yaml'), 'utf8')
    .replace('implementation_gate: false', 'implementation_gate: true');
  fs.writeFileSync(manifestFile, invalidGateManifest);
  const invalidGate = spawnSync(process.execPath, [commandCheck, '--root', invalidCommandRoot], { encoding: 'utf8' });
  if (invalidGate.status === 0) throw new Error('非 04 命令被标记 implementation_gate 时必须阻断');
}

{
  const generatedLinkCheck = path.join(tmp, 'workflow/bin/check-markdown-links.cjs');
  const result = spawnSync(process.execPath, [generatedLinkCheck], { cwd: tmp, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`生成物 Markdown 链接校验失败:\n${result.stdout}\n${result.stderr}`);
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
assertContains('AGENTS.md', 'workflow/local/execution-audit.jsonl');
assertContains('AGENTS.md', '仓库内 `team-profile.yaml` 不是信任根');
assertContains('AGENTS.md', '永远不得仅凭仓库配置 auto');

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
// manifest 删除/重命名后，旧的 kit adapter 不得继续留在 `/` 菜单；用户自定义入口必须保留。
write('.claude/commands/removed-stage.md', '<!-- generated-by: open-workflow-kit; managed-adapter: true -->\n读取 AGENTS.md 与 workflow/core/commands/removed-stage.md。\n');
write('.agents/skills/workflow-removed-stage/SKILL.md', '本 Skill 是由 workflow/core/command-manifest.yaml 生成的分阶段发现入口。\n读取 AGENTS.md 与 workflow/core/commands/removed-stage.md。\n');
write('.agents/skills/workflow-removed-stage/agents/openai.yaml', 'interface:\n  display_name: "removed"\n  default_prompt: "AGENTS.md"\npolicy:\n  allow_implicit_invocation: false\n');
write('.cursor/commands/my-team-command.md', '# 用户自定义 Cursor 命令\n不应被 kit 删除。\n');
// openone-workflow-kit 0.1.0 的旧 08/09/10 命令没有 managed marker；升级时
// 必须精确识别并删除，不能让新旧阶段同时出现在 slash 菜单。
for (const [dir, toolName] of [
  ['.claude/commands', 'Claude Code'],
  ['.cursor/commands', 'Cursor'],
  ['.codebuddy/commands', 'CodeBuddy']
]) {
  for (const id of ['08-发布准备', '09-发布执行', '10-复盘总结']) {
    write(`${dir}/${id}.md`, legacyV01Adapter(toolName, id));
  }
}
write('workflow/core/commands/08-发布准备.md', '# /08-发布准备\nCreate or update workspace-level `features/{feature}/08-发布准备.md`.\n进入 /09-发布执行。\n');
write('workflow/core/commands/09-发布执行.md', '# /09-发布执行\nCreate or update workspace-level `features/{feature}/09-发布执行.md`.\n需要用户明确授权。\n');
write('workflow/core/commands/10-复盘总结.md', '# /10-复盘总结\nCreate or update workspace-level `features/{feature}/10-复盘总结.md`.\n沉淀可复用规则。\n');
write('workflow/core/capabilities/knowledge-capture-maintainer.md', '# Knowledge Capture Maintainer\n读取 features/{feature}/10-复盘总结.md，可选 Obsidian Vault。\n');
write('workflow/core/capabilities/personal-git-operator.md', '# Personal Git Operator\n## Agent-Allowed Local Actions\n进入 /08-发布准备。\n');
write('workflow/core/capabilities/personal-release-checklist.md', '# Personal Release Checklist\n## Channel Checks\n## Authorization Boundary\n');
write('.cursor/commands/custom-core-reference.md', '# 用户自定义命令\n读取 AGENTS.md 与 workflow/core，但不是历史固定模板。\n');
write('.cursor/commands/custom-retained-stage.md', legacyV01Adapter('Cursor', 'custom-retained-stage'));
run(['--target', tmp, '--tools', 'codex,claude,cursor,codebuddy,trae', '--upgrade', '--force', '--yes']);
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
if (fs.existsSync(path.join(tmp, '.claude/commands/removed-stage.md'))) {
  throw new Error('manifest 已移除的 Claude adapter 不得在 upgrade 后残留');
}
if (fs.existsSync(path.join(tmp, '.agents/skills/workflow-removed-stage'))) {
  throw new Error('manifest 已移除的 Codex skill 不得在 upgrade 后残留');
}
assertFile('.cursor/commands/my-team-command.md');
assertFile('.cursor/commands/custom-core-reference.md');
assertFile('.cursor/commands/custom-retained-stage.md');
for (const dir of ['.claude/commands', '.cursor/commands', '.codebuddy/commands']) {
  for (const id of ['08-发布准备', '09-发布执行', '10-复盘总结']) {
    if (fs.existsSync(path.join(tmp, dir, `${id}.md`))) {
      throw new Error(`v0.1 历史 adapter 未清理: ${dir}/${id}.md`);
    }
  }
}
for (const id of ['08-发布准备', '09-发布执行', '10-复盘总结']) {
  if (fs.existsSync(path.join(tmp, `workflow/core/commands/${id}.md`))) {
    throw new Error(`v0.1 历史 core command 未清理: ${id}.md`);
  }
}
for (const name of ['knowledge-capture-maintainer.md', 'personal-git-operator.md', 'personal-release-checklist.md']) {
  if (fs.existsSync(path.join(tmp, `workflow/core/capabilities/${name}`))) {
    throw new Error(`v0.1 历史 capability 未清理: ${name}`);
  }
}

// v0.8.0 旧路径残留清理：kit 指纹文件自动删除；用户自定义内容保留。
{
  // 模拟历史版本产物：指纹匹配（引用 AGENTS.md + workflow/core）
  write('.codex/prompts/01-需求讨论.md', '读取 `AGENTS.md` 和 `workflow/core/commands/01-需求讨论.md`。\n');
  write('.kiro/instructions.md', '先读取 AGENTS.md，再按 workflow/core/commands 执行。\n');
  write('.codebuddy/rules/agent-workflow/RULE.mdc', '先读取 AGENTS.md，再按 workflow/core/commands 执行。\n');
  write('workflow/core/checklists/rule-catalog.yaml', '# 旧规则目录\ntotal_items: 79\n');
  // 用户自定义内容：无 kit 指纹，必须保留
  write('.codebuddy/instructions.md', '我团队自己的自定义说明，与初始化器无关。\n');

  // dry-run 只报告，不删除
  run(['--target', tmp, '--tools', 'codex,claude,cursor', '--upgrade', '--dry-run']);
  assertFile('.codex/prompts/01-需求讨论.md');
  assertFile('.kiro/instructions.md');
  assertFile('.codebuddy/rules/agent-workflow/RULE.mdc');
  assertFile('workflow/core/checklists/rule-catalog.yaml');

  // 真实 upgrade：指纹文件删除、目录清空后连带移除；自定义文件保留
  run(['--target', tmp, '--tools', 'codex,claude,cursor', '--upgrade', '--force', '--yes']);
  if (fs.existsSync(path.join(tmp, '.codex'))) {
    throw new Error('upgrade 后 .codex/ 残留应被清理');
  }
  if (fs.existsSync(path.join(tmp, '.kiro/instructions.md'))) {
    throw new Error('upgrade 后 .kiro/instructions.md 应被清理');
  }
  if (!fs.existsSync(path.join(tmp, '.codebuddy/instructions.md'))) {
    throw new Error('用户自定义的 .codebuddy/instructions.md 不得被删除');
  }
  if (fs.existsSync(path.join(tmp, '.codebuddy/rules/agent-workflow/RULE.mdc'))) {
    throw new Error('旧 CodeBuddy RULE.mdc 应被清理');
  }
  if (fs.existsSync(path.join(tmp, 'workflow/core/checklists/rule-catalog.yaml'))) {
    throw new Error('旧 checklists/rule-catalog.yaml 应被清理');
  }
  assertFile('.codebuddy/rules/agent-workflow.md');
  assertFile('workflow/core/rules/rule-catalog.yaml');
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

// 单工具安装回归：条件分支必须各自生成可发现入口，不能依赖其它工具顺带创建。
for (const [tool, required] of [
  ['codex', [
    '.agents/skills/workflow-04-code-implementation/SKILL.md',
    '.agents/skills/workflow-04-code-implementation/agents/openai.yaml'
  ]],
  ['codebuddy', [
    '.codebuddy/rules/agent-workflow.md',
    '.codebuddy/commands/04-代码实现.md'
  ]],
  ['copilot', [
    '.github/copilot-instructions.md',
    '.github/prompts/workflow-04-code-implementation.prompt.md'
  ]],
  ['kiro', [
    '.kiro/steering/workflow-04-code-implementation.md',
    '.kiro/skills/workflow-04-code-implementation/SKILL.md'
  ]],
  ['trae', [
    '.trae/commands/04-代码实现.md',
    '.trae/skills/agent-workflow/SKILL.md'
  ]]
]) {
  const adapterTmp = fs.mkdtempSync(path.join(os.tmpdir(), `agent-workflow-${tool}-`));
  const result = spawnSync(process.execPath, [init, '--target', adapterTmp, '--tools', tool, '--yes'], {
    cwd: adapterTmp,
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(`${tool}-only install failed:\n${result.stdout}\n${result.stderr}`);
  for (const rel of ['AGENTS.md', 'workflow/core/command-manifest.yaml', ...required]) {
    if (!fs.existsSync(path.join(adapterTmp, rel))) throw new Error(`${tool}-only install missing file: ${rel}`);
  }
}

// 脱敏反例：.env.production 中的无引号 PASSWORD 必须命中，且输出不回显值。
{
  const sanitizeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-sanitize-'));
  const secretValue = 'NOT_A_REAL_' + 'PASSWORD_VALUE_12345';
  const envLine = 'PASS' + 'WORD=' + secretValue + '\n';
  fs.writeFileSync(path.join(sanitizeTmp, '.env.production'), envLine);
  const result = spawnSync(process.execPath, [sanitizedCheck, '--root', sanitizeTmp], { encoding: 'utf8' });
  if (result.status === 0) throw new Error('.env.production 无引号 PASSWORD 反例未命中');
  if (`${result.stdout}\n${result.stderr}`.includes(secretValue)) throw new Error('脱敏扫描输出泄漏了命中值');
}

// 私有 denylist 命中时只能输出类别，不得回显词表原文。
{
  const sanitizeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-private-term-'));
  const denylistTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-denylist-'));
  const privateTerm = 'PRIVATE_' + 'ORGANIZATION_TERM_7f19';
  const denylistFile = path.join(denylistTmp, 'denylist.txt');
  fs.writeFileSync(path.join(sanitizeTmp, 'README.md'), `reference: ${privateTerm}\n`);
  fs.mkdirSync(path.join(sanitizeTmp, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(sanitizeTmp, 'docs', `${privateTerm}.md`), '# synthetic fixture\n');
  fs.writeFileSync(denylistFile, `${privateTerm}\n`);
  const result = spawnSync(
    process.execPath,
    [sanitizedCheck, '--root', sanitizeTmp, '--extra-banned', denylistFile],
    { encoding: 'utf8' }
  );
  if (result.status === 0) throw new Error('私有 denylist 反例未命中');
  const output = `${result.stdout}\n${result.stderr}`;
  if (output.includes(privateTerm)) throw new Error('脱敏扫描输出泄漏了私有 denylist 原文');
  if (!output.includes('private denylist term')) throw new Error('私有 denylist 命中缺少可诊断类别');
}

// Git 历史扫描同样不得回显私有词原文。
{
  const historyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-history-'));
  const denylistTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workflow-history-denylist-'));
  const privateTerm = 'HISTORY_PRIVATE_' + 'TERM_46a8';
  const denylistFile = path.join(denylistTmp, 'denylist.txt');
  const privateFile = `${privateTerm}.md`;
  fs.writeFileSync(path.join(historyTmp, privateFile), `reference: ${privateTerm}\n`);
  fs.writeFileSync(denylistFile, `${privateTerm}\n`);
  for (const args of [
    ['init', '-q'],
    ['config', 'user.name', 'Smoke Test'],
    ['config', 'user.email', 'smoke@example.invalid'],
    ['add', privateFile],
    ['commit', '-q', '-m', 'test fixture']
  ]) {
    const command = spawnSync('git', args, { cwd: historyTmp, encoding: 'utf8' });
    if (command.status !== 0) throw new Error(`历史扫描夹具初始化失败: git ${args.join(' ')}\n${command.stderr}`);
  }
  const reportFile = path.join(denylistTmp, 'history-report.md');
  const result = spawnSync(
    process.execPath,
    [historyCheck, '--repo', historyTmp, '--extra-banned', denylistFile, '--report', reportFile],
    { encoding: 'utf8' }
  );
  if (result.status === 0) throw new Error('Git 历史私有 denylist 反例未命中');
  const output = `${result.stdout}\n${result.stderr}`;
  if (output.includes(privateTerm)) throw new Error('Git 历史扫描输出泄漏了私有 denylist 原文');
  if (!output.includes('私有词')) throw new Error('Git 历史 denylist 命中缺少可诊断类别');
  const report = fs.readFileSync(reportFile, 'utf8');
  if (report.includes(historyTmp) || report.includes(privateTerm)) {
    throw new Error('Git 历史扫描报告泄漏了绝对路径或私有词');
  }
}

console.log('Smoke test passed.');
