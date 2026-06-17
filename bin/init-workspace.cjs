#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const KIT_ROOT = path.resolve(__dirname, '..');
const SUPPORTED_TOOLS = ['codex', 'claude', 'cursor', 'copilot', 'codebuddy', 'kiro', 'trae'];
const TOOL_ALIASES = {
  trea: 'trae',
  claude_code: 'claude',
  'claude-code': 'claude',
  github_copilot: 'copilot',
  'github-copilot': 'copilot'
};
const GENERATED_BY = 'agent-workflow-init 0.3.0';

const STAGES = [
  ['init-workspace', '初始化工作区', '扫描本地资料、生成 team-profile、缺资料提问，并生成当前工具 adapter。'],
  ['new-feature', '初始化功能工作流', '创建 features/{feature}/ 容器、状态文件和截图目录。'],
  ['01-需求讨论', '需求讨论', '澄清业务目标、边界、验收口径和待确认项。'],
  ['02-产品文档', '产品文档', '输出 PRD、业务规则、UI 基线、非功能需求和验收口径。'],
  ['03-技术架构', '技术架构', '识别项目族、影响仓库、调用链、分支基线和实现准入风险。'],
  ['03-06-研发准备', '研发准备编排', '在已有 PRD 后串联生成 03 到 06 的研发准备文档；不授权代码实现。'],
  ['04-代码实现', '代码实现总览', '在准入通过后记录后端、前端、配置、数据和发布影响的真实改动。'],
  ['04A-前端代码实现', '前端代码实现', '记录页面、组件、接口、状态、回显和前端验证。'],
  ['04B-后端代码实现', '后端代码实现', '记录接口、服务、数据、事务、消息、配置和后端验证。'],
  ['05-代码审查', '代码审查', '以问题优先方式审查真实 diff、发布边界、PRD 一致性和残余风险。'],
  ['06-测试用例', '测试用例', '输出正常流、异常流、边界流、权限和回归覆盖矩阵。'],
  ['07-测试执行', '测试执行', '记录真实执行结果、证据、阻塞、缺陷和发布候选差异核查。'],
  ['08-验收表格', '验收表格', '形成业务可签收的验收清单和责任项。'],
  ['09-验收', '验收报告', '记录验收结论、遗留项、范围说明和后续动作。'],
  ['10-培训文档', '培训文档', '输出面向非技术人员的操作说明、截图和分发材料。'],
  ['11-上线邮件通知', '上线通知', '形成上线范围、影响、时间、回滚口径和注意事项。'],
  ['12-复盘总结', '复盘总结', '沉淀项目级结论、通用规则候选和工作流改进项。'],
  ['workflow-status', '工作流状态', '汇总 features 下所有需求的阶段状态、阻塞和下一步。']
];

const REQUIRED_SOURCES = [
  {
    key: 'business_intro',
    label: '业务介绍',
    question: '请提供业务介绍或产品概览文件路径',
    match: /(业务介绍|业务概览|产品介绍|company|business|overview|readme)/i
  },
  {
    key: 'project_docs',
    label: '项目资料',
    question: '请提供项目资料、PRD、需求或架构文档目录',
    match: /(项目资料|需求|prd|product|docs|architecture|spec)/i
  },
  {
    key: 'ui_specs',
    label: 'UI 设计文件',
    question: '请提供 UI 规范、设计稿、原型或设计系统文件路径',
    match: /(ui|design|figma|prototype|mockup|原型|设计|视觉|规范)/i
  },
  {
    key: 'frontend_rules',
    label: '前端开发规范',
    question: '请提供前端开发规范目录或文件路径',
    match: /(frontend|front-end|前端|web.*规范|ui.*规范)/i
  },
  {
    key: 'backend_rules',
    label: '后端开发规范',
    question: '请提供后端开发规范目录或文件路径',
    match: /(backend|back-end|server|后端|服务端)/i
  },
  {
    key: 'testing_rules',
    label: '测试规范',
    question: '请提供测试规范、测试用例或 QA 资料路径',
    match: /(test|testing|qa|测试|用例|验收)/i
  }
];

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'target',
  '.idea',
  '.vscode',
  '_worktrees',
  'open-workflow-kit',
  'workflow'
]);

