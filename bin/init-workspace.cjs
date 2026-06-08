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
const GENERATED_BY = 'agent-workflow-init 0.2.0';

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
    label: 'Business overview / 业务介绍',
    question: 'Path to business or product overview / 请提供业务介绍或产品概览文件路径',
    match: /(业务介绍|业务概览|产品介绍|company|business|overview|readme)/i
  },
  {
    key: 'project_docs',
    label: 'Project documents / 项目资料',
    question: 'Path to project, PRD, requirements, or architecture documents / 请提供项目资料、PRD、需求或架构文档目录',
    match: /(项目资料|需求|prd|product|docs|architecture|spec)/i
  },
  {
    key: 'ui_specs',
    label: 'UI design / UI 设计文件',
    question: 'Path to UI design, prototype, or design system files / 请提供 UI 规范、设计稿、原型或设计系统文件路径',
    match: /(ui|design|figma|prototype|mockup|原型|设计|视觉|规范)/i
  },
  {
    key: 'frontend_rules',
    label: 'Frontend rules / 前端开发规范',
    question: 'Path to frontend development rules / 请提供前端开发规范目录或文件路径',
    match: /(frontend|front-end|前端|web.*规范|ui.*规范)/i
  },
  {
    key: 'backend_rules',
    label: 'Backend rules / 后端开发规范',
    question: 'Path to backend development rules / 请提供后端开发规范目录或文件路径',
    match: /(backend|back-end|server|后端|服务端)/i
  },
  {
    key: 'testing_rules',
    label: 'Testing rules / 测试规范',
    question: 'Path to testing rules, test cases, or QA materials / 请提供测试规范、测试用例或 QA 资料路径',
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
    throw new Error(`Target directory does not exist: ${target}`);
  }

  const detectedTools = detectTools(target);
  let enabledTools = options.tools ? normalizeTools(options.tools) : detectedTools;
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.yes && !options.dryRun;

  if (!enabledTools.length && interactive) {
    const answer = await promptLine(
      `Select AI tools (${SUPPORTED_TOOLS.join(', ')}). Leave empty to generate all thin adapters: `
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

  console.log(`Initialized agent workflow in ${target}`);
  console.log(`Enabled tools: ${enabledTools.join(', ')}`);
  if (profile.missing.length) {
    console.log('Some source materials were not found. See workflow/INITIALIZATION_QUESTIONS.md.');
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
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node bin/init-workspace.cjs [options]

Options:
  --target <dir>       Target workspace root. Defaults to current directory.
  --tools <list>       Comma-separated tools: ${SUPPORTED_TOOLS.join(', ')}.
  --yes, -y            Non-interactive mode. Missing materials are written to a question file.
  --force              Overwrite existing generated entry files.
  --upgrade            Refresh generated files while preserving team-profile.yaml when present.
  --dry-run            Show planned writes without changing files.
  --help, -h           Show this help.

This command never runs remote Git operations, never creates branches, never pushes code,
and never triggers builds, deployments, or database writes.`);
}

function normalizeTools(value) {
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const normalized = [];
  for (const item of raw) {
    const input = item.trim().toLowerCase();
    const tool = TOOL_ALIASES[input] || input;
    if (!tool) continue;
    if (!SUPPORTED_TOOLS.includes(tool)) {
      throw new Error(`Unsupported tool: ${tool}. Supported: ${SUPPORTED_TOOLS.join(', ')}`);
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
    add('CLAUDE.md', 'Read AGENTS.md first, then follow workflow/core and workflow/team-profile.yaml. Tool-specific commands under .claude/commands are thin adapters only.\n');
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
  console.log(`Dry run target: ${target}`);
  console.log(`Detected tools: ${profile.detectedTools.join(', ') || '(none)'}`);
  console.log(`Enabled tools: ${profile.enabledTools.join(', ')}`);
  console.log(`Detected repos: ${profile.repos.length}`);
  console.log(`Missing source groups: ${profile.missing.map((item) => item.key).join(', ') || '(none)'}`);
  console.log('Planned writes:');
  for (const write of writes) console.log(`- ${path.relative(target, write.file)}`);
}

function makeTeamProfileYaml(profile) {
  const lines = [];
  lines.push('schema_version: "1.0"');
  lines.push(`generated_at: "${new Date().toISOString()}"`);
  lines.push(`generated_by: "${GENERATED_BY}"`);
  lines.push('');
  lines.push('team:');
  lines.push('  name: "<TODO: team name>"');
  lines.push('  business_definition: "<TODO: short business description>"');
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
      lines.push('    family: "<TODO: classify project family>"');
      lines.push('    role: "<TODO: service or product role>"');
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

This directory is generated by ${GENERATED_BY}.

- \`team-profile.yaml\`: local team configuration.
- \`core/\`: tool-agnostic workflow rules, commands, templates, and capabilities.
- \`adapters/\`: adapter notes for supported AI tools.
- \`INITIALIZATION_QUESTIONS.md\`: created when required local source materials are missing.

Do not put credentials, real customer secrets, or private URLs into generic core files. Keep local business knowledge in team-profile or local source documents.
`;
}

function makeInstallReport(profile, options) {
  return `# Install Report

- Generated by: ${GENERATED_BY}
- Generated at: ${new Date().toISOString()}
- Enabled tools: ${profile.enabledTools.join(', ')}
- Detected tools: ${profile.detectedTools.join(', ') || '(none)'}
- Detected repositories: ${profile.repos.length}
- Force overwrite: ${options.force ? 'yes' : 'no'}
- Upgrade mode: ${options.upgrade ? 'yes' : 'no'}

## Missing Source Groups

${profile.missing.length ? profile.missing.map((item) => `- ${item.label} (${item.key})`).join('\n') : '- None'}

## Safety Boundary

The initializer did not run remote Git commands, create branches, push code, trigger build or deployment jobs, or execute database writes.
`;
}

function makeQuestions(profile) {
  return `# Initialization Questions

The initializer could not find all required local materials. Fill these paths, then rerun the initializer or update \`workflow/team-profile.yaml\` manually.

${profile.missing.map((item) => `## ${item.label}\n\n${item.question}\n\n- path: <TODO>\n`).join('\n')}
`;
}

function makeCoreCommand(id, title, description) {
  const codeStage = id === '04-代码实现' || id === '04A-前端代码实现' || id === '04B-后端代码实现';
  const reviewStage = id === '05-代码审查';
  const prepStage = id === '03-06-研发准备';
  return `# /${id}

## Goal

${title}: ${description}

## Required Inputs

- \`AGENTS.md\`
- \`workflow/team-profile.yaml\`
- Previous stage documents under \`features/{feature}/\`
- Local code, local docs, and user-provided source materials listed in team-profile

## Execution Rules

- Read local facts before writing conclusions.
- Distinguish verified facts, design intent, assumptions, and missing evidence.
- Do not claim tests, builds, screenshots, deployments, or reviews passed unless they were actually executed.
- Remote Git refresh, branch creation, push, tag, merge, build/deploy trigger, database write, and production config write are manual-only actions.
${codeStage ? '- Code changes are allowed only after the feature branch gate, implementation stage gate, and same-repo parallel gate all pass.' : '- This stage does not authorize business code changes unless the current command is an implementation command and all gates pass.'}
${prepStage ? '- This orchestration command only prepares documents from 03 to 06; it does not authorize code implementation.' : ''}
${reviewStage ? '- Findings lead the output. Order issues by severity and cite files, diffs, tests, or runtime evidence.' : ''}

## Required Outputs

- Update or create the corresponding file under \`features/{feature}/\`.
- Update \`features/{feature}/00-工作流状态.md\` when stage status changes.
- Record unresolved questions and evidence gaps explicitly.
`;
}

function makeCommandTable() {
  const header = '| Command | Stage | What it does |\n| --- | --- | --- |';
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

- Stage commands are registered from \`.claude/commands/\`. Type the command directly, for example \`/04-代码实现 <feature>\`.
- For multi-file or complex changes, enter plan mode first, then execute.
- Each command file is a thin adapter that points back to \`workflow/core/commands/\`.`);
  }

  if (tools.includes('codex')) {
    blocks.push(`### Codex

- Codex reads this \`AGENTS.md\` automatically.
- Stage prompts live in \`.codex/prompts/\`. Invoke a stage prompt, or tell Codex to follow \`workflow/core/commands/<stage>.md\`.`);
  }

  if (tools.includes('cursor')) {
    blocks.push(`### Cursor

- This kit generates Cursor custom slash commands under \`.cursor/commands/\` (Cursor 1.6+, Sept 2025). Type \`/\` in the Agent input, pick a stage such as \`/04-代码实现\`, then describe the feature.
- The rule in \`.cursor/rules/agent-workflow-core.mdc\` is applied automatically to every request.
- As a fallback, you can @-mention the stage contract directly, for example \`@workflow/core/commands/04-代码实现.md\`.
- The agent then reads the stage contract, \`workflow/team-profile.yaml\`, and the previous \`features/<feature>/\` documents, and writes the stage output.
- Hard gates still apply: implementation requires the feature branch gate and the stage gate.`);
  }

  if (tools.includes('copilot')) {
    blocks.push(`### GitHub Copilot

- \`.github/copilot-instructions.md\` is applied automatically.
- To run a stage, reference \`workflow/core/commands/<stage>.md\` in chat and describe the feature.`);
  }

  for (const [tool, label] of [['codebuddy', 'CodeBuddy'], ['kiro', 'Kiro'], ['trae', 'Trae']]) {
    if (tools.includes(tool)) {
      blocks.push(`### ${label}

- \`.${tool}/instructions.md\` is applied automatically.
- To run a stage, reference \`workflow/core/commands/<stage>.md\` in chat and describe the feature.`);
    }
  }

  if (!blocks.length) {
    blocks.push(`No specific tool adapter was selected. Read \`workflow/core/commands/<stage>.md\` and follow it directly.`);
  }

  return blocks.join('\n\n');
}

