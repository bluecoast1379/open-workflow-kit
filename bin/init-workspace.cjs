#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadCommandManifest } = require('./command-manifest.cjs');

const KIT_ROOT = path.resolve(__dirname, '..');
const COMMAND_MANIFEST = loadCommandManifest(path.join(KIT_ROOT, 'workflow/core/command-manifest.yaml'));
const COMMANDS = COMMAND_MANIFEST.commands;
const SUPPORTED_TOOLS = ['codex', 'claude', 'cursor', 'copilot', 'codebuddy', 'kiro', 'trae'];
const TOOL_ALIASES = {
  trea: 'trae',
  claude_code: 'claude',
  'claude-code': 'claude',
  github_copilot: 'copilot',
  'github-copilot': 'copilot'
};
const GENERATED_BY = `open-workflow-kit ${readPackageVersion()}`;
const MANAGED_ADAPTER_MARKER = 'generated-by: open-workflow-kit; managed-adapter: true';

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
  },
  {
    key: 'security_privacy_rules',
    label: '安全、隐私与合规规范',
    question: '请提供安全、隐私、合规或威胁模型资料路径',
    match: /(security|privacy|compliance|threat|安全|隐私|合规|威胁)/i
  },
  {
    key: 'operations_rules',
    label: '可观测性、值班与恢复规范',
    question: '请提供日志、指标、告警、值班、灾备或恢复资料路径',
    match: /(observability|monitor|alert|oncall|runbook|recovery|日志|指标|告警|值班|灾备|恢复)/i
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

// 历史版本生成过、当前版本已不再生成的适配器路径。
// --upgrade 时对这些路径做指纹校验后自动清理（详见 cleanupLegacyArtifacts）。
const LEGACY_ARTIFACTS = [
  { rel: '.codex/prompts', kind: 'dir', reason: 'Codex 不加载项目级 prompts（v0.6.0 起改为根 AGENTS.md + .agents/skills/）' },
  { rel: '.kiro/instructions.md', kind: 'file', reason: 'Kiro 官方路径为 .kiro/steering/（v0.6.0 起）' },
  { rel: '.codebuddy/instructions.md', kind: 'file', reason: 'CodeBuddy 不使用旧 instructions.md 路径（v0.6.0 起）' },
  { rel: '.codebuddy/rules/agent-workflow/RULE.mdc', kind: 'file', reason: 'CodeBuddy 项目规则应为 .codebuddy/rules/*.md（v0.8.0 起）' },
  { rel: '.trae/instructions.md', kind: 'file', reason: 'Trae 官方项目入口已迁移到 .trae/commands/ 与 .trae/skills/' },
  {
    rel: 'workflow/core/checklists/rule-catalog.yaml',
    kind: 'file',
    marker: 'total_items: 79',
    reason: '规则目录迁移到 workflow/core/rules/rule-catalog.yaml（v0.8.0 起）'
  }
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const requestedTarget = path.resolve(options.target || process.cwd());
  if (!fs.existsSync(requestedTarget) || !fs.statSync(requestedTarget).isDirectory()) {
    throw new Error(`目标目录不存在: ${requestedTarget}`);
  }
  const target = fs.realpathSync(requestedTarget);

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
    localSourcePaths: {},
    toolchain,
    missing
  };

  if (interactive && missing.length) {
    for (const item of missing) {
      const answer = await promptLine(`${item.question} (optional, comma separated): `);
      if (answer.trim()) {
        const classified = classifySourcePaths(
          target,
          answer.split(',').map((v) => v.trim()).filter(Boolean)
        );
        if (classified.local.length) profile.localSourcePaths[item.key] = classified.local;
        sources[item.key] = {
          status: classified.shared.length
            ? (classified.local.length ? 'provided_by_user_with_local_paths' : 'provided_by_user')
            : 'provided_local_only',
          paths: classified.shared
        };
      }
    }
    profile.missing = REQUIRED_SOURCES.filter((item) => sources[item.key].status === 'missing');
  }

  const plannedWrites = buildInstallPlan(target, profile, options);
  const legacyPlan = planLegacyCleanup(target, options, plannedWrites, profile.enabledTools);
  if (options.dryRun) {
    printDryRun(target, profile, plannedWrites, legacyPlan);
    return;
  }

  assertSafeWritePlan(target, plannedWrites);
  for (const write of plannedWrites) {
    writeManagedFile(write, { ...options, target });
  }
  executeLegacyCleanup(legacyPlan);

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

module.exports = {
  classifySourcePaths,
  extractGitHost
};

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
  if (exists('.trae') || exists('.trae-cn')) hits.push('trae');
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
  return repos.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
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
  add('workflow/local/team-profile.local.yaml', makeLocalTeamProfileYaml(profile), { preserveOnUpgrade: true });
  add('workflow/local/rule-provenance.private.yaml', makePrivateRuleProvenanceYaml(), { preserveOnUpgrade: true });
  add('workflow/README.md', makeWorkflowReadme());

  // Static workflow assets are directory-driven. New commands, schemas, policy packs,
  // capabilities and completion templates are therefore installable without maintaining
  // a second hard-coded list in the initializer.
  for (const rel of listKitFiles('workflow')) {
    if (isGeneratedWorkflowPath(rel)) continue;
    add(rel, readKitFile(rel));
  }

  // Ship every workspace-safe runtime/checker. init-workspace itself is package-scoped:
  // copying it under workflow/bin would change KIT_ROOT and make it unusable.
  for (const rel of listKitFiles('bin')) {
    if (path.basename(rel) === 'init-workspace.cjs') continue;
    add(path.join('workflow/bin', path.relative('bin', rel)), readKitFile(rel));
  }
  add('workflow/TOOLCHAIN_MCP_PLAN.md', makeToolchainPlan(profile));
  add('workflow/INSTALL_REPORT.md', makeInstallReport(profile, options));
  if (profile.missing.length) add('workflow/INITIALIZATION_QUESTIONS.md', makeQuestions(profile));

  // AGENTS.md is the tool-neutral entry document and the full usage guide.
  // Generate it regardless of selected tools so every adapter can point to it.
  add('AGENTS.md', makeAgentsEntry(profile));
  if (profile.enabledTools.includes('codex')) {
    // Codex 项目级机制是根 AGENTS.md（自动读取）与 .agents/skills/。
    // 项目级 .codex/prompts/ 不会被加载。
    add('.agents/skills/agent-workflow/SKILL.md', makeAgentWorkflowSkill());
    for (const command of COMMANDS) {
      const base = `.agents/skills/${command.skill_slug}`;
      add(`${base}/SKILL.md`, makeStageSkill(command));
      add(`${base}/agents/openai.yaml`, makeStageSkillMetadata(command));
    }
  }
  if (profile.enabledTools.includes('claude')) {
    add('CLAUDE.md', '先读取 AGENTS.md，再遵循 workflow/core 和 workflow/team-profile.yaml。.claude/commands 下的工具命令只是薄 adapter。\n');
    for (const command of COMMANDS) {
      add(`.claude/commands/${command.id}.md`, makeSlashCommand('Claude Code', command, '$ARGUMENTS'));
    }
    // 官方推荐的 skills 格式入口（可被 Claude 自主调用）；分阶段中文命令仍走 commands
    // （官方兼容格式），待非 ASCII skill 命名支持明确后再整体切换。
    add('.claude/skills/agent-workflow/SKILL.md', makeClaudeWorkflowSkill());
  }
  if (profile.enabledTools.includes('cursor')) {
    add('.cursor/rules/agent-workflow-core.mdc', makeCursorRule());
    // Cursor 1.6+ supports custom slash commands from .cursor/commands/*.md.
    for (const command of COMMANDS) {
      add(`.cursor/commands/${command.id}.md`, makeSlashCommand('Cursor', command, '命令后附加的用户输入'));
    }
  }
  if (profile.enabledTools.includes('copilot')) {
    add('.github/copilot-instructions.md', makeGenericInstructions('GitHub Copilot'));
    for (const command of COMMANDS) {
      add(`.github/prompts/${command.skill_slug}.prompt.md`, makeCopilotPrompt(command));
    }
  }
  if (profile.enabledTools.includes('codebuddy')) {
    // CodeBuddy 项目规则与自定义 slash commands 都使用官方项目级目录。
    add('.codebuddy/rules/agent-workflow.md', makeGenericInstructions('CodeBuddy'));
    for (const command of COMMANDS) {
      add(`.codebuddy/commands/${command.id}.md`, makeCodeBuddyCommand(command));
    }
  }
  if (profile.enabledTools.includes('kiro')) {
    // Kiro IDE 会把 inclusion: manual 的 workspace steering 暴露为 slash command；
    // Kiro CLI 会把 .kiro/skills/ 中的 skills 暴露为 slash command。
    add('.kiro/steering/agent-workflow.md', makeKiroRootSteering());
    for (const command of COMMANDS) {
      add(`.kiro/steering/${command.skill_slug}.md`, makeKiroManualSteering(command));
      add(`.kiro/skills/${command.skill_slug}/SKILL.md`, makeStageSkill(command));
    }
  }
  if (profile.enabledTools.includes('trae')) {
    // Trae 的项目级 Commands 与 Skills 是主入口；.trae-cn 是中文发行版兼容镜像，
    // 不把兼容镜像的文件存在视为真实工具验收。
    for (const base of ['.trae', '.trae-cn']) {
      add(`${base}/skills/agent-workflow/SKILL.md`, makeAgentWorkflowSkill());
      for (const command of COMMANDS) {
        add(`${base}/commands/${command.id}.md`, makeSlashCommand('Trae', command, '命令后附加的用户输入'));
        add(`${base}/skills/${command.skill_slug}/SKILL.md`, makeStageSkill(command));
      }
    }
  }

  return writes;
}

