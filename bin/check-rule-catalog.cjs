#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || inferWorkspaceRoot());
const catalogFile = path.join(root, 'workflow/core/rules/rule-catalog.yaml');
const checklistDir = path.join(root, 'workflow/core/checklists');
const capabilityDir = path.join(root, 'workflow/core/capabilities');
const commandDir = path.join(root, 'workflow/core/commands');

const errors = [];
const catalogText = read(catalogFile);
const rules = parseRuleBlocks(catalogText);
const expectedRuleCount = integerField(catalogText, 'rule_count');
const expectedItemCount = integerField(catalogText, 'checklist_item_count');

if (expectedRuleCount !== 37) errors.push(`rule_count 必须为 37，当前为 ${expectedRuleCount}`);
if (rules.length !== expectedRuleCount) errors.push(`catalog 实际规则 ${rules.length} 与 rule_count ${expectedRuleCount} 不一致`);

const expectedIds = Array.from({ length: 37 }, (_, i) => `OWK-RULE-${String(i + 1).padStart(3, '0')}`);
const ruleIds = new Set();
const provenanceRefs = new Set();
const itemOwners = new Map();

for (const rule of rules) {
  if (!/^OWK-RULE-\d{3}$/.test(rule.id)) errors.push(`非法规则 ID: ${rule.id}`);
  if (ruleIds.has(rule.id)) errors.push(`重复规则 ID: ${rule.id}`);
  ruleIds.add(rule.id);
  for (const field of ['title', 'status', 'severity', 'applicability', 'introduced_in', 'private_provenance_ref']) {
    if (!rule[field]) errors.push(`${rule.id || '<unknown>'} 缺少 ${field}`);
  }
  if (!['active', 'deprecated', 'retired'].includes(rule.status)) errors.push(`${rule.id} status 非法: ${rule.status}`);
  if (!['P0', 'P1', 'P2'].includes(rule.severity)) errors.push(`${rule.id} severity 非法: ${rule.severity}`);
  if (!/^OWK-PRIVATE-RULE-\d{3}$/.test(rule.private_provenance_ref || '')) {
    errors.push(`${rule.id} private_provenance_ref 非法`);
  }
  if (provenanceRefs.has(rule.private_provenance_ref)) errors.push(`重复私有溯源引用: ${rule.private_provenance_ref}`);
  provenanceRefs.add(rule.private_provenance_ref);
  for (const listField of ['checklist_item_ids', 'capabilities', 'commands', 'public_evidence']) {
    if (!Array.isArray(rule[listField]) || !rule[listField].length) errors.push(`${rule.id} ${listField} 必须为非空数组`);
  }
  if (rule.status !== 'active') {
    for (const field of ['replaced_by', 'deprecation_reason', 'deprecated_in']) {
      if (!rule[field]) errors.push(`${rule.id} 已废弃但缺少 ${field}`);
    }
  }
  for (const itemId of rule.checklist_item_ids || []) {
    if (!itemOwners.has(itemId)) itemOwners.set(itemId, []);
    itemOwners.get(itemId).push(rule.id);
  }
}

for (const id of expectedIds) if (!ruleIds.has(id)) errors.push(`缺少规则 ID: ${id}`);

const checklistItems = loadChecklistItems(checklistDir);
if (checklistItems.size !== expectedItemCount) {
  errors.push(`清单 item 实际 ${checklistItems.size} 与 checklist_item_count ${expectedItemCount} 不一致`);
}
for (const [itemId] of checklistItems) {
  const owners = itemOwners.get(itemId) || [];
  if (!owners.length) errors.push(`孤儿清单 item: ${itemId}`);
  if (owners.length > 1) errors.push(`清单 item ${itemId} 被多条规则引用: ${owners.join(', ')}`);
}
for (const itemId of itemOwners.keys()) {
  if (!checklistItems.has(itemId)) errors.push(`catalog 引用不存在的清单 item: ${itemId}`);
}

for (const rule of rules) {
  const checklistNames = new Set(
    (rule.checklist_item_ids || []).map((id) => {
      const item = checklistItems.get(id);
      return item ? item.checklist : '';
    }).filter(Boolean)
  );
  for (const capability of rule.capabilities || []) {
    const file = path.join(capabilityDir, `${capability}.md`);
    if (!fs.existsSync(file)) {
      errors.push(`${rule.id} 引用不存在的 capability: ${capability}`);
      continue;
    }
    const text = read(file);
    for (const checklist of checklistNames) {
      if (!text.includes(checklist)) errors.push(`${rule.id} capability ${capability} 未引用清单 ${checklist}`);
    }
  }
  for (const command of rule.commands || []) {
    const file = path.join(commandDir, `${command}.md`);
    if (!fs.existsSync(file)) {
      errors.push(`${rule.id} 引用不存在的 command: ${command}`);
      continue;
    }
    const text = read(file);
    for (const checklist of checklistNames) {
      if (!text.includes(checklist)) errors.push(`${rule.id} command ${command} 未引用清单 ${checklist}`);
    }
  }
  for (const evidence of rule.public_evidence || []) {
    const [rel, anchor] = evidence.split('#');
    const file = path.join(root, rel || '');
    if (!rel || !fs.existsSync(file)) {
      errors.push(`${rule.id} 公开证据文件不存在: ${evidence}`);
      continue;
    }
    if (!anchor || !read(file).includes(anchor)) errors.push(`${rule.id} 公开证据锚点不存在: ${evidence}`);
  }
}