const CAPABILITY_FILES = [
  'branch-gatekeeper.md',
  'release-safety-checker.md',
  'prd-code-diff-checker.md',
  'contract-tracer.md',
  'worktree-isolator.md',
  'repo-baseline-scanner.md',
  'impact-scope-analyzer.md',
  'security-reviewer.md',
  'verify-app.md',
  'deployment-readiness-checker.md',
  'runtime-evidence-triage.md',
  'data-change-safety-checker.md',
  'protocol-state-machine-checker.md',
  'test-evidence-reviewer.md',
  'ui-baseline-reviewer.md',
  'memory-curator.md',
  'rule-extractor.md'
];

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = path.resolve(options.target || process.cwd());
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`目标目录不存在: ${target}`);
  }

  const detectedTools = detectTools(target);
  let enabledTools = options.tools ? normalizeTools(options.tools) : detectedTools;
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.yes && !options.dryRun;

  if (!enabledTools.length && interactive) {
    const answer = await promptLine(
      `请选择 AI 工具（${SUPPORTED_TOOLS.join(', ')}）。留空会生成全部薄 adapter: `
    );
    enabledTools = normalizeTools(answer || SUPPORTED_TOOLS.join(','));
  }
  if (!enabledTools.length) enabledTools = SUPPORTED_TOOLS.slice();

  const repos = scanRepos(target);
  const sources = scanRequiredSources(target);
  const missing = REQUIRED_SOURCES.filter((item) => sources[item.key].status === 'missing');

  const profile = {
    target,
    enabledTools,
    detectedTools,
    repos,
    sources,
    missing
  };

  if (interactive && missing.length) {
    for (const item of missing) {
      const answer = await promptLine(`${item.question} (optional, comma separated): `);
      if (answer.trim()) {
        sources[item.key] = {
          status: 'provided_by_user',
          paths: answer.split(',').map((v) => v.trim()).filter(Boolean)
        };
      }
    }
    profile.missing = REQUIRED_SOURCES.filter((item) => sources[item.key].status === 'missing');
  }

  const plannedWrites = buildInstallPlan(target, profile, options);
  if (options.dryRun) {
    printDryRun(target, profile, plannedWrites);
    return;
  }

  for (const write of plannedWrites) {
    writeManagedFile(write.file, write.content, options);
  }

  console.log(`已在 ${target} 初始化 agent 工作流`);
  console.log(`启用工具: ${enabledTools.join(', ')}`);
  if (profile.missing.length) {
    console.log('部分必要资料未找到，请查看 workflow/INITIALIZATION_QUESTIONS.md。');
  }
}