function readKitFile(rel) {
  return fs.readFileSync(path.join(KIT_ROOT, rel), 'utf8');
}

function listKitFiles(relativeRoot) {
  const files = [];
  const absoluteRoot = path.join(KIT_ROOT, relativeRoot);

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store' || entry.name.endsWith('.agent-workflow-new')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(path.relative(KIT_ROOT, full));
    }
  }

  visit(absoluteRoot);
  return files.sort();
}

function isGeneratedWorkflowPath(rel) {
  const normalized = rel.split(path.sep).join('/');
  if (normalized === 'workflow/README.md' || normalized === 'workflow/team-profile.yaml') return true;
  if (normalized === 'workflow/TOOLCHAIN_MCP_PLAN.md' || normalized === 'workflow/INSTALL_REPORT.md') return true;
  if (normalized === 'workflow/INITIALIZATION_QUESTIONS.md') return true;
  return normalized.startsWith('workflow/local/');
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : 'development';
  } catch {
    return 'development';
  }
}

function writeManagedFile(write, options) {
  const { file, content, preserveOnUpgrade } = write;
  assertSafeManagedPath(options.target, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  assertSafeManagedPath(options.target, file);
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

function assertSafeWritePlan(target, writes) {
  for (const write of writes) assertSafeManagedPath(target, write.file);
}

function assertSafeManagedPath(target, file) {
  const root = path.resolve(target);
  const resolved = path.resolve(file);
  const relative = path.relative(root, resolved);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`拒绝写入工作区外路径: ${file}`);
  let current = root;
  const parts = relative.split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`拒绝通过 symbolic link 写入 managed path: ${current}`);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`managed path 的父路径不是目录: ${current}`);
  }
}

