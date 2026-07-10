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
const GENERATED_BY = 'open-workflow-kit 0.6.0';

const STAGES = [
  ['init-workspace', '初始化工作区', '扫描本地资料、生成 team-profile、缺资料提问，并生成当前工具 adapter。'],
  ['connect-toolchain', '工具链连接规划', '探测或收集团队日志、构建、部署、配置、数据库等工具，生成并维护 MCP 连接计划，按执行策略推进连接。'],
  ['new-feature', '初始化功能工作流', '创建 features/{feature}/ 容器、状态文件和截图目录。'],
  ['01-需求讨论', '需求讨论', '澄清业务目标、边界、验收口径和待确认项。'],
  ['02-产品文档', '产品文档', '输出 PRD、业务规则、高层 UI 方向、非功能需求和验收口径。'],
  ['02B-UI设计', 'UI 设计', '在产品文档后输出可被实现遵循的信息架构、关键流程、页面清单、组件规范、平台适配、可访问性和 04A 交接规范。'],
  ['02C-HTML原型', 'HTML 可点击原型', '在 02B 设计基线上，用 design tokens 与组件清单产出前端开发级的单文件可点击 HTML 原型（可选阶段，显式触发）。'],
  ['03-技术架构', '技术架构', '识别项目族、影响仓库、调用链、分支基线和实现准入风险。'],
  ['03-06-研发准备', '研发准备编排', '在已有 PRD 和必要的 02B UI 设计基线后串联生成 03 到 06 的研发准备文档；不授权代码实现。'],
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
  'ci-cd-automation-governor.md',
  'deployment-readiness-checker.md',
  'runtime-evidence-triage.md',
  'data-change-safety-checker.md',
  'protocol-state-machine-checker.md',
  'test-evidence-reviewer.md',
  'ui-baseline-reviewer.md',
  'memory-curator.md',
  'rule-extractor.md',
  'toolchain-mcp-planner.md',
  'automated-test-runner.md'
];

const CHECKLIST_FILES = [
  'README.md',
  'rule-catalog.yaml',
  'validation-change-review.md',
  'data-consistency-review.md',
  'branch-hygiene.md',
  'test-blind-spots.md',
  'third-party-integration-review.md',
  'language-pitfalls-java.md'
];

const TOOLCHAIN_SLOTS = [
  ['runtime_logs', '运行日志'],
  ['ci_cd', 'CI/CD 流水线'],
  ['deploy_runtime', '部署运行态'],
  ['config_center', '配置中心'],
  ['database', '数据库查询'],
  ['git_platform', '代码托管平台']
];

