#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const kitRoot = path.resolve(__dirname, '..');
const init = path.join(kitRoot, 'bin/init-workspace.cjs');
const supportCheck = path.join(kitRoot, 'bin/check-support-matrix.cjs');
const { loadCommandManifest } = require(path.join(kitRoot, 'bin/command-manifest.cjs'));
const commands = loadCommandManifest(path.join(kitRoot, 'workflow/core/command-manifest.yaml')).commands;
const profileTemplateKeys = topLevelYamlKeys(
  fs.readFileSync(path.join(kitRoot, 'workflow/core/templates/team-profile.template.yaml'), 'utf8')
);
const staticWorkflowEntries = listFiles(path.join(kitRoot, 'workflow'))
  .map((file) => path.relative(kitRoot, file))
  .filter((rel) => !isGeneratedWorkflowPath(rel));
const workspaceRuntimeEntries = listFiles(path.join(kitRoot, 'bin'))
  .filter((file) => path.basename(file) !== 'init-workspace.cjs')
  .map((file) => path.join('workflow/bin', path.relative(path.join(kitRoot, 'bin'), file)));

const toolSpecs = {
  codex: {
    staticEntries: ['AGENTS.md', '.agents/skills/agent-workflow/SKILL.md'],
    commandEntries: (command) => [
      `.agents/skills/${command.skill_slug}/SKILL.md`,
      `.agents/skills/${command.skill_slug}/agents/openai.yaml`
    ],
    primaryEntry: (command) => `.agents/skills/${command.skill_slug}/SKILL.md`
  },
  claude: {
    staticEntries: ['AGENTS.md', 'CLAUDE.md', '.claude/skills/agent-workflow/SKILL.md'],
    commandEntries: (command) => [`.claude/commands/${command.id}.md`],
    primaryEntry: (command) => `.claude/commands/${command.id}.md`
  },
  cursor: {
    staticEntries: ['AGENTS.md', '.cursor/rules/agent-workflow-core.mdc'],
    commandEntries: (command) => [`.cursor/commands/${command.id}.md`],
    primaryEntry: (command) => `.cursor/commands/${command.id}.md`
  },
  copilot: {
    staticEntries: ['AGENTS.md', '.github/copilot-instructions.md'],
    commandEntries: (command) => [`.github/prompts/${command.skill_slug}.prompt.md`],
    primaryEntry: (command) => `.github/prompts/${command.skill_slug}.prompt.md`
  },
  codebuddy: {
    staticEntries: ['AGENTS.md', '.codebuddy/rules/agent-workflow.md'],
    commandEntries: (command) => [`.codebuddy/commands/${command.id}.md`],
    primaryEntry: (command) => `.codebuddy/commands/${command.id}.md`
  },
  kiro: {
    staticEntries: ['AGENTS.md', '.kiro/steering/agent-workflow.md'],
    commandEntries: (command) => [
      `.kiro/steering/${command.skill_slug}.md`,
      `.kiro/skills/${command.skill_slug}/SKILL.md`
    ],
    primaryEntry: (command) => `.kiro/steering/${command.skill_slug}.md`
  },
  trae: {
    staticEntries: [
      'AGENTS.md',
      '.trae/skills/agent-workflow/SKILL.md',
      '.trae-cn/skills/agent-workflow/SKILL.md'
    ],
    commandEntries: (command) => [
      `.trae/commands/${command.id}.md`,
      `.trae/skills/${command.skill_slug}/SKILL.md`,
      `.trae-cn/commands/${command.id}.md`,
      `.trae-cn/skills/${command.skill_slug}/SKILL.md`
    ],
    primaryEntry: (command) => `.trae/commands/${command.id}.md`
  }
};

function run() {
  if (!commands.length) throw new Error('command manifest 不能为空');

  const support = spawnSync(process.execPath, [supportCheck], { cwd: kitRoot, encoding: 'utf8' });
  if (support.status !== 0) {
    throw new Error(`support matrix 校验失败:\n${support.stdout}\n${support.stderr}`);
  }

  for (const tool of Object.keys(toolSpecs)) {
    const target = installTool(tool);
    const errors = validateAdapterRoot(target, tool, commands);
    if (errors.length) throw new Error(`${tool} adapter conformance 失败:\n- ${errors.join('\n- ')}`);
    runGeneratedCheck(target, 'check-command-manifest.cjs');
    runGeneratedCheck(target, 'check-definition-system.cjs');
    runGeneratedCheck(target, 'check-support-matrix.cjs');
  }

  // 反例：入口数量检查必须真的覆盖 manifest，而不是只验证几个样例文件。
  const negativeTarget = installTool('claude');
  const missing = toolSpecs.claude.primaryEntry(commands[0]);
  fs.unlinkSync(path.join(negativeTarget, missing));
  const negativeErrors = validateAdapterRoot(negativeTarget, 'claude', commands);
  if (!negativeErrors.some((message) => message.includes(missing))) {
    throw new Error('删除一个 manifest 命令入口后，conformance 未能捕获缺失文件');
  }

  verifyTraeLegacyCleanup();

  console.log(`Adapter conformance passed: 7 tools × ${commands.length} manifest commands; negative case covered.`);
}