function printDryRun(target, profile, writes, legacyPlan) {
  console.log(`Dry run 目标目录: ${target}`);
  console.log(`已识别工具: ${profile.detectedTools.join(', ') || '(无)'}`);
  console.log(`启用工具: ${profile.enabledTools.join(', ')}`);
  console.log(`已识别仓库: ${profile.repos.length}`);
  console.log(`缺失资料组: ${profile.missing.map((item) => item.key).join(', ') || '(无)'}`);
  console.log('计划写入:');
  for (const write of writes) console.log(`- ${path.relative(target, write.file)}`);
  if (legacyPlan && (legacyPlan.remove.length || legacyPlan.keep.length)) {
    console.log('旧版残留清理计划（--upgrade 时执行）:');
    for (const item of legacyPlan.remove) console.log(`- 将删除 ${path.relative(target, item.file)}（kit 指纹匹配；${item.reason}）`);
    for (const item of legacyPlan.keep) console.log(`- 保留 ${path.relative(target, item.file)}（内容不匹配 kit 指纹，疑似用户自定义，请手动确认）`);
  }
}

// kit 生成的薄 adapter 都同时引用 AGENTS.md 与 workflow/core 或 team-profile；
// 满足该指纹才认定为 kit 生成物，允许自动清理，避免误删用户自定义文件。
function looksKitGenerated(text) {
  return text.includes('AGENTS.md') && (text.includes('workflow/core') || text.includes('workflow/team-profile'));
}

function looksManagedAdapter(text) {
  return text.includes(MANAGED_ADAPTER_MARKER) || (
    looksKitGenerated(text) &&
    (text.includes('由命令清单生成') || text.includes('command-manifest.yaml') || text.includes('分阶段发现入口'))
  );
}

function looksLegacyGenerated(text, artifact) {
  if (artifact.marker) return text.includes(artifact.marker);
  return looksKitGenerated(text);
}

function planLegacyCleanup(target, options, plannedWrites = [], enabledTools = []) {
  const plan = { remove: [], keep: [], dirs: [] };
  if (!options.upgrade) return plan;
  for (const artifact of LEGACY_ARTIFACTS) {
    const full = path.join(target, artifact.rel);
    if (!fs.existsSync(full)) continue;
    let artifactStat;
    try { artifactStat = fs.lstatSync(full); } catch { continue; }
    if (artifactStat.isSymbolicLink()) {
      plan.keep.push({ file: full, reason: `${artifact.reason}；路径是 symbolic link，拒绝跟随或自动删除` });
      continue;
    }
    if (artifact.kind === 'file') {
      const text = safeReadFile(full, 256 * 1024);
      if (looksLegacyGenerated(text, artifact)) {
        plan.remove.push({ file: full, reason: artifact.reason });
        plan.dirs.push(path.dirname(full));
      } else {
        plan.keep.push({ file: full, reason: artifact.reason });
      }
    } else {
      let entries = [];
      try {
        entries = fs.readdirSync(full).filter((n) => n.endsWith('.md'));
      } catch {
        continue;
      }
      for (const name of entries) {
        const file = path.join(full, name);
        const text = safeReadFile(file, 256 * 1024);
        (looksKitGenerated(text) ? plan.remove : plan.keep).push({ file, reason: artifact.reason });
      }
      plan.dirs.push(full);
    }
  }
  planOrphanAdapterCleanup(target, plannedWrites, enabledTools, plan);
  return plan;
}

function planOrphanAdapterCleanup(target, plannedWrites, enabledTools, plan) {
  const expected = new Set(plannedWrites.map((item) => path.resolve(item.file)));
  const rootsByTool = {
    codex: ['.agents/skills'],
    claude: ['.claude/commands'],
    cursor: ['.cursor/commands'],
    copilot: ['.github/prompts'],
    codebuddy: ['.codebuddy/commands'],
    kiro: ['.kiro/steering', '.kiro/skills'],
    trae: ['.trae/commands', '.trae/skills', '.trae-cn/commands', '.trae-cn/skills']
  };
  const scanRoots = [...new Set(enabledTools.flatMap((tool) => rootsByTool[tool] || []))];
  const alreadyPlanned = new Set([...plan.remove, ...plan.keep].map((item) => path.resolve(item.file)));
  for (const relativeRoot of scanRoots) {
    const absoluteRoot = path.join(target, relativeRoot);
    if (!fs.existsSync(absoluteRoot)) continue;
    for (const file of listExistingFiles(absoluteRoot)) {
      const resolved = path.resolve(file);
      if (expected.has(resolved) || alreadyPlanned.has(resolved)) continue;
      const text = safeReadFile(resolved, 256 * 1024);
      const reason = 'manifest 已删除或重命名该 adapter 入口';
      if (looksManagedAdapter(text) || looksKitGeneratedMetadata(text, resolved)) {
        plan.remove.push({ file: resolved, reason });
        alreadyPlanned.add(resolved);
        let directory = path.dirname(resolved);
        while (directory.startsWith(path.resolve(absoluteRoot)) && directory !== path.dirname(path.resolve(absoluteRoot))) {
          plan.dirs.push(directory);
          if (directory === path.resolve(absoluteRoot)) break;
          directory = path.dirname(directory);
        }
      } else if (isLikelyAdapterEntry(resolved, absoluteRoot)) {
        plan.keep.push({ file: resolved, reason });
        alreadyPlanned.add(resolved);
      }
    }
  }
}

function looksKitGeneratedMetadata(text, file) {
  const normalized = file.split(path.sep).join('/');
  return normalized.includes('/.agents/skills/workflow-') && normalized.endsWith('/agents/openai.yaml') &&
    text.includes('display_name:') && text.includes('default_prompt:') && text.includes('allow_implicit_invocation: false');
}

function listExistingFiles(root) {
  const files = [];
  function visit(directory) {
    try {
      const rootStat = fs.lstatSync(directory);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return;
    } catch { return; }
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  visit(root);
  return files;
}

function isLikelyAdapterEntry(file, adapterRoot) {
  const relative = path.relative(adapterRoot, file).split(path.sep).join('/');
  return /(?:^|\/)(?:workflow-[^/]+\/)?(?:SKILL\.md|openai\.yaml|[^/]+\.md|[^/]+\.prompt\.md)$/.test(relative);
}

function executeLegacyCleanup(plan) {
  for (const item of plan.remove) {
    fs.unlinkSync(item.file);
    console.log(`removed-legacy ${item.file}（${item.reason}）`);
  }
  for (const item of plan.keep) {
    console.log(`kept-unrecognized ${item.file}（内容不匹配 kit 指纹，疑似用户自定义，请手动确认后删除）`);
  }
  // 清空后的遗留目录连带移除（含空的父目录，如 .codex/）
  for (const dir of plan.dirs) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        const parent = path.dirname(dir);
        if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
        console.log(`removed-legacy-dir ${dir}`);
      }
    } catch {
      /* 忽略目录清理失败 */
    }
  }
}