// 注意：main() 在模块加载时同步执行，本常量必须定义在 main() 调用之前（TDZ）。
const SLOT_RECOMMENDATIONS = {
  runtime_logs: '优先接入所用日志平台的现成 MCP server（如 Grafana/Loki、Elasticsearch 生态）；无现成方案时用平台只读 REST API 包装。',
  ci_cd: 'GitHub Actions 走 GitHub 官方 MCP；GitLab CI 走 GitLab MCP；Jenkins 类自建平台优先社区 MCP，否则只读 REST 包装（读任务状态与构建日志）。',
  deploy_runtime: 'Kubernetes 优先社区 K8s MCP（限只读：get/describe/logs）；Docker 本地只读 CLI；PaaS 平台用官方 API 只读包装。',
  config_center: '配置中心通常无通用 MCP，建议只读 REST 包装（读取配置快照与发布历史）；严禁通过连接器发布配置。',
  database: '优先社区数据库 MCP（MySQL/PostgreSQL/MongoDB 均有），必须使用只读账号或只读连接串；有数据网关的团队优先走网关审计通道。',
  git_platform: 'GitHub/GitLab 均有官方或成熟 MCP；自建托管用只读 REST 包装（读 PR/分支/diff），写操作仍走执行策略。'
};

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
  const toolchain = detectToolchain(target, repos);
  const missing = REQUIRED_SOURCES.filter((item) => sources[item.key].status === 'missing');

  const profile = {
    target,
    enabledTools,
    detectedTools,
    repos,
    sources,
    toolchain,
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
    writeManagedFile(write, options);
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
  --upgrade            刷新生成文件；team-profile.yaml 永不原地覆盖（即使 --force），
                       新版内容写入 .agent-workflow-new 供人工比对合并。
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
  const add = (rel, content, opts) =>
    writes.push({ file: path.join(target, rel), content, preserveOnUpgrade: !!(opts && opts.preserveOnUpgrade) });

  // team-profile 是团队手工维护的契约：--upgrade 模式下永不原地覆盖（即使 --force），
  // 新版内容写 .agent-workflow-new 供人工比对合并。
  add('workflow/team-profile.yaml', makeTeamProfileYaml(profile), { preserveOnUpgrade: true });
  // 凭证目录防误提交：默认忽略 workflow/local/ 下全部内容。
  add('workflow/local/.gitignore', '*\n!.gitignore\n');
  add('workflow/README.md', makeWorkflowReadme());
  add('workflow/core/README.md', readKitFile('workflow/core/README.md'));
  add('workflow/core/commands/README.md', readKitFile('workflow/core/commands/README.md'));
  add('workflow/core/templates/README.md', readKitFile('workflow/core/templates/README.md'));
  add('workflow/core/templates/00-workflow-status.md', readKitFile('workflow/core/templates/00-workflow-status.md'));
  add('workflow/core/templates/stage-document.md', readKitFile('workflow/core/templates/stage-document.md'));
  add('workflow/core/templates/team-profile.template.yaml', readKitFile('workflow/core/templates/team-profile.template.yaml'));
  add('workflow/core/templates/api-test-plan.md', readKitFile('workflow/core/templates/api-test-plan.md'));
  add('workflow/core/templates/ui-test-plan.md', readKitFile('workflow/core/templates/ui-test-plan.md'));
  add('workflow/core/templates/prototype-page.html', readKitFile('workflow/core/templates/prototype-page.html'));
  add('workflow/core/execution-policy.md', readKitFile('workflow/core/execution-policy.md'));
  add('workflow/core/testing-automation-guide.md', readKitFile('workflow/core/testing-automation-guide.md'));
  add('workflow/core/capabilities/README.md', readKitFile('workflow/core/capabilities/README.md'));
  for (const name of CAPABILITY_FILES) {
    add(`workflow/core/capabilities/${name}`, readKitFile(`workflow/core/capabilities/${name}`));
  }
  for (const name of CHECKLIST_FILES) {
    add(`workflow/core/checklists/${name}`, readKitFile(`workflow/core/checklists/${name}`));
  }
  add('workflow/adapters/README.md', readKitFile('workflow/adapters/README.md'));
  add('workflow/TOOLCHAIN_MCP_PLAN.md', makeToolchainPlan(profile));
  add('workflow/INSTALL_REPORT.md', makeInstallReport(profile, options));
  if (profile.missing.length) add('workflow/INITIALIZATION_QUESTIONS.md', makeQuestions(profile));

  for (const [id, title, description] of STAGES) {
    const rel = `workflow/core/commands/${id}.md`;
    add(rel, readKitFileIfExists(rel, makeCoreCommand(id, title, description)));
  }

  // AGENTS.md is the tool-neutral entry document and the full usage guide.
  // Generate it regardless of selected tools so every adapter can point to it.
  add('AGENTS.md', makeAgentsEntry(profile));
  if (profile.enabledTools.includes('codex')) {
    // 官方约定：Codex 项目级机制是根 AGENTS.md（自动读取）与 .agents/skills/；
    // 项目级 .codex/prompts/ 不会被加载（custom prompts 仅支持全局 ~/.codex/prompts/）。
    add('.agents/skills/agent-workflow/SKILL.md', makeAgentWorkflowSkill());
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
    // 官方约定：项目规则位于 .codebuddy/rules/<rule-name>/RULE.mdc
    add('.codebuddy/rules/agent-workflow/RULE.mdc', makeGenericInstructions('CodeBuddy'));
  }
  if (profile.enabledTools.includes('kiro')) {
    // 官方约定：项目级 steering 文件位于 .kiro/steering/*.md；Kiro 也会自动读取根 AGENTS.md
    add('.kiro/steering/agent-workflow.md', makeGenericInstructions('Kiro'));
  }
  if (profile.enabledTools.includes('trae')) {
    add('.trae/instructions.md', makeGenericInstructions('Trae'));
  }

  return writes;
}