function makeAgentsEntry(profile) {
  return `# Agent Workflow

This workspace uses a tool-agnostic agent workflow generated by ${GENERATED_BY}. It runs as a staged delivery flow: clarify the requirement, design, implement behind gates, review, test, accept, and retrospect. The same workflow core is shared across AI tools; each tool gets a thin adapter, so behavior is enhanced or downgraded by tool but the flow is the same.

## Quick Start

1. Read \`workflow/team-profile.yaml\` to load this team's repositories, branch model, and source materials.
2. Start a feature with \`/new-feature <name>\`. It creates \`features/<name>/\` with a status file.
3. Move through the stages in order: \`/01-需求讨论\` -> \`/02-产品文档\` -> \`/03-技术架构\` -> \`/04-代码实现\` -> \`/05-代码审查\` -> \`/06-测试用例\` -> \`/07-测试执行\` -> \`/08-验收表格\` -> \`/09-验收\` -> \`/10-培训文档\` -> \`/11-上线邮件通知\` -> \`/12-复盘总结\`.
4. Each stage reads the previous stage documents under \`features/<name>/\` and writes its own output there.
5. Run \`/workflow-status\` at any time to see every feature's stage, blockers, and next step.

How you trigger a stage depends on your tool. See "Tool-Specific Usage" below.

## Workflow Commands

${makeCommandTable()}

## Task Briefing Template

When you start a stage, state the work as three parts so the agent has enough context:

- **Goal**: what the finished change must achieve.
- **Constraints**: what must not change (public APIs, database schema, auth flow, unrelated modules).
- **Acceptance**: how to prove it is correct (tests, scripts, API calls, browser checks, screenshots).

## Single Source of Truth

- Workflow rules: \`workflow/core/\`
- Team configuration: \`workflow/team-profile.yaml\`
- Reusable checks: \`workflow/core/capabilities/\`
- Feature deliverables: \`features/<feature>/\`
- Tool adapters: generated thin entries only

## Hard Gates

- Do not modify business code before the feature branch gate and implementation stage gate pass.
- \`/03-06-研发准备\` and stages 01/02/03 only authorize analysis and workflow documents.
- Remote Git operations are manual-only: no automatic fetch, pull, clone, remote update, branch creation, push, tag, merge, or remote deletion.
- Build, deployment, database write, production config write, and release actions are manual-only unless the team profile explicitly defines a safe read-only adapter.
- Same-repository parallel implementation requires separate worktrees after entering implementation stage.

## Tool Capability Policy

The workflow core is shared. Tool adapters may enhance or downgrade behavior according to the current tool:

- L0: document rules
- L1: prompts and command templates
- L2: tool-native rules or slash commands
- L3: hooks or pre-flight checks
- L4: subagents or multi-agent routing

Do not promise identical behavior across all tools. Use the current tool's own adapter only.

## Tool-Specific Usage

${makeToolUsage(profile)}

## Enabled Tools

${profile.enabledTools.map((tool) => `- ${tool}`).join('\n')}

## References

- \`workflow/README.md\`: workflow overview.
- \`workflow/core/commands/\`: the contract for each stage.
- \`workflow/core/capabilities/README.md\`: reusable checks and how each tool implements them.
- \`workflow/team-profile.yaml\`: this team's configuration and any missing source materials.

## Start

Read \`workflow/team-profile.yaml\`, then follow \`workflow/core/commands/\` for the requested stage.
`;
}