const privatePatterns = [
  /\/Users\//,
  /[A-Za-z]:\\Users\\/,
  /https?:\/\/(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|localhost|127\.0\.0\.1)/i
];
for (const pattern of privatePatterns) if (pattern.test(catalogText)) errors.push(`公开 catalog 命中私有数据模式: ${pattern}`);

if (args.provenance) validatePrivateProvenance(path.resolve(args.provenance), provenanceRefs, errors);

if (errors.length) {
  console.error(`规则目录校验失败（${errors.length} 项）:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`规则目录校验通过：${rules.length} 条规则 / ${checklistItems.size} 个清单 item / 无孤儿映射。`);

function parseRuleBlocks(text) {
  const matches = [...text.matchAll(/^  - id:\s*(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const block = text.slice(start, end);
    const rule = { id: parseScalar(match[1].trim()) };
    for (const field of [
      'title', 'status', 'severity', 'applicability', 'introduced_in',
      'private_provenance_ref', 'replaced_by', 'deprecation_reason', 'deprecated_in'
    ]) {
      rule[field] = scalarField(block, field);
    }
    for (const field of ['checklist_item_ids', 'capabilities', 'commands', 'public_evidence']) {
      rule[field] = arrayField(block, field);
    }
    return rule;
  });
}

function scalarField(block, name) {
  const match = block.match(new RegExp(`^\\s{4}${escapeRegExp(name)}:\\s*(.+)$`, 'm'));
  if (!match) return '';
  return parseScalar(match[1].trim());
}

function parseScalar(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function arrayField(block, name) {
  const raw = scalarField(block, name);
  return Array.isArray(raw) ? raw : [];
}

function integerField(text, name) {
  const match = text.match(new RegExp(`^${escapeRegExp(name)}:\\s*(\\d+)\\s*$`, 'm'));
  return match ? Number(match[1]) : NaN;
}

function loadChecklistItems(dir) {
  const items = new Map();
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.md') && name !== 'README.md');
  for (const name of files) {
    const checklist = name.replace(/\.md$/, '');
    const text = read(path.join(dir, name));
    for (const match of text.matchAll(/^- \[ \] \*\*((?:VCR|DCR|BH|TBS|TIR|LPJ)-\d{2})\b/gm)) {
      if (items.has(match[1])) errors.push(`清单 item ID 重复: ${match[1]}`);
      items.set(match[1], { checklist, file: name });
    }
  }
  return items;
}

function validatePrivateProvenance(file, refs, targetErrors) {
  if (!fs.existsSync(file)) {
    targetErrors.push(`私有 provenance 文件不存在: ${file}`);
    return;
  }
  const text = read(file);
  const entries = new Map();
  const blocks = text.split(/\n(?=\s*-\s+ref:)/);
  for (const block of blocks) {
    const ref = block.match(/^\s*-\s+ref:\s*"([^"]+)"/m);
    const fingerprint = block.match(/^\s+source_fingerprint:\s*"(sha256:[a-f0-9]{64})"/m);
    if (ref) entries.set(ref[1], fingerprint ? fingerprint[1] : '');
  }
  for (const ref of refs) {
    if (!entries.has(ref)) targetErrors.push(`私有 provenance 缺少 ${ref}`);
    else if (!entries.get(ref)) targetErrors.push(`私有 provenance ${ref} 缺少合法 sha256 指纹`);
  }
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    console.error(`无法读取 ${file}: ${error.message}`);
    process.exit(2);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs(argv) {
  const parsed = { root: '', provenance: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') parsed.root = argv[++i] || '';
    else if (arg === '--provenance') parsed.provenance = argv[++i] || '';
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node bin/check-rule-catalog.cjs [--root dir] [--provenance private-file]');
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return parsed;
}

function inferWorkspaceRoot() {
  const generatedCore = path.resolve(__dirname, '../core/rules/rule-catalog.yaml');
  return fs.existsSync(generatedCore) ? path.resolve(__dirname, '../..') : path.resolve(__dirname, '..');
}