function readKitFile(rel) {
  return fs.readFileSync(path.join(KIT_ROOT, rel), 'utf8');
}

function readKitFileIfExists(rel, fallback) {
  const file = path.join(KIT_ROOT, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fallback;
}

function writeManagedFile(write, options) {
  const { file, content, preserveOnUpgrade } = write;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const exists = fs.existsSync(file);
  // 升级保护：team-profile 等团队手工维护文件在 --upgrade 下永不原地覆盖（即使 --force）。
  const protectedNow = exists && preserveOnUpgrade && options.upgrade;
  if (exists && (!options.force || protectedNow)) {
    const current = fs.readFileSync(file, 'utf8');
    if (current === content) {
      console.log(`unchanged ${path.relative(process.cwd(), file)}`);
      return;
    }
    const next = file + '.agent-workflow-new';
    fs.writeFileSync(next, content);
    const reason = protectedNow ? 'preserved (upgrade)' : 'exists';
    console.log(`${reason} ${path.relative(process.cwd(), file)} -> wrote ${path.relative(process.cwd(), next)}`);
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
  lines.push('schema_version: "1.1"');
  lines.push(`generated_at: "${new Date().toISOString()}"`);
  lines.push(`generated_by: "${GENERATED_BY}"`);
  lines.push('');
  lines.push('team:');
  lines.push('  name: "<TODO: 团队名称>"');
  lines.push('  business_definition: "<TODO: 简短业务描述>"');
  lines.push('  target_users: []');
  lines.push('');
  lines.push('workspace_context:');
  lines.push('  operating_defaults:');
  lines.push('    planning_language: "zh-CN"');
  lines.push('    display_language: "zh-CN-first"');
  lines.push('    language_policy: "默认用简体中文输出工作流沟通、阶段产物、状态摘要、审查、测试、验收、培训和上线通知；专有名词与官方英文术语保留原文。"');
  lines.push('    terminology_policy: "产品名、品牌名、代码标识符、命令、文件路径、分支名、API、SDK、框架、协议、标准、错误信息保持原文，除非用户要求本地化。"');
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
  lines.push('# 分级执行策略：高风险写操作默认不自动执行；agent 给出命令+风险说明+回滚提示，');
  lines.push('# 用户每次选择 agent 执行或手动执行。详见 workflow/core/execution-policy.md。');
  lines.push('execution_policy:');
  lines.push('  default_mode: "ask"   # ask=每次询问 / manual=只出命令永不代执行 / auto=常设授权(仍需风险声明+审计)');
  lines.push('  categories:');
  lines.push('    remote_git: "ask"');
  lines.push('    branch_creation: "ask"');
  lines.push('    push_tag_merge: "ask"');
  lines.push('    db_ddl: "ask"');
  lines.push('    db_dml: "ask"');
  lines.push('    production_config_write: "ask"');
  lines.push('    build_deploy_trigger: "ask"');
  lines.push('    config_write: "ask"');
  lines.push('  risk_statement_required: true');
  lines.push('  audit_log: "workflow/EXECUTION_AUDIT.md"');
  lines.push('');
  lines.push('risk_policy:');
  lines.push('  # 执行模式已迁移到 execution_policy；本段保留 CI/CD 成熟度规则与高风险文件清单。');
  lines.push('  ci_workflow_changes: "manual-review-required"');
  lines.push('  cd_workflow_changes: "manual-review-required"');
  lines.push('  auto_deploy_before_first_prod_release: "blocked"');
  lines.push('  production_deployments: "manual-approval-required-until-guarded-auto-approved"');
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
  lines.push('# 工具链槽位（初始化探测结果；provider 与状态由 /connect-toolchain 维护）');
  lines.push('toolchain:');
  for (const [key, label] of TOOLCHAIN_SLOTS) {
    const slot = (profile.toolchain && profile.toolchain[key]) || { detected: false, tools: [], evidence: [] };
    lines.push(`  ${key}:`);
    lines.push(`    label: ${yamlString(label)}`);
    lines.push(`    detected: ${slot.detected ? 'true' : 'false'}`);
    lines.push('    tools:');
    if (slot.tools.length) for (const tool of slot.tools) lines.push(`      - ${yamlString(tool)}`);
    else lines.push('      []');
    lines.push('    evidence:');
    if (slot.evidence.length) for (const ev of slot.evidence) lines.push(`      - ${yamlString(ev)}`);
    else lines.push('      []');
    lines.push(`    status: ${slot.detected ? '"proposed"' : '"pending-question"'}`);
  }
  lines.push('');
  lines.push('# 自动化测试双轨配置（配合 automated-test-runner 能力）');
  lines.push('testing:');
  lines.push('  api_track:');
  lines.push('    credentials_file: "workflow/local/test-credentials.env"   # 本地文件，不入版本库');
  lines.push('    environment_allowlist: []   # 逐项登记允许自动化的环境: - name/base_url');
  lines.push('    production_targets: "blocked"');
  lines.push('  ui_track:');
  lines.push('    browser_automation: "<TODO: 浏览器自动化 MCP，如 playwright-mcp | 工具内置 | none>"');
  lines.push('    miniprogram_automation: "disabled"   # 启用见 workflow/core/testing-automation-guide.md');
  lines.push('    evidence_dir: "features/{feature}/screenshots"');
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

function extractGitHost(rawUrl) {
  // 支持 scheme URL（https/ssh/git+ssh）与 scp 形式（git@host:org/repo）。
  // 无论哪种形式，先剥离 userinfo（含凭证），只返回纯 host；解析失败返回空串。
  let host = '';
  const schemeMatch = rawUrl.match(/^[a-z][a-z0-9+.-]*:\/\/([^\/\s]+)/i);
  if (schemeMatch) {
    host = schemeMatch[1];
  } else {
    const scpMatch = rawUrl.match(/^([^\/\s]+?):[^\s]/);
    host = scpMatch ? scpMatch[1] : '';
  }
  if (!host) return '';
  // 剥离 userinfo（user 或 user:token）与端口
  host = host.split('@').pop();
  host = host.split(':')[0];
  host = host.toLowerCase().trim();
  // host 合法性兜底：只允许字母数字、点、连字符
  if (!/^[a-z0-9.-]+$/.test(host)) return '';
  return host;
}

function safeReadFile(file, maxBytes) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > maxBytes) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function detectToolchain(root, repos) {
  const slots = {};
  for (const [key] of TOOLCHAIN_SLOTS) slots[key] = { detected: false, tools: [], evidence: [] };
  const addHit = (slotKey, tool, evidence) => {
    const slot = slots[slotKey];
    slot.detected = true;
    if (!slot.tools.includes(tool)) slot.tools.push(tool);
    if (evidence && !slot.evidence.includes(evidence) && slot.evidence.length < 8) slot.evidence.push(evidence);
  };
  const existsRel = (rel) => fs.existsSync(path.join(root, rel));

  // 根目录 + 各识别仓库目录的文件信号
  const bases = ['.'];
  for (const repo of repos) if (!bases.includes(repo.path)) bases.push(repo.path);
  for (const base of bases) {
    const p = (rel) => (base === '.' ? rel : path.join(base, rel));
    if (existsRel(p('Jenkinsfile'))) addHit('ci_cd', 'jenkins', p('Jenkinsfile'));
    if (existsRel(p('.github/workflows'))) addHit('ci_cd', 'github-actions', p('.github/workflows/'));
    if (existsRel(p('.gitlab-ci.yml'))) addHit('ci_cd', 'gitlab-ci', p('.gitlab-ci.yml'));
    if (existsRel(p('.circleci'))) addHit('ci_cd', 'circleci', p('.circleci/'));
    if (existsRel(p('Dockerfile'))) addHit('deploy_runtime', 'docker', p('Dockerfile'));
    if (existsRel(p('docker-compose.yml'))) {
      addHit('deploy_runtime', 'docker-compose', p('docker-compose.yml'));
    } else if (existsRel(p('docker-compose.yaml'))) {
      addHit('deploy_runtime', 'docker-compose', p('docker-compose.yaml'));
    }
    for (const dir of ['k8s', 'kubernetes', 'helm', 'charts', 'deploy/k8s']) {
      if (existsRel(p(dir))) addHit('deploy_runtime', 'kubernetes', p(dir + '/'));
    }
    if (existsRel(p('vercel.json'))) addHit('deploy_runtime', 'vercel', p('vercel.json'));
    if (existsRel(p('netlify.toml'))) addHit('deploy_runtime', 'netlify', p('netlify.toml'));

    // git 平台：读 .git/config 的 remote host（本地只读）。
    // 安全：remote URL 的 userinfo 段（@ 之前）可能携带凭证，
    // 必须先剥离 userinfo 再取 host，任何情况下不得把原始 URL 写入生成文件。
    const gitConfig = path.join(root, base === '.' ? '.git/config' : path.join(base, '.git/config'));
    const configText = safeReadFile(gitConfig, 64 * 1024);
    if (configText) {
      const match = configText.match(/url\s*=\s*(\S+)/);
      if (match) {
        const host = extractGitHost(match[1]);
        if (host) {
          let tool = 'self-hosted-git';
          if (host.includes('github.com')) tool = 'github';
          else if (host.includes('gitlab')) tool = 'gitlab';
          else if (host.includes('bitbucket')) tool = 'bitbucket';
          else if (host.includes('gitee')) tool = 'gitee';
          else if (host.includes('gitea')) tool = 'gitea';
          addHit('git_platform', tool, `${base === '.' ? '.git/config' : base + '/.git/config'} -> ${host}`);
        }
      }
    }
  }

  // 配置内容信号：轻量扫描常见配置文件（深度 4，单文件 <=200KB）
  // 同时兜底 monorepo 场景：根目录是 git 仓库时，scanRepos 不会下钻子目录，
  // 子目录里的 CI / 容器文件靠这里的按名扫描补检。
  walkFiles(root, 4, (file) => {
    const name = path.basename(file).toLowerCase();
    const rel = path.relative(root, file);
    if (name === 'jenkinsfile') addHit('ci_cd', 'jenkins', rel);
    if (name === '.gitlab-ci.yml') addHit('ci_cd', 'gitlab-ci', rel);
    if (name === 'dockerfile') addHit('deploy_runtime', 'docker', rel);
    if (name === 'docker-compose.yml' || name === 'docker-compose.yaml') {
      addHit('deploy_runtime', 'docker-compose', rel);
    }
    if (/^(application|bootstrap)[^\/]*\.(yml|yaml|properties)$/.test(name)) {
      const text = safeReadFile(file, 200 * 1024);
      if (!text) return;
      if (/nacos/i.test(text)) addHit('config_center', 'nacos', rel);
      if (/apollo\b/i.test(text)) addHit('config_center', 'apollo', rel);
      if (/consul/i.test(text)) addHit('config_center', 'consul', rel);
      if (/jdbc:mysql/i.test(text)) addHit('database', 'mysql', rel);
      if (/jdbc:postgresql/i.test(text)) addHit('database', 'postgresql', rel);
      if (/mongodb(\+srv)?:\/\//i.test(text)) addHit('database', 'mongodb', rel);
      if (/logging\.|logstash|elasticsearch/i.test(text)) addHit('runtime_logs', 'app-logging-config', rel);
    }
    if (/^(logback|log4j2?)[^\/]*\.(xml|yml|yaml|properties)$/.test(name)) {
      addHit('runtime_logs', 'logback-or-log4j', rel);
    }
    if (name === 'prisma.schema' || name === 'schema.prisma') addHit('database', 'prisma', rel);
    if (name === 'package.json') {
      const text = safeReadFile(file, 200 * 1024);
      if (!text) return;
      try {
        const pkg = JSON.parse(text);
        const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
        if (deps.winston) addHit('runtime_logs', 'winston', rel);
        if (deps.pino) addHit('runtime_logs', 'pino', rel);
        if (deps.prisma || deps['@prisma/client']) addHit('database', 'prisma', rel);
        if (deps.mongoose) addHit('database', 'mongodb', rel);
        if (deps.mysql || deps.mysql2) addHit('database', 'mysql', rel);
        if (deps.pg) addHit('database', 'postgresql', rel);
        if (deps.typeorm) addHit('database', 'typeorm', rel);
        if (deps.sequelize) addHit('database', 'sequelize', rel);
      } catch {
        /* 忽略不可解析的 package.json */
      }
    }
  });

  return slots;
}

function makeToolchainPlan(profile) {
  const lines = [];
  lines.push('# 工具链 MCP 连接计划（TOOLCHAIN_MCP_PLAN）');
  lines.push('');
  lines.push(`> 由 ${GENERATED_BY} 探测生成；用 \`/connect-toolchain\` 补齐与推进。`);
  lines.push('> 原则：现成 MCP 优先，REST 包装次之，自研兜底；权限默认只读；凭证只写环境变量名占位，真实值永不入库。');
  lines.push('');
  lines.push('## 连接节奏选择');
  lines.push('');
  lines.push('- [ ] 一键连接：本轮把下方所有 `proposed` 槽位全部推进连接');
  lines.push('- [ ] 逐个连接：只推进我勾选的槽位，其余标记 `deferred`');
  lines.push('');
  for (const [key, label] of TOOLCHAIN_SLOTS) {
    const slot = (profile.toolchain && profile.toolchain[key]) || { detected: false, tools: [], evidence: [] };
    lines.push(`## 槽位：${label}（${key}）`);
    lines.push('');
    if (slot.detected) {
      lines.push(`- 检测结果：已检测到 —— ${slot.tools.join(', ')}`);
      lines.push(`- 证据：${slot.evidence.map((ev) => '`' + ev + '`').join('、')}`);
      lines.push(`- 推荐方案：${SLOT_RECOMMENDATIONS[key]}`);
      lines.push('- 权限：read_only（默认）');
      lines.push('- 凭证：`<环境变量名占位>`（真实值放本地，不入库）');
      lines.push('- 状态：`proposed`　选择：[ ] 本轮连接　[ ] 后续连接　[ ] 不需要');
    } else {
      lines.push('- 检测结果：未检测到本地痕迹');
      lines.push('- 下一步：运行 `/connect-toolchain`，从常用工具菜单选择，或输入工具名称与地址由 agent 调研后补方案');
      lines.push('- 状态：`pending-question`');
    }
    lines.push('');
  }
  lines.push('## 执行边界');
  lines.push('');
  lines.push('- 连接动作（写入 AI 工具的 MCP 客户端配置）属 `config_write` 类别，按 `workflow/core/execution-policy.md` 默认逐次询问。');
  lines.push('- 所有连接器默认只读；申请写权限必须单独列动作清单并审批。');
  lines.push('- 本计划文档中出现真实密钥、token 或内网凭证即视为违规，必须立即移除并轮换。');
  lines.push('');
  return lines.join('\n');
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function makeWorkflowReadme() {
  return `# Workflow

本目录由 ${GENERATED_BY} 生成。

- \`team-profile.yaml\`: 当前团队的本地配置（含分级执行策略、工具链槽位与测试配置）。
- \`core/\`: 工具无关的工作流规则、命令、模板、能力和检查清单。
- \`core/execution-policy.md\`: 高风险写操作的分级执行策略。
- \`core/checklists/\`: 高频事故模式的逐项检查清单。
- \`adapters/\`: 支持工具的 adapter 说明。
- \`TOOLCHAIN_MCP_PLAN.md\`: 工具链 MCP 连接计划（\`/connect-toolchain\` 维护）。
- \`INITIALIZATION_QUESTIONS.md\`: 缺少必要本地资料时生成的问题清单。

默认使用简体中文展示工作流沟通、阶段产物、状态摘要、审查结论、测试记录、验收材料、培训文档和上线通知；专有名词、产品名、代码标识符、命令、文件路径、分支名、API、SDK、框架、协议、标准、错误信息和官方英文术语保留原文。

工作流阶段产物放在工作区级 \`features/<feature>/\` 下，不写入目标代码仓库。目标代码仓库只保留源码、代码相关配置、运行或构建必需资产，以及最小必要的代码侧 \`README\` 内容。

\`/02B-UI设计\` 是前端实现的设计闸门；\`/04A-前端代码实现\` 必须读取并遵循 \`features/<feature>/02B-UI设计.md\`，缺失时先补齐或记录用户明确授权的范围有限豁免。

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
- 高风险写操作（远程 Git 刷新、创建分支、push/tag/merge、构建 / 部署触发、数据库写入、生产配置写入）按 \`workflow/core/execution-policy.md\` 分级处理：默认每次询问，由用户选择执行者。
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

- Codex 会自动读取本 \`AGENTS.md\`（官方项目级指令机制）。
- 本 kit 同时生成 \`.agents/skills/agent-workflow/SKILL.md\`，可按 skill 调用。
- 执行阶段时直接说明阶段名，或要求 Codex 按 \`workflow/core/commands/<stage>.md\` 执行。
- 注意：项目级 \`.codex/prompts/\` 不会被 Codex 加载（custom prompts 仅支持全局 \`~/.codex/prompts/\`），本 kit 不生成该目录。`);
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

  if (tools.includes('codebuddy')) {
    blocks.push(`### CodeBuddy

- 项目规则 \`.codebuddy/rules/agent-workflow/RULE.mdc\` 会自动生效（官方项目级规则路径）。
- 执行阶段时，在 chat 中引用 \`workflow/core/commands/<stage>.md\` 并描述功能。`);
  }

  if (tools.includes('kiro')) {
    blocks.push(`### Kiro

- steering 文件 \`.kiro/steering/agent-workflow.md\` 会自动生效；Kiro 也会自动读取本 \`AGENTS.md\`。
- 执行阶段时，在 chat 中引用 \`workflow/core/commands/<stage>.md\` 并描述功能。`);
  }

  if (tools.includes('trae')) {
    blocks.push(`### Trae

- \`.trae/instructions.md\` 会自动生效。
- 执行阶段时，在 chat 中引用 \`workflow/core/commands/<stage>.md\` 并描述功能。`);
  }

  if (!blocks.length) {
    blocks.push(`未选择特定工具 adapter。请直接读取并执行 \`workflow/core/commands/<stage>.md\`。`);
  }

  return blocks.join('\n\n');
}

function makeAgentsEntry(profile) {
  return `# Agent Workflow

本工作区使用 ${GENERATED_BY} 生成的工具无关团队 agent 工作流。它按阶段推进：需求澄清、产品文档、UI 设计、技术架构、闸门后的实现、审查、测试、验收、培训、上线通知和复盘。不同 AI 工具共享同一套 workflow core，每个工具只生成薄 adapter；体验会随工具能力增强或降级，但流程口径一致。

## 快速开始

1. 先读取 \`workflow/team-profile.yaml\`，加载当前团队的仓库、分支模型和资料来源。
2. 首次接入建议执行 \`/connect-toolchain\`：按 \`workflow/TOOLCHAIN_MCP_PLAN.md\` 把团队的日志、CI/CD、部署、配置中心、数据库等工具接成只读证据链。
3. 用 \`/new-feature <name>\` 初始化需求，它会创建 \`features/<name>/\` 和状态文件。
4. 按顺序推进阶段：\`/01-需求讨论\` -> \`/02-产品文档\` -> \`/02B-UI设计\` -> \`/03-技术架构\` -> \`/04-代码实现\` -> \`/05-代码审查\` -> \`/06-测试用例\` -> \`/07-测试执行\` -> \`/08-验收表格\` -> \`/09-验收\` -> \`/10-培训文档\` -> \`/11-上线邮件通知\` -> \`/12-复盘总结\`。需要可点击原型对齐时，在 02B 后显式执行 \`/02C-HTML原型\`（可选阶段）。
5. 每个阶段都必须读取 \`features/<name>/\` 下的前序文档，并把本阶段产物写回同目录。
6. 随时可执行 \`/workflow-status\` 汇总全部需求的阶段、阻塞和下一步。

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
- 需求产物：工作区级 \`features/<feature>/\`
- 工具 adapter：仅作为生成的薄入口

## 硬闸门

- 产品和工作流文档必须与代码仓库分开：除非用户明确要求公开文档并确认它应随代码发布，否则不要把 \`features/<feature>/\`、PRD、竞品调研、法务草案、隐私政策、合规说明、验收文档或内部决策包提交到应用或源码仓库。
- 功能分支闸门和实现阶段闸门通过前，禁止修改业务代码。
- \`/02B-UI设计\` 是前端实现的设计闸门；\`/04A-前端代码实现\` 必须读取并遵循工作区级 \`features/<feature>/02B-UI设计.md\`，缺失时先补齐 02B，除非用户明确给出范围有限的设计豁免。可点击原型只能通过 \`/02C-HTML原型\` 显式产出，且必须受 \`workflow/design/tokens.css\` 与组件清单约束。
- \`/03-06-研发准备\` 以及 01/02/02B/03 阶段只授权分析和工作流文档。
- 高风险写操作（远程 Git、创建分支、push/tag/merge、数据库 DDL/DML、生产配置写入、构建部署触发）**默认不自动执行**，按 \`workflow/core/execution-policy.md\` 分级处理：agent 必须给出完整命令 + 风险说明 + 回滚方式，由用户每次选择"agent 执行 / 我手动执行"；用户批准的代执行必须写入 \`workflow/EXECUTION_AUDIT.md\`。
- 自动化测试（\`automated-test-runner\`）目标环境必须在 \`team-profile#testing\` 白名单内，生产环境默认阻断；测试凭证只放本地未跟踪文件，不进文档与仓库。
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
- \`workflow/core/checklists/README.md\`：高频事故模式的逐项检查清单。
- \`workflow/core/execution-policy.md\`：高风险写操作的分级执行策略与审计要求。
- \`workflow/TOOLCHAIN_MCP_PLAN.md\`：工具链 MCP 连接计划（由 \`/connect-toolchain\` 维护）。
- \`workflow/core/testing-automation-guide.md\`：接口/功能测试双轨自动化接入指引。
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

function makeAgentWorkflowSkill() {
  return `---
name: agent-workflow
description: 按 open-workflow-kit 的阶段契约推进需求交付。适用于需求讨论、产品文档、UI 设计、技术架构、代码实现、审查、测试、验收、上线与复盘等阶段请求。
---

# agent-workflow

执行任何工作流阶段时，按顺序读取：

1. 根目录 \`AGENTS.md\`（快速开始、命令表、硬闸门）
2. \`workflow/team-profile.yaml\`（团队契约：仓库、分支模型、执行策略、测试配置）
3. \`workflow/core/commands/<用户请求的阶段>.md\`（阶段契约）

规则：

- 阶段产物写入工作区级 \`features/<feature>/\`，不写入代码仓库。
- 高风险写操作按 \`workflow/core/execution-policy.md\` 分级处理。
- 优先使用本地证据；必要资料缺失时更新 \`workflow/INITIALIZATION_QUESTIONS.md\` 或向用户索要路径。
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

new-feature -> 01-需求讨论 -> 02-产品文档 -> 02B-UI设计 -> (可选 02C-HTML原型) -> 03-技术架构 -> 04-代码实现 -> 05-代码审查 ->
06-测试用例 -> 07-测试执行 -> 08-验收表格 -> 09-验收 -> 10-培训文档 -> 11-上线邮件通知 -> 12-复盘总结

工具链接入执行 \`/connect-toolchain\`；查看全部需求状态时，执行 \`workflow/core/commands/workflow-status.md\`。

## 任务描述

每个任务尽量写清目标、约束和验收方式。

## 事实源

- 工作流规则：\`workflow/core/\`
- 团队配置：\`workflow/team-profile.yaml\`
- 可复用检查能力：\`workflow/core/capabilities/\`
- 完整使用说明：\`AGENTS.md\`

## 硬闸门

- 功能分支闸门和实现阶段闸门通过前，禁止修改业务代码。
- 有 UI 或前端工作的需求必须先完成 \`/02B-UI设计\`，\`/04A-前端代码实现\` 必须遵循对应设计基线。
- 高风险写操作（远程 Git、创建分支、push、构建 / 部署触发、数据库写入、生产配置写入）按
  \`workflow/core/execution-policy.md\` 分级处理：默认每次询问，agent 出命令 + 风险说明，用户选择执行者。
- 同仓并行实现进入实现阶段后必须使用独立 worktree。
`;
}

function makeGenericInstructions(toolName) {
  return `# ${toolName} 工作流说明

先读取 AGENTS.md，再按用户请求的阶段读取 workflow/team-profile.yaml 和 workflow/core/commands。

本文件是薄 adapter，不得覆盖 workflow/core 的硬闸门。
`;
}