function classifySourcePaths(target, values) {
  const shared = [];
  const local = [];
  for (const value of values) {
    // URL、home 缩写与工作区外路径都属本地私有信息。
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value === '~' || value.startsWith('~/')) {
      local.push(value);
      continue;
    }
    const resolved = path.resolve(target, value);
    const rel = path.relative(target, resolved);
    const outside = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
    if (outside) {
      local.push(value);
      continue;
    }
    shared.push((rel || '.').split(path.sep).join('/'));
  }
  return { shared: [...new Set(shared)], local: [...new Set(local)] };
}

function makeLocalTeamProfileYaml(profile) {
  const lines = [
    'schema_version: "1.0"',
    'local_only: true',
    '# This file is ignored by workflow/local/.gitignore. Never commit it.',
    'absolute_paths:'
  ];
  const sourceEntries = Object.entries((profile && profile.localSourcePaths) || {});
  if (!sourceEntries.length) {
    lines.push('  {}');
  } else {
    lines.push('  source_materials:');
    for (const [key, values] of sourceEntries) {
      lines.push(`    ${key}:`);
      for (const value of values) lines.push(`      - ${yamlString(value)}`);
    }
  }
  lines.push('private_endpoints: {}');
  lines.push('local_accounts: {}');
  lines.push('credential_env_names: []');
  lines.push('trusted_policy_path: "${OPEN_WORKFLOW_TRUST_POLICY}"');
  lines.push('');
  return lines.join('\n');
}

function makePrivateRuleProvenanceYaml() {
  const lines = [
    'schema_version: "1.0"',
    'local_only: true',
    '# Ignored by workflow/local/.gitignore. Replace every placeholder before private validation.',
    'entries:'
  ];
  for (let i = 1; i <= 37; i++) {
    const suffix = String(i).padStart(3, '0');
    lines.push(`  - ref: "OWK-PRIVATE-RULE-${suffix}"`);
    lines.push('    source_locator: "<TODO: local-only source and section>"');
    lines.push('    source_fingerprint: "<TODO: sha256:64-hex>"');
  }
  lines.push('');
  return lines.join('\n');
}