function verifyTraeLegacyCleanup() {
  const generatedTarget = installTool('trae');
  const legacy = path.join(generatedTarget, '.trae/instructions.md');
  fs.writeFileSync(legacy, '先读取 AGENTS.md，再按 workflow/core/commands 执行。\n');
  const orphan = path.join(generatedTarget, '.trae/commands/removed-stage.md');
  fs.writeFileSync(orphan, '<!-- generated-by: open-workflow-kit; managed-adapter: true -->\n读取 AGENTS.md 与 workflow/core/commands/removed-stage.md。\n');
  const customCommand = path.join(generatedTarget, '.trae/commands/my-team-command.md');
  fs.writeFileSync(customCommand, '# 用户自定义 Trae 命令\n');
  runUpgrade(generatedTarget, 'trae');
  if (fs.existsSync(legacy)) throw new Error('upgrade 未清理 kit 生成的旧 .trae/instructions.md');
  if (fs.existsSync(orphan)) throw new Error('upgrade 未清理 manifest 已移除的 Trae command');
  if (!fs.existsSync(customCommand)) throw new Error('upgrade 误删用户自定义 Trae command');

  const customTarget = installTool('trae');
  const custom = path.join(customTarget, '.trae/instructions.md');
  fs.writeFileSync(custom, '用户自己的 Trae 说明。\n');
  runUpgrade(customTarget, 'trae');
  if (!fs.existsSync(custom)) throw new Error('upgrade 误删了用户自定义 .trae/instructions.md');
}

function runUpgrade(target, tool) {
  const result = spawnSync(
    process.execPath,
    [init, '--target', target, '--tools', tool, '--upgrade', '--force', '--yes'],
    { cwd: target, encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`${tool} upgrade 失败:\n${result.stdout}\n${result.stderr}`);
}

function installTool(tool) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), `open-workflow-${tool}-`));
  const result = spawnSync(process.execPath, [init, '--target', target, '--tools', tool, '--yes'], {
    cwd: target,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`${tool} 初始化失败:\n${result.stdout}\n${result.stderr}`);
  }
  return target;
}

function runGeneratedCheck(target, scriptName) {
  const script = path.join(target, 'workflow/bin', scriptName);
  const result = spawnSync(process.execPath, [script], { cwd: target, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`生成工作区 ${scriptName} 失败:\n${result.stdout}\n${result.stderr}`);
  }
}

function validateAdapterRoot(target, tool, commandList = commands) {
  const spec = toolSpecs[tool];
  if (!spec) return [`未知工具: ${tool}`];
  const errors = [];

  for (const rel of [
    'workflow/core/command-manifest.yaml',
    'workflow/team-profile.yaml',
    'workflow/adapters/support-matrix.yaml',
    ...staticWorkflowEntries,
    ...workspaceRuntimeEntries,
    ...spec.staticEntries
  ]) {
    if (!isFile(target, rel)) errors.push(`缺少 ${rel}`);
  }

  if (isFile(target, 'workflow/team-profile.yaml')) {
    const generatedKeys = topLevelYamlKeys(fs.readFileSync(path.join(target, 'workflow/team-profile.yaml'), 'utf8'));
    for (const key of profileTemplateKeys) {
      if (!generatedKeys.has(key)) errors.push(`生成的 team-profile.yaml 缺少模板顶层字段 ${key}`);
    }
  }

  for (const command of commandList) {
    const core = `workflow/core/commands/${command.id}.md`;
    if (!isFile(target, core)) errors.push(`缺少 ${core}`);

    for (const rel of spec.commandEntries(command)) {
      if (!isFile(target, rel)) {
        errors.push(`缺少 ${rel}`);
        continue;
      }
      const content = fs.readFileSync(path.join(target, rel), 'utf8');
      if (content.includes('allowed-tools:')) errors.push(`${rel} 不得声明 allowed-tools`);
      if (content.includes('.codex/prompts') || content.includes('.trae/instructions.md')) {
        errors.push(`${rel} 引用了已废弃路径`);
      }
    }

    const primary = spec.primaryEntry(command);
    if (!isFile(target, primary)) continue;
    const content = fs.readFileSync(path.join(target, primary), 'utf8');
    for (const required of ['AGENTS.md', 'workflow/team-profile.yaml', core, command.description, command.argument_hint]) {
      if (!content.includes(required)) errors.push(`${primary} 缺少 manifest/core 引用 ${required}`);
    }
  }

  if (fs.existsSync(path.join(target, '.codex/prompts'))) errors.push('不得生成项目级 .codex/prompts');
  if (fs.existsSync(path.join(target, '.trae/instructions.md'))) errors.push('不得保留旧 .trae/instructions.md');

  const expectedPrimary = new Set(commandList.map((command) => spec.primaryEntry(command)));
  if (expectedPrimary.size !== commandList.length) {
    errors.push(`${tool} 主入口路径发生冲突，无法一一映射 manifest commands`);
  }

  return errors;
}

function isFile(root, rel) {
  try {
    return fs.statSync(path.join(root, rel)).isFile();
  } catch {
    return false;
  }
}

function listFiles(root) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name !== '.DS_Store') files.push(file);
    }
  }
  visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function topLevelYamlKeys(source) {
  return new Set(
    source
      .split(/\r?\n/)
      .map((line) => line.match(/^([a-z][a-z0-9_]*):(?:\s|$)/))
      .filter(Boolean)
      .map((match) => match[1])
  );
}

function isGeneratedWorkflowPath(rel) {
  const normalized = rel.split(path.sep).join('/');
  return [
    'workflow/README.md',
    'workflow/team-profile.yaml',
    'workflow/TOOLCHAIN_MCP_PLAN.md',
    'workflow/INSTALL_REPORT.md',
    'workflow/INITIALIZATION_QUESTIONS.md'
  ].includes(normalized) || normalized.startsWith('workflow/local/');
}

if (require.main === module) run();

module.exports = {
  toolSpecs,
  validateAdapterRoot
};
