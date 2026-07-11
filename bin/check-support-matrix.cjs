#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(parseRoot(process.argv.slice(2)) || inferWorkspaceRoot());
const file = path.join(root, 'workflow/adapters/support-matrix.yaml');
const errors = [];
let text;

try {
  text = fs.readFileSync(file, 'utf8');
} catch (error) {
  console.error(`无法读取 support matrix: ${error.message}`);
  process.exit(2);
}

const expectedRoot = {
  schema_version: '2.0',
  claim: '7 official project-level adapters; generated conformance is not real-tool certification',
  multi_tool_coexistence_note: 'Codex requires shared .agents/skills; Cursor, Trae and other Agent Skills clients may also display those Skills beside their direct Commands. The kit removes tool-owned duplicate stage Skills but cannot hide an open-standard repo Skill from peer clients.'
};
for (const [field, expectedValue] of Object.entries(expectedRoot)) {
  const value = parseRootScalar(text, field);
  if (value !== expectedValue) errors.push(`${field} 应为 ${JSON.stringify(expectedValue)}`);
}

const tools = parseTools(text);
const expected = {
  codex: {
    invocation: 'skill_picker_fuzzy',
    exactSlash: 'unsupported',
    documentation: 'https://learn.chatgpt.com/docs/build-skills',
    patterns: ['.agents/skills/{skill_slug}/SKILL.md', '.agents/skills/{skill_slug}/agents/openai.yaml'],
    surfaces: ['Codex Desktop slash Skills group', '/skills', '$<skill-slug>'],
    secondaryDocs: ['https://learn.chatgpt.com/docs/reference/slash-commands']
  },
  claude: {
    invocation: 'slash_fuzzy',
    exactSlash: 'supported',
    documentation: 'https://code.claude.com/docs/en/slash-commands',
    patterns: ['.claude/commands/{id}.md'],
    surfaces: ['slash command menu']
  },
  cursor: {
    invocation: 'slash_fuzzy',
    exactSlash: 'supported',
    documentation: 'https://docs.cursor.com/en/agent/chat/commands',
    patterns: ['.cursor/commands/{id}.md'],
    surfaces: ['Agent slash command menu']
  },
  copilot: {
    invocation: 'prompt_fuzzy',
    exactSlash: 'client-dependent',
    documentation: 'https://docs.github.com/en/copilot/reference/customization-cheat-sheet',
    patterns: ['.github/prompts/{skill_slug}.prompt.md'],
    surfaces: ['Prompt picker', 'IDE slash prompt invocation where supported'],
    secondaryDocs: ['https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files/your-first-prompt-file']
  },
  codebuddy: {
    invocation: 'slash_fuzzy',
    exactSlash: 'supported',
    documentation: 'https://www.codebuddy.ai/docs/cli/slash-commands',
    patterns: ['.codebuddy/commands/{id}.md'],
    surfaces: ['slash command menu']
  },
  kiro: {
    invocation: 'slash_fuzzy',
    exactSlash: 'unsupported-use-skill-slug',
    documentation: 'https://kiro.dev/docs/chat/slash-commands/',
    patterns: ['.kiro/steering/{skill_slug}.md', '.kiro/skills/{skill_slug}/SKILL.md'],
    surfaces: ['IDE manual steering slash menu', 'CLI skill slash command'],
    secondaryDocs: ['https://kiro.dev/docs/steering/', 'https://kiro.dev/docs/cli/reference/slash-commands/']
  },
  trae: {
    invocation: 'slash_fuzzy',
    exactSlash: 'supported',
    documentation: 'https://docs.trae.ai/ide/skills',
    patterns: ['.trae/commands/{id}.md'],
    surfaces: ['Settings > Skills & Commands', 'slash command panel'],
    secondaryDocs: ['https://www.trae.ai/changelog']
  }
};

for (const name of Object.keys(expected)) {
  if (!tools[name]) errors.push(`缺少工具: ${name}`);
}
for (const name of Object.keys(tools)) {
  if (!expected[name]) errors.push(`未声明的工具: ${name}`);
}