function makeThinCommand(toolName, id) {
  return `# ${toolName} adapter for /${id}

This is a thin adapter. Follow:

1. \`AGENTS.md\`
2. \`workflow/team-profile.yaml\`
3. \`workflow/core/commands/${id}.md\`

Do not add tool-specific behavior that conflicts with workflow/core.
`;
}

function makePrompt(id) {
  return `# ${id}

Read \`AGENTS.md\`, \`workflow/team-profile.yaml\`, and \`workflow/core/commands/${id}.md\`.

Use local evidence first. If required source materials are missing, update \`workflow/INITIALIZATION_QUESTIONS.md\` or ask the user for the missing paths.
`;
}

function makeCursorRule() {
  return `---
description: "Shared agent workflow: staged feature delivery, review, testing, and release preparation."
alwaysApply: true
---

# Agent Workflow (Cursor)

This workspace uses a tool-agnostic staged workflow. This rule is applied automatically to
every request. The full usage guide is in \`AGENTS.md\`.

## How To Run A Stage In Cursor

This kit generates Cursor custom slash commands under \`.cursor/commands/\` (Cursor 1.6+).
Type \`/\` in the Agent input, pick a stage, then describe the feature. Examples:

- \`/01-需求讨论\` start a new feature called billing-export
- \`/04-代码实现\` for feature billing-export

As a fallback, you can @-mention the stage contract directly, for example
\`@workflow/core/commands/04-代码实现.md\`.

The agent then reads the stage contract, \`workflow/team-profile.yaml\`, and the previous
\`features/<feature>/\` documents, and writes the stage output under \`features/<feature>/\`.

## Stage Order

new-feature -> 01-需求讨论 -> 02-产品文档 -> 03-技术架构 -> 04-代码实现 -> 05-代码审查 ->
06-测试用例 -> 07-测试执行 -> 08-验收表格 -> 09-验收 -> 10-培训文档 -> 11-上线邮件通知 -> 12-复盘总结

For a status summary across all features, follow \`workflow/core/commands/workflow-status.md\`.

## Task Briefing

State each task as Goal (what to achieve), Constraints (what must not change), and
Acceptance (how to prove it is correct).

## Sources

- Workflow rules: \`workflow/core/\`
- Team configuration: \`workflow/team-profile.yaml\`
- Reusable checks: \`workflow/core/capabilities/\`
- Full usage guide: \`AGENTS.md\`

## Hard Gates

- Do not modify business code before the feature branch gate and the implementation stage gate pass.
- Remote Git operations, branch creation, push, build/deploy triggers, database writes, and
  production config writes are manual-only.
- Same-repository parallel implementation requires separate worktrees after implementation starts.
`;
}

function makeGenericInstructions(toolName) {
  return `# ${toolName} Workflow Instructions

Read AGENTS.md first. Then use workflow/team-profile.yaml and workflow/core/commands for the requested stage.

This file is a thin adapter. It must not override workflow/core hard gates.
`;
}