function parseArgs(argv) {
  const options = { target: '', tools: '', yes: false, force: false, upgrade: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') options.target = argv[++i] || '';
    else if (arg === '--tools') options.tools = argv[++i] || '';
    else if (arg === '--yes' || arg === '-y') options.yes = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--upgrade') options.upgrade = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`用法: node bin/init-workspace.cjs [options]

选项:
  --target <dir>       目标工作区根目录，默认是当前目录。
  --tools <list>       逗号分隔的工具列表: ${SUPPORTED_TOOLS.join(', ')}。
  --yes, -y            非交互模式，缺失资料会写入问题清单。
  --force              覆盖已生成的入口文件。
  --upgrade            刷新生成文件；存在 team-profile.yaml 时按当前策略处理。
  --dry-run            只展示计划写入的文件，不修改磁盘。
  --help, -h           显示帮助。

该命令不会执行远程 Git 操作，不会创建分支，不会 push 代码，
也不会触发构建、部署或数据库写入。`);
}

function normalizeTools(value) {
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const normalized = [];
  for (const item of raw) {
    const input = item.trim().toLowerCase();
    const tool = TOOL_ALIASES[input] || input;
    if (!tool) continue;
    if (!SUPPORTED_TOOLS.includes(tool)) {
      throw new Error(`不支持的工具: ${tool}。支持的工具: ${SUPPORTED_TOOLS.join(', ')}`);
    }
    if (!normalized.includes(tool)) normalized.push(tool);
  }
  return normalized;
}

function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function detectTools(root) {
  const hits = [];
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  if (exists('.codex') || exists('AGENTS.md')) hits.push('codex');
  if (exists('.claude') || exists('CLAUDE.md')) hits.push('claude');
  if (exists('.cursor')) hits.push('cursor');
  if (exists('.github/copilot-instructions.md') || exists('.github/prompts')) hits.push('copilot');
  if (exists('.codebuddy')) hits.push('codebuddy');
  if (exists('.kiro')) hits.push('kiro');
  if (exists('.trae')) hits.push('trae');
  return hits;
}

function scanRepos(root) {
  const repos = [];
  const seen = new Set();

  function visit(dir, depth) {
    if (depth > 2) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const rel = path.relative(root, dir) || '.';
    const marker = detectRepoMarker(dir);
    if (marker && !seen.has(rel)) {
      seen.add(rel);
      repos.push({
        path: rel,
        marker,
        tech_stack: detectTechStack(dir)
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      visit(path.join(dir, entry.name), depth + 1);
    }
  }

  visit(root, 0);
  return repos.sort((a, b) => a.path.localeCompare(b.path));
}

function detectRepoMarker(dir) {
  const markers = [
    ['.git', 'git'],
    ['package.json', 'node'],
    ['pom.xml', 'maven'],
    ['build.gradle', 'gradle'],
    ['go.mod', 'go'],
    ['Cargo.toml', 'rust'],
    ['pyproject.toml', 'python'],
    ['requirements.txt', 'python']
  ];
  for (const [file, marker] of markers) {
    if (fs.existsSync(path.join(dir, file))) return marker;
  }
  return '';
}

function detectTechStack(dir) {
  const stack = [];
  const has = (file) => fs.existsSync(path.join(dir, file));
  if (has('pom.xml')) stack.push('java-maven');
  if (has('build.gradle')) stack.push('java-gradle');
  if (has('package.json')) {
    stack.push('node');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
      if (deps.vue) stack.push('vue');
      if (deps.react) stack.push('react');
      if (deps.next) stack.push('nextjs');
      if (deps.vite) stack.push('vite');
      if (deps.typescript) stack.push('typescript');
    } catch {
      stack.push('package-json-unreadable');
    }
  }
  if (has('go.mod')) stack.push('go');
  if (has('pyproject.toml') || has('requirements.txt')) stack.push('python');
  return stack.length ? stack : ['unknown'];
}

function scanRequiredSources(root) {
  const candidates = [];
  walkFiles(root, 4, (file) => {
    const ext = path.extname(file).toLowerCase();
    if (!['.md', '.txt', '.docx', '.pdf', '.yaml', '.yml', '.json'].includes(ext)) return;
    candidates.push(path.relative(root, file));
  });

  const result = {};
  for (const source of REQUIRED_SOURCES) {
    const matches = candidates.filter((rel) => source.match.test(rel)).slice(0, 20);
    result[source.key] = matches.length
      ? { status: 'detected', paths: matches }
      : { status: 'missing', paths: [] };
  }
  return result;
}

function walkFiles(root, maxDepth, visitor) {
  function visit(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        visit(full, depth + 1);
      } else {
        visitor(full);
      }
    }
  }
  visit(root, 0);
}

function buildInstallPlan(target, profile, options) {
  const writes = [];
  const add = (rel, content) => writes.push({ file: path.join(target, rel), content });

  add('workflow/team-profile.yaml', makeTeamProfileYaml(profile));
  add('workflow/README.md', makeWorkflowReadme());
  add('workflow/core/README.md', readKitFile('workflow/core/README.md'));
  add('workflow/core/commands/README.md', readKitFile('workflow/core/commands/README.md'));
  add('workflow/core/templates/README.md', readKitFile('workflow/core/templates/README.md'));
  add('workflow/core/templates/00-workflow-status.md', readKitFile('workflow/core/templates/00-workflow-status.md'));
  add('workflow/core/templates/stage-document.md', readKitFile('workflow/core/templates/stage-document.md'));
  add('workflow/core/templates/team-profile.template.yaml', readKitFile('workflow/core/templates/team-profile.template.yaml'));
  add('workflow/core/capabilities/README.md', readKitFile('workflow/core/capabilities/README.md'));
  for (const name of CAPABILITY_FILES) {
    add(`workflow/core/capabilities/${name}`, readKitFile(`workflow/core/capabilities/${name}`));
  }
  add('workflow/adapters/README.md', readKitFile('workflow/adapters/README.md'));
  add('workflow/INSTALL_REPORT.md', makeInstallReport(profile, options));
  if (profile.missing.length) add('workflow/INITIALIZATION_QUESTIONS.md', makeQuestions(profile));

  for (const [id, title, description] of STAGES) {
    add(`workflow/core/commands/${id}.md`, makeCoreCommand(id, title, description));
  }

  // AGENTS.md is the tool-neutral entry document and the full usage guide.
  // Generate it regardless of selected tools so every adapter can point to it.
  add('AGENTS.md', makeAgentsEntry(profile));
  if (profile.enabledTools.includes('codex')) {
    for (const [id] of STAGES) add(`.codex/prompts/${id}.md`, makePrompt(id));
  }
  if (profile.enabledTools.includes('claude')) {
    add('CLAUDE.md', '先读取 AGENTS.md，再遵循 workflow/core 和 workflow/team-profile.yaml。.claude/commands 下的工具命令只是薄 adapter。\n');
    for (const [id] of STAGES) add(`.claude/commands/${id}.md`, makeThinCommand('Claude Code', id));
  }
  if (profile.enabledTools.includes('cursor')) {
    add('.cursor/rules/agent-workflow-core.mdc', makeCursorRule());
    // Cursor 1.6+ supports custom slash commands from .cursor/commands/*.md.
    for (const [id] of STAGES) add(`.cursor/commands/${id}.md`, makeThinCommand('Cursor', id));
  }
  if (profile.enabledTools.includes('copilot')) {
    add('.github/copilot-instructions.md', makeGenericInstructions('GitHub Copilot'));
  }
  if (profile.enabledTools.includes('codebuddy')) {
    add('.codebuddy/instructions.md', makeGenericInstructions('CodeBuddy'));
  }
  if (profile.enabledTools.includes('kiro')) {
    add('.kiro/instructions.md', makeGenericInstructions('Kiro'));
  }
  if (profile.enabledTools.includes('trae')) {
    add('.trae/instructions.md', makeGenericInstructions('Trae'));
  }

  return writes;
}

function readKitFile(rel) {
  return fs.readFileSync(path.join(KIT_ROOT, rel), 'utf8');
}

function writeManagedFile(file, content, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && !options.force) {
    const current = fs.readFileSync(file, 'utf8');
    if (current === content) {
      console.log(`unchanged ${path.relative(process.cwd(), file)}`);
      return;
    }
    const next = file + '.agent-workflow-new';
    fs.writeFileSync(next, content);
    console.log(`exists ${path.relative(process.cwd(), file)} -> wrote ${path.relative(process.cwd(), next)}`);
    return;
  }
  fs.writeFileSync(file, content);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

function printDryRun(target, profile, writes) {
  console.log(`Dry run 目标目录: ${target}`);
  console.log(`已识别工具: ${profile.detectedTools.join(', ') || '(无)'}`);
  console.log(`启用工具: ${profile.enabledTools.join(', ')}`);
  console.log(`已识别仓库: ${profile.repos.length}`);
  console.log(`缺失资料组: ${profile.missing.map((item) => item.key).join(', ') || '(无)'}`);
  console.log('计划写入:');
  for (const write of writes) console.log(`- ${path.relative(target, write.file)}`);
}

function makeTeamProfileYaml(profile) {
  const lines = [];
  lines.push('schema_version: "1.0"');
  lines.push(`generated_at: "${new Date().toISOString()}"`);
  lines.push(`generated_by: "${GENERATED_BY}"`);
  lines.push('');
  lines.push('team:');
  lines.push('  name: "<TODO: 团队名称>"');
  lines.push('  business_definition: "<TODO: 简短业务描述>"');
  lines.push('  target_users: []');
  lines.push('');
  lines.push('enabled_tools:');
  for (const tool of profile.enabledTools) lines.push(`  - ${tool}`);
  lines.push('');
  lines.push('detected_tools:');
  if (profile.detectedTools.length) for (const tool of profile.detectedTools) lines.push(`  - ${tool}`);
  else lines.push('  []');
  lines.push('');
  lines.push('source_materials:');
  for (const item of REQUIRED_SOURCES) {
    const source = profile.sources[item.key];
    lines.push(`  ${item.key}:`);
    lines.push(`    label: ${yamlString(item.label)}`);
    lines.push(`    status: ${yamlString(source.status)}`);
    lines.push('    paths:');
    if (source.paths.length) for (const p of source.paths) lines.push(`      - ${yamlString(p)}`);
    else lines.push('      []');
  }
  lines.push('');
  lines.push('repos:');
  if (profile.repos.length) {
    for (const repo of profile.repos) {
      lines.push(`  - path: ${yamlString(repo.path)}`);
      lines.push(`    marker: ${yamlString(repo.marker)}`);
      lines.push('    tech_stack:');
      for (const tech of repo.tech_stack) lines.push(`      - ${yamlString(tech)}`);
      lines.push('    family: "<TODO: 项目族分类>"');
      lines.push('    role: "<TODO: 服务或产品角色>"');
    }
  } else {
    lines.push('  []');
  }
  lines.push('');
  lines.push('branch_model:');
  lines.push('  type: "<TODO: trunk-based | gitflow | prod-test | custom>"');
  lines.push('  production_branch: "<TODO>"');
  lines.push('  integration_branch: "<TODO>"');
  lines.push('  feature_branch_rule: "<TODO>"');
  lines.push('  worktree_dir: "_worktrees"');
  lines.push('');
  lines.push('risk_policy:');
  lines.push('  remote_git_operations: "manual-only"');
  lines.push('  branch_creation: "manual-only"');
  lines.push('  push_and_release: "manual-only"');
  lines.push('  database_writes: "manual-only"');
  lines.push('  config_writes: "manual-only"');
  lines.push('  high_risk_files:');
  lines.push('    - "ci/**"');
  lines.push('    - "cd/**"');
  lines.push('    - "deploy/**"');
  lines.push('    - "*.env*"');
  lines.push('    - "application*.yml"');
  lines.push('    - "application*.yaml"');
  lines.push('    - "bootstrap*.yml"');
  lines.push('    - "bootstrap*.yaml"');
  lines.push('    - "pom.xml"');
  lines.push('    - "package.json"');
  lines.push('    - "lockfiles"');
  lines.push('');
  lines.push('workflow:');
  lines.push('  features_dir: "features"');
  lines.push('  core_dir: "workflow/core"');
  lines.push('  adapters_dir: "workflow/adapters"');
  lines.push('  require_stage_gate_for_code: true');
  lines.push('  require_feature_branch_for_code: true');
  lines.push('  same_repo_parallel_policy: "worktree-required-after-implementation-stage"');
  lines.push('');
  return lines.join('\n');
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function makeWorkflowReadme() {
  return `# Workflow

本目录由 ${GENERATED_BY} 生成。

- \`team-profile.yaml\`: 当前团队的本地配置。
- \`core/\`: 工具无关的工作流规则、命令、模板和能力。
- \`adapters/\`: 支持工具的 adapter 说明。
- \`INITIALIZATION_QUESTIONS.md\`: 缺少必要本地资料时生成的问题清单。

不要把凭证、真实客户秘密或私有 URL 写入通用 core 文件。团队业务知识应保留在 \`team-profile.yaml\` 或本地资料中。
`;
}

function makeInstallReport(profile, options) {
  return `# 安装报告

- 生成器: ${GENERATED_BY}
- 生成时间: ${new Date().toISOString()}
- 启用工具: ${profile.enabledTools.join(', ')}
- 已识别工具: ${profile.detectedTools.join(', ') || '(无)'}
- 已识别仓库: ${profile.repos.length}
- 强制覆盖: ${options.force ? '是' : '否'}
- 升级模式: ${options.upgrade ? '是' : '否'}

## 缺失资料组

${profile.missing.length ? profile.missing.map((item) => `- ${item.label} (${item.key})`).join('\n') : '- 无'}

## 安全边界

初始化器没有执行远程 Git 命令、创建分支、push 代码、触发构建 / 部署任务，也没有执行数据库写入。
`;
}

function makeQuestions(profile) {
  return `# 初始化待补资料

初始化器未找到全部必要本地资料。请补充路径后重新运行初始化器，或手动更新 \`workflow/team-profile.yaml\`。

${profile.missing.map((item) => `## ${item.label}\n\n${item.question}\n\n- path: <TODO>\n`).join('\n')}
`;
}

function makeCoreCommand(id, title, description) {
  const codeStage = id === '04-代码实现' || id === '04A-前端代码实现' || id === '04B-后端代码实现';
  const reviewStage = id === '05-代码审查';
  const prepStage = id === '03-06-研发准备';
  return `# /${id}

## 目标

${title}: ${description}

## 必要输入

- \`AGENTS.md\`
- \`workflow/team-profile.yaml\`
- \`features/{feature}/\` 下的前序阶段文档
- team-profile 中登记的本地代码、本地文档和用户提供资料

## 执行规则

- 先读取本地事实，再写结论。
- 区分已验证事实、设计意图、假设和缺失证据。
- 未真实执行的测试、构建、截图、部署或审查，不得写成已通过。
- 远程 Git 刷新、创建分支、push、tag、merge、构建 / 部署触发、数据库写入和生产配置写入都必须人工执行。
${codeStage ? '- 只有功能分支闸门、实现阶段闸门和同仓并行闸门全部通过后，才允许修改业务代码。' : '- 本阶段不授权修改业务代码；除非当前命令是实现命令且所有闸门已通过。'}
${prepStage ? '- 本编排命令只准备 03 到 06 文档，不授权代码实现。' : ''}
${reviewStage ? '- 审查输出以问题优先，按严重级别排序，并引用文件、diff、测试或运行证据。' : ''}

## 必要输出

- 更新或创建 \`features/{feature}/\` 下对应阶段文件。
- 阶段状态变化时更新 \`features/{feature}/00-工作流状态.md\`。
- 明确记录未解决问题和证据缺口。
`;
}

function makeCommandTable() {
  const header = '| 命令 | 阶段 | 作用 |\n| --- | --- | --- |';
  const rows = STAGES.map(
    ([id, title, description]) => `| \`/${id}\` | ${title} | ${description} |`
  );
  return [header, ...rows].join('\n');
}

function makeToolUsage(profile) {
  const tools = profile.enabledTools;
  const blocks = [];

  if (tools.includes('claude')) {
    blocks.push(`### Claude Code

- 阶段命令来自 \`.claude/commands/\`，可直接输入，例如 \`/04-代码实现 <feature>\`。
- 多文件或复杂改动先进入 plan mode，再执行。
- 每个命令文件都是薄 adapter，最终都指向 \`workflow/core/commands/\`。`);
  }

  if (tools.includes('codex')) {
    blocks.push(`### Codex

- Codex 会自动读取本 \`AGENTS.md\`。
- 阶段 prompt 位于 \`.codex/prompts/\`。可以调用阶段 prompt，或要求 Codex 按 \`workflow/core/commands/<stage>.md\` 执行。`);
  }

  if (tools.includes('cursor')) {
    blocks.push(`### Cursor

- 本 kit 会在 \`.cursor/commands/\` 生成 Cursor 自定义斜杠命令（Cursor 1.6+）。在 Agent 输入框输入 \`/\`，选择 \`/04-代码实现\` 等阶段，再描述功能。
- \`.cursor/rules/agent-workflow-core.mdc\` 会自动应用到每次请求。
- 兜底方式：直接 @ 阶段契约，例如 \`@workflow/core/commands/04-代码实现.md\`。
- agent 会读取阶段契约、\`workflow/team-profile.yaml\` 和前序 \`features/<feature>/\` 文档，再写阶段产物。
- 硬闸门仍然生效：实现必须先通过功能分支闸门和阶段闸门。`);
  }

  if (tools.includes('copilot')) {
    blocks.push(`### GitHub Copilot

- \`.github/copilot-instructions.md\` 会自动生效。
- 执行阶段时，在 chat 中引用 \`workflow/core/commands/<stage>.md\` 并描述功能。`);
  }

  for (const [tool, label] of [['codebuddy', 'CodeBuddy'], ['kiro', 'Kiro'], ['trae', 'Trae']]) {
    if (tools.includes(tool)) {
      blocks.push(`### ${label}

- \`.${tool}/instructions.md\` 会自动生效。
- 执行阶段时，在 chat 中引用 \`workflow/core/commands/<stage>.md\` 并描述功能。`);
    }
  }

  if (!blocks.length) {
    blocks.push(`未选择特定工具 adapter。请直接读取并执行 \`workflow/core/commands/<stage>.md\`。`);
  }

  return blocks.join('\n\n');
}

function makeAgentsEntry(profile) {
  return `# Agent Workflow

本工作区使用 ${GENERATED_BY} 生成的工具无关 agent 工作流。它按阶段推进：需求澄清、产品文档、技术架构、闸门后的实现、审查、测试、验收、上线通知和复盘。不同 AI 工具共享同一套 workflow core，每个工具只生成薄 adapter；体验会随工具能力增强或降级，但流程口径一致。

## 快速开始

1. 先读取 \`workflow/team-profile.yaml\`，加载当前团队的仓库、分支模型和资料来源。
2. 用 \`/new-feature <name>\` 初始化需求，它会创建 \`features/<name>/\` 和状态文件。
3. 按顺序推进阶段：\`/01-需求讨论\` -> \`/02-产品文档\` -> \`/03-技术架构\` -> \`/04-代码实现\` -> \`/05-代码审查\` -> \`/06-测试用例\` -> \`/07-测试执行\` -> \`/08-验收表格\` -> \`/09-验收\` -> \`/10-培训文档\` -> \`/11-上线邮件通知\` -> \`/12-复盘总结\`。
4. 每个阶段都必须读取 \`features/<name>/\` 下的前序文档，并把本阶段产物写回同目录。
5. 随时可执行 \`/workflow-status\` 汇总全部需求的阶段、阻塞和下一步。

不同工具触发阶段的方式不同，见下方“工具使用方式”。

## 工作流命令

${makeCommandTable()}

## 任务描述模板

启动阶段时，尽量用三段描述任务，保证 agent 有足够上下文：

- **目标**：完成后必须达成什么。
- **约束**：哪些内容不能改，例如公开 API、数据库结构、鉴权链路、无关模块。
- **验收**：如何证明正确，例如测试、脚本、API 调用、浏览器检查、截图。

## 单一事实源

- 工作流规则：\`workflow/core/\`
- 团队配置：\`workflow/team-profile.yaml\`
- 可复用检查能力：\`workflow/core/capabilities/\`
- 需求产物：\`features/<feature>/\`
- 工具 adapter：仅作为生成的薄入口

## 硬闸门

- 功能分支闸门和实现阶段闸门通过前，禁止修改业务代码。
- \`/03-06-研发准备\` 以及 01/02/03 阶段只授权分析和工作流文档。
- 远程 Git 操作必须人工执行：禁止自动 fetch、pull、clone、remote update、创建分支、push、tag、merge 或删除远端。
- 构建、部署、数据库写入、生产配置写入和发布动作必须人工执行；除非 team-profile 明确定义了安全的只读 adapter。
- 同仓多需求进入实现阶段后，必须使用独立 worktree。

## 工具能力策略

workflow core 是共享的。工具 adapter 可按当前工具能力增强或降级：

- L0：文档规则
- L1：prompt 和命令模板
- L2：工具原生规则或 slash commands
- L3：hooks 或前置检查
- L4：subagents 或多 agent 路由

不要承诺所有工具体验完全一致。只能使用当前工具自己的 adapter。

## 工具使用方式

${makeToolUsage(profile)}

## 已启用工具

${profile.enabledTools.map((tool) => `- ${tool}`).join('\n')}

## 参考文件

- \`workflow/README.md\`：工作流总览。
- \`workflow/core/commands/\`：各阶段契约。
- \`workflow/core/capabilities/README.md\`：可复用检查能力及工具适配方式。
- \`workflow/team-profile.yaml\`：当前团队配置和缺失资料记录。

## 开始

先读取 \`workflow/team-profile.yaml\`，再按用户请求的阶段读取 \`workflow/core/commands/\`。
`;
}

function makeThinCommand(toolName, id) {
  return `# ${toolName} adapter for /${id}

这是薄 adapter。执行时必须按顺序读取：

1. \`AGENTS.md\`
2. \`workflow/team-profile.yaml\`
3. \`workflow/core/commands/${id}.md\`

不得加入与 workflow/core 冲突的工具特定行为。
`;
}

function makePrompt(id) {
  return `# ${id}

读取 \`AGENTS.md\`、\`workflow/team-profile.yaml\` 和 \`workflow/core/commands/${id}.md\`。

优先使用本地证据。必要资料缺失时，更新 \`workflow/INITIALIZATION_QUESTIONS.md\` 或向用户索要缺失路径。
`;
}

function makeCursorRule() {
  return `---
description: "共享 agent 工作流：分阶段交付、审查、测试和发布准备。"
alwaysApply: true
---

# Agent Workflow (Cursor)

本工作区使用工具无关的分阶段工作流。本规则会自动应用到每次请求。
完整使用说明见 \`AGENTS.md\`。

## 在 Cursor 中执行阶段

本 kit 会在 \`.cursor/commands/\` 生成 Cursor 自定义 slash commands（Cursor 1.6+）。
在 Agent 输入框输入 \`/\`，选择阶段，再描述功能。例如：

- \`/01-需求讨论\` 开始一个新需求
- \`/04-代码实现\` 对指定需求进入实现阶段

兜底方式：可以直接 @ 阶段契约，例如
\`@workflow/core/commands/04-代码实现.md\`.

agent 随后读取阶段契约、\`workflow/team-profile.yaml\` 和前序
\`features/<feature>/\` 文档，并把阶段产物写入 \`features/<feature>/\`。

## 阶段顺序

new-feature -> 01-需求讨论 -> 02-产品文档 -> 03-技术架构 -> 04-代码实现 -> 05-代码审查 ->
06-测试用例 -> 07-测试执行 -> 08-验收表格 -> 09-验收 -> 10-培训文档 -> 11-上线邮件通知 -> 12-复盘总结

查看全部需求状态时，执行 \`workflow/core/commands/workflow-status.md\`。

## 任务描述

每个任务尽量写清目标、约束和验收方式。

## 事实源

- 工作流规则：\`workflow/core/\`
- 团队配置：\`workflow/team-profile.yaml\`
- 可复用检查能力：\`workflow/core/capabilities/\`
- 完整使用说明：\`AGENTS.md\`

## 硬闸门

- 功能分支闸门和实现阶段闸门通过前，禁止修改业务代码。
- 远程 Git 操作、创建分支、push、构建 / 部署触发、数据库写入和生产配置写入必须人工执行。
- 同仓并行实现进入实现阶段后必须使用独立 worktree。
`;
}

function makeGenericInstructions(toolName) {
  return `# ${toolName} 工作流说明

先读取 AGENTS.md，再按用户请求的阶段读取 workflow/team-profile.yaml 和 workflow/core/commands。

本文件是薄 adapter，不得覆盖 workflow/core 的硬闸门。
`;
}