function makeTeamProfileYaml(profile) {
  const lines = [];
  lines.push('schema_version: "1.3"');
  lines.push(`generated_at: "${new Date().toISOString()}"`);
  lines.push(`generated_by: "${GENERATED_BY}"`);
  lines.push('');
  lines.push('team:');
  lines.push('  name: "<TODO: 团队名称>"');
  lines.push('  business_definition: "<TODO: 简短业务描述>"');
  lines.push('  target_users: []');
  lines.push('  north_star:');
  lines.push('    metric: "<TODO: 北极星指标>"');
  lines.push('    definition: "<TODO: 指标口径>"');
  lines.push('    owner: "<TODO: 指标 owner>"');
  lines.push('    guardrails: []');
  lines.push('  organization:');
  lines.push('    default_dri: "<TODO>"');
  lines.push('    decision_owner: "<TODO>"');
  lines.push('    reviewers: []');
  lines.push('    dependency_response_sla: "<TODO>"');
  lines.push('    escalation_path: []');
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
  lines.push('  type: "<TODO: trunk-based | gitflow | environment-branches | custom>"');
  lines.push('  production_branch: "<TODO>"');
  lines.push('  integration_branch: "<TODO>"');
  lines.push('  development_branch_base: "<TODO>"');
  lines.push('  testing_branch: null');
  lines.push('  test_branch_policy: "<TODO>"');
  lines.push('  release_flow: "<TODO>"');
  lines.push('  feature_branch_rule: "<TODO>"');
  lines.push('  protected_branches: []');
  lines.push('  worktree_dir: "_worktrees"');
  lines.push('');
  lines.push('# 仓库内只记请求策略，不是信任根。生效值取 core/外部受信策略/仓库请求/当次授权中最严格值。');
  lines.push('execution_policy:');
  lines.push('  requested_default_mode: "ask"');
  lines.push('  requested_categories:');
  lines.push('    remote_git: { mode: "ask" }');
  lines.push('    branch_creation: { mode: "ask" }');
  lines.push('    push_tag_merge: { mode: "ask" }');
  lines.push('    protected_branch_write: { mode: "ask" }');
  lines.push('    db_ddl: { mode: "ask" }');
  lines.push('    db_dml: { mode: "ask" }');
  lines.push('    production_config_write: { mode: "ask" }');
  lines.push('    build_deploy_trigger: { mode: "ask" }');
  lines.push('    package_publish: { mode: "ask" }');
  lines.push('    config_write: { mode: "ask" }');
  lines.push('  external_trust_policy:');
  lines.push('    required_for_auto: true');
  lines.push('    source_env: "OPEN_WORKFLOW_TRUST_POLICY"');
  lines.push('  non_repo_auto_categories:');
  lines.push('    - "protected_branch_write"');
  lines.push('    - "db_ddl"');
  lines.push('    - "db_dml"');
  lines.push('    - "production_config_write"');
  lines.push('    - "build_deploy_trigger"');
  lines.push('    - "package_publish"');
  lines.push('  risk_statement_required: true');
  lines.push('  audit_log: "workflow/local/execution-audit.jsonl"');
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
  lines.push('  reproducibility:');
  lines.push('    fixture_version_required: true');
  lines.push('    random_seed_required: true');
  lines.push('    environment_fingerprint_required: true');
  lines.push('    flaky_policy: "quarantine-does-not-pass"');
  lines.push('');
  lines.push('quality_budgets:');
  lines.push('  performance:');
  lines.push('    latency_percentiles: { p50_ms: null, p95_ms: null, p99_ms: null }');
  lines.push('    throughput: null');
  lines.push('    resource_limits: { memory_mb: null, cpu_percent: null, battery: null, network_bytes: null }');
  lines.push('  reliability:');
  lines.push('    availability_target: null');
  lines.push('    error_budget: null');
  lines.push('    rto: null');
  lines.push('    rpo: null');
  lines.push('  cost:');
  lines.push('    per_operation: null');
  lines.push('    monthly: null');
  lines.push('    currency: null');
  lines.push('  accessibility:');
  lines.push('    standard: "<TODO: WCAG 2.2 AA | platform standard | N/A>"');
  lines.push('  ai_quality:');
  lines.push('    enabled: false');
  lines.push('    golden_dataset: null');
  lines.push('    model_and_prompt_version_required: true');
  lines.push('    max_hallucination_rate: null');
  lines.push('    safety_refusal_target: null');
  lines.push('    max_cost_per_evaluation: null');
  lines.push('');
  lines.push('completion_contract:');
  lines.push('  path_pattern: "features/{feature}/completion/contract.yaml"');
  lines.push('  evidence_ledger_pattern: "features/{feature}/completion/evidence/ledger.jsonl"');
  lines.push('  run_state_pattern: "features/{feature}/completion/run-state.yaml"');
  lines.push('  acceptance_id_pattern: "AC-[0-9]{3,}"');
  lines.push('  evidence_statuses: ["PASS", "FAIL", "BLOCKED", "NOT_RUN", "STALE", "WAIVED"]');
  lines.push('  require_definition_lint: true');
  lines.push('  require_source_fingerprint: true');
  lines.push('  require_environment_fingerprint: true');
  lines.push('  invalidate_evidence_on_contract_change: true');
  lines.push('  invalidate_evidence_on_source_change: true');
  lines.push('  anti_cheating:');
  lines.push('    forbid_threshold_weakening: true');
  lines.push('    forbid_test_deletion_to_pass: true');
  lines.push('    forbid_not_run_as_pass: true');
  lines.push('    forbid_silent_scope_expansion: true');
  lines.push('    require_waiver_expiry: true');
  lines.push('');
  lines.push('risk_policy:');
  lines.push('  default_profile: "standard"');
  lines.push('  policy_packs: []');
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
          // 可提交的 team-profile 只记 provider 类型和仓库相对证据，
          // 不记自建 host；真实端点属于 workflow/local/team-profile.local.yaml。
          addHit(
            'git_platform',
            tool,
            `${base === '.' ? '.git/config' : base + '/.git/config'} -> ${tool} (host redacted)`
          );
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

- \`team-profile.yaml\`: 当前团队可提交、可脱敏审查的共享契约（含请求策略、工具链槽位与测试配置）。
- \`local/team-profile.local.yaml\`: 绝对路径、私有端点与本地账号的私有配置（Git 忽略）。
- \`local/rule-provenance.private.yaml\`: 37 条规则的私有原始来源与 SHA-256 指纹骨架（Git 忽略）。
- \`core/\`: 工具无关的工作流规则、命令、模板、能力和检查清单。
- \`core/command-manifest.yaml\`: 全部工作流命令及 adapter 元数据的机器可读单一事实源；实际数量以 manifest 的 \`command_count\` 为准。
- \`core/execution-policy.md\`: 高风险写操作的分级执行策略。
- \`core/checklists/\`: 高频事故模式的逐项检查清单。
- \`core/rules/rule-catalog.yaml\`: 37 条规则到 79 个清单 item 的公开审计级映射。
- \`bin/\`: 目标工作区可直接运行的命令清单、规则、adapter、Markdown 链接检查器与 API runner。
- \`adapters/\`: 支持工具的 adapter 说明。
- \`TOOLCHAIN_MCP_PLAN.md\`: 工具链 MCP 连接计划（\`/connect-toolchain\` 维护）。
- \`INITIALIZATION_QUESTIONS.md\`: 缺少必要本地资料时生成的问题清单。

默认使用简体中文展示工作流沟通、阶段产物、状态摘要、审查结论、测试记录、验收材料、培训文档和上线通知；专有名词、产品名、代码标识符、命令、文件路径、分支名、API、SDK、框架、协议、标准、错误信息和官方英文术语保留原文。

工作流阶段产物放在工作区级 \`features/<feature>/\` 下，不写入目标代码仓库。目标代码仓库只保留源码、代码相关配置、运行或构建必需资产，以及最小必要的代码侧 \`README\` 内容。

\`/02B-UI设计\` 是前端实现的设计闸门；\`/04A-前端代码实现\` 必须读取并遵循 \`features/<feature>/02B-UI设计.md\`，缺失时先补齐或记录用户明确授权的范围有限豁免。

不要把凭证、绝对路径、真实客户秘密或私有 URL 写入通用 core 或可提交的 \`team-profile.yaml\`。这些信息只能保留在 \`workflow/local/\` 或仓库外本地资料中。
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

function makeCommandTable() {
  const header = '| 命令 | 阶段 | 作用 |\n| --- | --- | --- |';
  const rows = COMMANDS.map(
    (command) => `| \`/${command.id}\` | ${command.title} | ${command.description} |`
  );
  return [header, ...rows].join('\n');
}

