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

const tools = parseTools(text);
const expected = {
  codex: { level: 'native', invocation: 'skill_fuzzy' },
  claude: { level: 'native', invocation: 'slash_fuzzy' },
  cursor: { level: 'native', invocation: 'slash_fuzzy' },
  copilot: { level: 'native', invocation: 'instruction_reference' },
  codebuddy: { level: 'native', invocation: 'slash_fuzzy' },
  kiro: { level: 'compatible', invocation: 'instruction_reference' },
  trae: { level: 'compatible', invocation: 'skill_fuzzy' }
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
  const level = expectedTool.level;
  if (tool.support_level !== level) errors.push(`${name} support_level 应为 ${level}`);
  if (tool.invocation_style !== expectedTool.invocation) {
    errors.push(`${name} invocation_style 应为 ${expectedTool.invocation}`);
  }
  if (!Array.isArray(tool.generated_entries) || !tool.generated_entries.length) {
    errors.push(`${name} generated_entries 必须为非空数组`);
  }
  if (typeof tool.documentation_url !== 'string' || !tool.documentation_url.startsWith('https://')) {
    errors.push(`${name} 缺少官方 documentation_url`);
  }
  if (tool.automated_conformance !== 'covered') errors.push(`${name} 缺少自动一致性覆盖`);
  if ((tool.generated_entries || []).some((entry) => entry.includes('RULE.mdc') || entry.includes('.codex/prompts'))) {
    errors.push(`${name} 引用已废弃 adapter 路径`);
  }

  if (level === 'native') {
    if (tool.official_path_status !== 'verified') errors.push(`${name} 原生入口路径未验证`);
    if (tool.manual_acceptance !== 'required-per-release') errors.push(`${name} 必须每个发布版本人工验收`);
    if (!Array.isArray(tool.manual_acceptance_evidence)) errors.push(`${name} 缺少 manual_acceptance_evidence 数组`);
    const allowed = ['native_not_yet_manually_certified', 'native_verified'];
    if (!allowed.includes(tool.verification_status)) errors.push(`${name} verification_status 非法`);
    if (tool.verification_status === 'native_verified' && !tool.manual_acceptance_evidence.length) {
      errors.push(`${name} 无真实工具验收证据，不得标记 native_verified`);
    }
  } else {
    if (tool.verification_status !== 'compatible') errors.push(`${name} compatible 入口不得冒充 native_verified`);
    if (tool.manual_acceptance !== 'not-required-for-compatible') errors.push(`${name} compatible 验收口径不一致`);
  }
}

const nativeCount = Object.values(tools).filter((tool) => tool.support_level === 'native').length;
const compatibleCount = Object.values(tools).filter((tool) => tool.support_level === 'compatible').length;
if (nativeCount !== 5) errors.push(`native 数量应为 5，当前 ${nativeCount}`);
if (compatibleCount !== 2) errors.push(`compatible 数量应为 2，当前 ${compatibleCount}`);

if (errors.length) {
  console.error(`Adapter 支持矩阵校验失败（${errors.length} 项）:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Adapter 支持矩阵校验通过：5 native / 2 compatible；命令发现方式与验收状态一致。');

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