for (const [name, expectedTool] of Object.entries(expected)) {
  const tool = tools[name];
  if (!tool) continue;
  if (tool.support_level !== 'native') errors.push(`${name} support_level 应为 native`);
  if (tool.invocation_style !== expectedTool.invocation) {
    errors.push(`${name} invocation_style 应为 ${expectedTool.invocation}`);
  }
  if (tool.exact_command_id_slash !== expectedTool.exactSlash) {
    errors.push(`${name} exact_command_id_slash 应为 ${expectedTool.exactSlash}`);
  }
  assertArrayContains(name, 'command_entry_patterns', tool.command_entry_patterns, expectedTool.patterns);
  assertArrayContains(name, 'discovery_surfaces', tool.discovery_surfaces, expectedTool.surfaces);
  if (!Array.isArray(tool.generated_entries) || !tool.generated_entries.length) {
    errors.push(`${name} generated_entries 必须为非空数组`);
  }
  assertArrayContains(name, 'generated_entries', tool.generated_entries, expectedTool.patterns);
  if (typeof tool.documentation_url !== 'string' || !tool.documentation_url.startsWith('https://')) {
    errors.push(`${name} 缺少官方 documentation_url`);
  }
  if (tool.documentation_url !== expectedTool.documentation) {
    errors.push(`${name} documentation_url 应为 ${expectedTool.documentation}`);
  }
  if (tool.secondary_documentation_urls !== undefined && (
    !Array.isArray(tool.secondary_documentation_urls) ||
    tool.secondary_documentation_urls.some((url) => typeof url !== 'string' || !url.startsWith('https://'))
  )) {
    errors.push(`${name} secondary_documentation_urls 必须是 HTTPS URL 数组`);
  }
  if (expectedTool.secondaryDocs) {
    assertArrayContains(name, 'secondary_documentation_urls', tool.secondary_documentation_urls, expectedTool.secondaryDocs);
  }
  if (typeof tool.official_path_status !== 'string' || !tool.official_path_status.startsWith('verified')) {
    errors.push(`${name} official_path_status 必须明确为 verified 开头`);
  }
  if (tool.automated_conformance !== 'covered') errors.push(`${name} 缺少自动一致性覆盖`);
  if (tool.manual_acceptance !== 'required-per-release') errors.push(`${name} 必须每个发布版本人工验收`);
  if (!Array.isArray(tool.manual_acceptance_evidence)) errors.push(`${name} 缺少 manual_acceptance_evidence 数组`);
  const allowed = ['native_not_yet_manually_certified', 'native_verified'];
  if (!allowed.includes(tool.verification_status)) errors.push(`${name} verification_status 非法`);
  if (tool.verification_status === 'native_verified') {
    if (!tool.manual_acceptance_evidence.length) {
      errors.push(`${name} 无真实工具验收证据，不得标记 native_verified`);
    } else if (tool.manual_acceptance_evidence.some((item) => typeof item !== 'string' || item.split('|').length < 3)) {
      errors.push(`${name} native_verified 证据必须包含工具版本、日期和脱敏证据引用`);
    }
  }

  const deprecated = ['RULE.mdc', '.codex/prompts', '.trae/instructions.md', '.trae-cn/'];
  const allEntries = [...(tool.generated_entries || []), ...(tool.command_entry_patterns || [])];
  if (allEntries.some((entry) => deprecated.some((value) => entry.includes(value)))) {
    errors.push(`${name} 引用已废弃 adapter 路径`);
  }
}

const trae = tools.trae;
if (trae) {
  const allTraeEntries = [...(trae.generated_entries || []), ...(trae.command_entry_patterns || [])];
  if (allTraeEntries.some((entry) => entry.includes('.trae-cn/') || entry.includes('.trae/skills/{skill_slug}'))) {
    errors.push('trae 每阶段只能生成 .trae/commands/{id}.md，不能生成 .trae-cn 镜像或重复的阶段 Skill');
  }
}

for (const name of ['cursor', 'trae']) {
  const note = tools[name] && tools[name].coexistence_note;
  if (typeof note !== 'string' || !note.includes('Codex .agents/skills')) {
    errors.push(`${name} 必须披露与 Codex 共存时的共享 Skill 可见性`);
  }
}

const nativeCount = Object.values(tools).filter((tool) => tool.support_level === 'native').length;
const compatibleCount = Object.values(tools).filter((tool) => tool.support_level === 'compatible').length;
if (nativeCount !== 7) errors.push(`native 数量应为 7，当前 ${nativeCount}`);
if (compatibleCount !== 0) errors.push(`compatible 数量应为 0，当前 ${compatibleCount}`);

if (errors.length) {
  console.error(`Adapter 支持矩阵校验失败（${errors.length} 项）:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Adapter 支持矩阵校验通过：7 个官方项目级 adapter；自动一致性与真实工具认证已分离。');

function assertArrayContains(toolName, field, actual, expectedValues) {
  if (!Array.isArray(actual)) {
    errors.push(`${toolName} ${field} 必须为数组`);
    return;
  }
  for (const expectedValue of expectedValues) {
    if (!actual.includes(expectedValue)) errors.push(`${toolName} ${field} 缺少 ${expectedValue}`);
  }
}

function parseRootScalar(source, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^${escaped}:\\s*(.*)$`, 'm'));
  return match ? parseScalar(match[1]) : undefined;
}

function parseTools(source) {
  const marker = source.match(/^tools:\s*$/m);
  if (!marker) return {};
  const lines = source.slice(marker.index + marker[0].length).split(/\r?\n/);
  const result = {};
  let current = '';
  for (const line of lines) {
    const tool = line.match(/^  ([a-z0-9_-]+):\s*$/);
    if (tool) {
      current = tool[1];
      result[current] = {};
      continue;
    }
    if (!current) continue;
    const field = line.match(/^    ([a-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    result[current][field[1]] = parseScalar(field[2]);
  }
  return result;
}

function parseScalar(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw.replace(/^['"]|['"]$/g, '');
  }
}

function parseRoot(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') return argv[++i] || '';
    if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('用法: node bin/check-support-matrix.cjs [--root dir]');
      process.exit(0);
    }
    throw new Error(`未知参数: ${argv[i]}`);
  }
  return '';
}

function inferWorkspaceRoot() {
  const generatedMatrix = path.resolve(__dirname, '../adapters/support-matrix.yaml');
  return fs.existsSync(generatedMatrix) ? path.resolve(__dirname, '../..') : path.resolve(__dirname, '..');
}