function makeToolUsage(profile) {
  const tools = profile.enabledTools;
  const blocks = [];

  if (tools.includes('claude')) {
    blocks.push(`### Claude Code

- 阶段命令来自 \`.claude/commands/\`，可直接输入，例如 \`/04-代码实现 <feature>\`。
- 同时生成官方推荐格式的 \`.claude/skills/agent-workflow/SKILL.md\`，Claude 可按语义自主调用。
- 多文件或复杂改动先进入 plan mode，再执行。
- 每个命令文件都是薄 adapter，最终都指向 \`workflow/core/commands/\`。`);
  }

  if (tools.includes('codex')) {
    blocks.push(`### Codex

- Codex 会自动读取本 \`AGENTS.md\`（官方项目级指令机制）。
- 本 kit 同时生成总入口和 ${COMMANDS.length} 个分阶段 \`.agents/skills/workflow-*/\`。这些 Skill 会出现在支持的 \`/\` 列表中，也可用 \`/skills\` 或 \`$\` 按编号、英文 slug 或中文展示名模糊选择。
- Codex Desktop 通过 Skills 入口选择分阶段 Skill；所有阶段 Skill 默认禁止隐式调用，必须由用户显式选择。
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
- 每个 manifest 命令都会生成 \`.github/prompts/<skill-slug>.prompt.md\`；在支持 Prompt Files 的 VS Code、Visual Studio 或 JetBrains 中，从 Prompt 选择器或 \`/\` 后按编号/slug 模糊选择。
- Prompt Files 的可用方式随 IDE 和版本变化；找不到时直接引用 \`workflow/core/commands/<stage>.md\`，不要把生成文件存在当成真机验收。`);
  }

  if (tools.includes('codebuddy')) {
    blocks.push(`### CodeBuddy

- 生成项目规则 \`.codebuddy/rules/agent-workflow.md\` 和 \`.codebuddy/commands/*.md\`。
- 在输入框输入 \`/\`，按编号或中文名称模糊选择阶段；命令参数通过 \`$ARGUMENTS\` 传入薄 adapter。
- 命令不声明宽泛 \`allowed-tools\`，不会绕过 core 的 Git、实现和高风险操作闸门。`);
  }

  if (tools.includes('kiro')) {
    blocks.push(`### Kiro

- Kiro IDE 为每个 manifest 命令生成 \`.kiro/steering/<skill-slug>.md\`，并设置 \`inclusion: manual\`，因此会出现在 \`/\` 模糊菜单中。
- Kiro CLI 同时从 \`.kiro/skills/<skill-slug>/SKILL.md\` 暴露 slash skill；根 \`AGENTS.md\` 继续作为自动加载的共享规则。
- IDE 与 CLI 是两条不同发现路径，发布前必须分别真机验收。`);
  }

  if (tools.includes('trae')) {
    blocks.push(`### Trae

- 每个 manifest 命令都会生成 \`.trae/commands/<id>.md\` 与 \`.trae/skills/<skill-slug>/SKILL.md\`，可从 Settings > Skills & Commands 或输入 \`/\` 后按编号、名称、slug 模糊选择。
- 同步生成 \`.trae-cn/\` 兼容镜像；它不属于主官方路径，不能单独作为 native 验收证据。
- 文件生成只证明结构一致性；具体版本的命令面板、参数传递与硬闸门仍需真机验收。`);
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
3. 用 \`/new-feature <name>\` 初始化需求，它会创建 \`features/<name>/\`、Completion Contract 骨架、Evidence Ledger 与状态文件。
4. 先完成 \`/01-需求讨论\` -> \`/02-产品文档\` -> \`/02B-UI设计\`；需要可点击原型时在 02B 后显式执行 \`/02C-HTML原型\`。随后运行 \`/03-06-研发准备\`，或手动依次完成 \`/03-技术架构\` -> \`/06-测试用例\`，此时 Oracle 全部保持 \`NOT_RUN\`。
5. 用 \`/define-done <name>\` 最终复核并冻结目标、边界、质量预算、验收 Oracle、environment 与 findings。合同未冻结或 Definition Lint 未通过，不得进入自主实现。
6. 可选择 \`/deliver-until-done <name>\` 在授权边界内执行实现、独立审查、验证、修复与全量复验，也可逐阶段运行 \`/04-代码实现\` -> \`/05-代码审查\` -> \`/07-测试执行\`。两条路径都消费同一份 06 Oracle 并产出同一 Evidence Ledger，且都不包含 push、部署或生产写入授权。
7. 自动 blocking AC 达到 \`READY_FOR_HUMAN_ACCEPTANCE\` 后，再推进 \`/08-验收表格\` -> \`/09-验收\` -> \`/10-培训文档\` -> \`/11-上线邮件通知\` -> \`/12-复盘总结\`。
8. 每个阶段都必须读取 \`features/<name>/\` 下的前序文档，并把本阶段产物写回同目录；随时可执行 \`/workflow-status\` 查看合同、证据、阻塞和下一步。

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
- 本地私有配置：\`workflow/local/team-profile.local.yaml\`（被 Git 忽略）
- 可复用检查能力：\`workflow/core/capabilities/\`
- 规则审计目录：\`workflow/core/rules/rule-catalog.yaml\`
- 需求产物：工作区级 \`features/<feature>/\`
- 工具 adapter：仅作为生成的薄入口

## 硬闸门

- 产品和工作流文档必须与代码仓库分开：除非用户明确要求公开文档并确认它应随代码发布，否则不要把 \`features/<feature>/\`、PRD、竞品调研、法务草案、隐私政策、合规说明、验收文档或内部决策包提交到应用或源码仓库。
- 功能分支闸门和实现阶段闸门通过前，禁止修改业务代码。
- \`/02B-UI设计\` 是前端实现的设计闸门；\`/04A-前端代码实现\` 必须读取并遵循工作区级 \`features/<feature>/02B-UI设计.md\`，缺失时先补齐 02B，除非用户明确给出范围有限的设计豁免。可点击原型只能通过 \`/02C-HTML原型\` 显式产出，且必须受 \`workflow/design/tokens.css\` 与组件清单约束。
- \`/03-06-研发准备\`、\`/define-done\` 以及 01/02/02B/03 阶段只授权分析和工作流文档。
- \`/deliver-until-done\` 只有在冻结合同、Definition Lint、功能分支、worktree、实现阶段和执行策略闸门全部通过后才授权范围内代码修改；命令调用本身不授权 push、merge、部署、生产配置或数据库写入。
- Agent 可以建议合同变更，但不得自行降低 blocking 阈值、删除 AC/测试、扩大 scope/waiver 或把 NOT_RUN/STALE/WAIVED 伪装为 PASS。
- 仓库内 \`team-profile.yaml\` 不是信任根。生效执行模式取 core 硬上限、仓库外受信策略、team-profile 请求和当次授权中最严格值。
- 生产部署/配置、DDL/DML、受保护分支写入和包发布永远不得仅凭仓库配置 auto；无外部受信策略时最高为 ask。
- 代执行明细必须脱敏写入被忽略的 \`workflow/local/execution-audit.jsonl\`；不创建、不追加可提交的 \`workflow/EXECUTION_AUDIT.md\`。
- 自动化测试（\`automated-test-runner\`）目标环境必须在 \`team-profile#testing\` 白名单内，生产环境默认阻断；测试凭证只放本地未跟踪文件，不进文档与仓库。
- 同仓多需求进入实现阶段后，必须使用独立 worktree。

## 工具能力策略

workflow core 是共享的。工具 adapter 可按当前工具能力增强或降级：

- L0：文档规则
- L1：prompt 和命令模板
- L2：工具原生规则或 slash commands
- L3：hooks 或前置检查
- L4：subagents 或多 agent 路由

对外口径为 Codex、Claude Code、Cursor、GitHub Copilot、CodeBuddy、Kiro、Trae 7 个官方项目级 adapter。所有 adapter 都必须保持 \`native_not_yet_manually_certified\`，直到当前发布版本完成真实工具人工验收。命令发现方式分为 \`slash_fuzzy\`、\`slash_skill_fuzzy\` 和 \`prompt_fuzzy\`；详细路径和差异见 \`workflow/adapters/support-matrix.yaml\`。不要承诺所有工具体验完全一致。

## 工具使用方式

${makeToolUsage(profile)}

## 已启用工具

${profile.enabledTools.map((tool) => `- ${tool}`).join('\n')}

## 参考文件

- \`workflow/README.md\`：工作流总览。
- \`workflow/core/commands/\`：各阶段契约。
- \`workflow/core/capabilities/README.md\`：可复用检查能力及工具适配方式。
- \`workflow/core/checklists/README.md\`：高频事故模式的逐项检查清单。
- \`workflow/core/rules/rule-catalog.yaml\`：37 条规则到 79 个清单 item、能力和阶段的审计级映射。
- \`workflow/adapters/support-matrix.yaml\`：原生/兼容支持级别与验证证据。
- \`workflow/core/execution-policy.md\`：高风险写操作的分级执行策略与审计要求。
- \`workflow/TOOLCHAIN_MCP_PLAN.md\`：工具链 MCP 连接计划（由 \`/connect-toolchain\` 维护）。
- \`workflow/core/testing-automation-guide.md\`：接口/功能测试双轨自动化接入指引。
- \`workflow/team-profile.yaml\`：当前团队配置和缺失资料记录。

## 开始

先读取 \`workflow/team-profile.yaml\`，再按用户请求的阶段读取 \`workflow/core/commands/\`。
`;
}

function makeSlashCommand(toolName, command, argumentSource) {
  return `---
description: ${yamlQuote(`${command.id} ${command.title}：${command.description}`)}
argument-hint: ${yamlQuote(command.argument_hint)}
---

<!-- ${MANAGED_ADAPTER_MARKER} -->

# ${toolName} adapter for /${command.id}

这是由命令清单生成的薄 adapter。用户参数来自：${argumentSource}。

执行时必须按顺序读取：

1. \`AGENTS.md\`
2. \`workflow/team-profile.yaml\`
3. \`workflow/core/command-manifest.yaml\`
4. \`workflow/core/commands/${command.id}.md\`

不得加入与 workflow/core 冲突的工具特定行为，不得把命令调用本身当成实现、高风险写操作或发布授权。
`;
}

function makeCopilotPrompt(command) {
  return `---
description: ${yamlQuote(`${command.id} ${command.title}：${command.description}`)}
---

<!-- ${MANAGED_ADAPTER_MARKER} -->

# GitHub Copilot prompt for /${command.id}

这是由 \`workflow/core/command-manifest.yaml\` 生成的项目 Prompt File。将用户在 prompt 后附加的文本视为功能名称或阶段参数。

- 阶段作用：${command.description}
- 参数提示：\`${command.argument_hint}\`

执行前必须读取并遵循：

1. \`AGENTS.md\`
2. \`workflow/team-profile.yaml\`
3. \`workflow/core/command-manifest.yaml\`
4. \`workflow/core/commands/${command.id}.md\`

Prompt File 只是阶段发现入口。它不得覆盖 workflow/core 的实现闸门、Git 闸门、高风险执行策略或验收证据要求。
`;
}

function makeKiroRootSteering() {
  return `---
inclusion: always
---

<!-- ${MANAGED_ADAPTER_MARKER} -->

# Kiro 工作流说明

先读取 \`AGENTS.md\`，再按用户选择的阶段读取 \`workflow/team-profile.yaml\` 和 \`workflow/core/commands/\`。

本文件是始终加载的薄 adapter，不得覆盖 workflow/core 的硬闸门。分阶段 slash 入口由同目录中 \`inclusion: manual\` 的 steering 文件提供；Kiro CLI 的等价入口位于 \`.kiro/skills/\`。
`;
}

function makeKiroManualSteering(command) {
  return `---
inclusion: manual
---

<!-- ${MANAGED_ADAPTER_MARKER} -->

# /${command.skill_slug} — ${command.id} ${command.title}

这是由命令清单生成的 Kiro IDE 手动 steering。选择本 slash command 后，将用户附加的自然语言视为功能名称或阶段参数。

- 阶段作用：${command.description}
- 参数提示：\`${command.argument_hint}\`

执行时必须按顺序读取：

1. \`AGENTS.md\`
2. \`workflow/team-profile.yaml\`
3. \`workflow/core/command-manifest.yaml\`
4. \`workflow/core/commands/${command.id}.md\`

\`inclusion: manual\` 只负责把本入口放入 Kiro 的 \`/\` 菜单；它不授予修改代码、高风险写操作或发布权限。
`;
}

function makeCodeBuddyCommand(command) {
  return `---
description: ${yamlQuote(command.description)}
argument-hint: ${yamlQuote(command.argument_hint)}
---

<!-- ${MANAGED_ADAPTER_MARKER} -->

# CodeBuddy adapter for /${command.id}

这是由命令清单生成的薄 adapter。用户参数：\`$ARGUMENTS\`。

执行时必须按顺序读取：

1. \`AGENTS.md\`
2. \`workflow/team-profile.yaml\`
3. \`workflow/core/command-manifest.yaml\`
4. \`workflow/core/commands/${command.id}.md\`

不得声明宽泛的 \`allowed-tools\`，不得覆盖 workflow/core 的实现闸门、Git 闸门或高风险执行策略。
`;
}

function makeStageSkill(command) {
  return `---
name: ${command.skill_slug}
description: ${yamlQuote(`仅在用户显式选择 ${command.id}（${command.title}）阶段时使用。${command.description}`)}
---

<!-- ${MANAGED_ADAPTER_MARKER} -->

# /${command.id} ${command.title}

本 Skill 是由 \`workflow/core/command-manifest.yaml\` 生成的分阶段发现入口，不复制阶段规则。

- 阶段作用：${command.description}
- 参数提示：\`${command.argument_hint}\`

执行时必须按顺序读取：

1. 根目录 \`AGENTS.md\`
2. \`workflow/team-profile.yaml\`
3. \`workflow/core/commands/${command.id}.md\`
4. \`features/<feature>/\` 下的前序阶段文档

用户显式选择本 Skill 只表示选择了 \`/${command.id}\`；如果功能名称、分支闸门、阶段前置条件或高风险授权不足，仍必须按 core 规则停止或降级，不能把 Skill 调用本身当成授权。
`;
}

function makeStageSkillMetadata(command) {
  return `# ${MANAGED_ADAPTER_MARKER}
interface:
  display_name: ${yamlQuote(`${command.id} ${command.title}`)}
  short_description: ${yamlQuote(shortDescription(command.description))}
  default_prompt: ${yamlQuote(`执行 /${command.id} 阶段，并严格读取 AGENTS.md、team profile 与对应 core command；若参数不足先说明缺失项。`)}
policy:
  allow_implicit_invocation: false
`;
}

function shortDescription(value) {
  return value.length <= 60 ? value : `${value.slice(0, 59)}…`;
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function makeClaudeWorkflowSkill() {
  return `---
name: agent-workflow
description: 按 open-workflow-kit 的阶段契约和 Completion Contract 推进需求交付。当用户提到定义完成、需求讨论、产品文档、UI 设计、技术架构、自主交付、代码实现、审查、测试、验收、上线通知或复盘等阶段性工作时使用本 skill。
---

# agent-workflow

本 Skill 只负责把请求路由到正确阶段契约。自动加载或语义匹配本 Skill 不等于用户已经进入任何阶段，更不等于授权 \`/04\` 修改代码。

执行任何工作流阶段时，按顺序读取：

1. 根目录 \`AGENTS.md\`（快速开始、命令表、硬闸门）
2. \`workflow/team-profile.yaml\`（团队契约：仓库、分支模型、执行策略、测试配置）
3. \`workflow/core/commands/<用户请求的阶段>.md\`（阶段契约）

各阶段也可通过 \`.claude/commands/\` 的斜杠命令直接触发（如 \`/01-需求讨论\`、\`/04-代码实现\`）。

规则：

- 阶段产物写入工作区级 \`features/<feature>/\`，不写入代码仓库。
- 只有用户显式调用 \`/deliver-until-done\`、\`/04-代码实现\`、\`/04A-前端代码实现\`、\`/04B-后端代码实现\`，或 core 允许的等价实现状态证据存在时，才可能通过阶段闸门。
- \`/deliver-until-done\` 还要求冻结且 lint 通过的合同、可执行 Oracle、明确授权范围与自主预算；该命令不授权外部高风险操作。
- 高风险写操作按 \`workflow/core/execution-policy.md\` 分级处理（默认每次询问 + 审计留痕）。
- 审查/测试记录引用检查清单条目时使用稳定 ID（如 BH-05、TBS-12）。
`;
}

function makeAgentWorkflowSkill() {
  return `---
name: agent-workflow
description: 按 open-workflow-kit 的阶段契约和 Completion Contract 推进需求交付。适用于定义完成、需求讨论、产品文档、UI 设计、技术架构、自主交付、代码实现、审查、测试、验收、上线与复盘等阶段请求。
---

# agent-workflow

本 Skill 只负责工作流路由。隐式匹配或自动加载本 Skill 不等于用户显式选择了阶段，也不授权 \`/04\` 修改代码。

执行任何工作流阶段时，按顺序读取：

1. 根目录 \`AGENTS.md\`（快速开始、命令表、硬闸门）
2. \`workflow/team-profile.yaml\`（团队契约：仓库、分支模型、执行策略、测试配置）
3. \`workflow/core/commands/<用户请求的阶段>.md\`（阶段契约）

规则：

- 阶段产物写入工作区级 \`features/<feature>/\`，不写入代码仓库。
- 代码实现仍要求用户显式选择对应分阶段 Skill 或满足 core 定义的等价 04 状态证据，并通过功能分支与并行开发闸门。
- 自主交付还要求冻结且 lint 通过的合同、可执行 Oracle、明确授权范围与自主预算；Agent 无权自行修改完成标准来获得通过。
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

new-feature -> 01-需求讨论 -> 02-产品文档 -> 02B-UI设计 -> (可选 02C-HTML原型) ->
(03-06-研发准备 或 03-技术架构 -> 06-测试用例[NOT_RUN]) -> define-done ->
(deliver-until-done 或 04-代码实现 -> 05-代码审查 -> 07-测试执行) -> 08-验收表格 -> 09-验收 ->
10-培训文档 -> 11-上线邮件通知 -> 12-复盘总结

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
- 完成合同未冻结、Definition Lint 未通过或缺少可执行 Oracle 时，禁止进入 \`deliver-until-done\` 自主循环。
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
