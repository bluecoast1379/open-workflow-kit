#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadData } = require('./completion-core.cjs');
const { loadCommandManifest } = require('./command-manifest.cjs');

const mechanismRegistry = new Map();
for (const id of ['outcome', 'scope', 'ambiguity', 'traceability', 'oracle', 'quality-budget', 'cost-budget', 'organization', 'assumption-lifecycle', 'observability-budget', 'release-reversibility', 'dependency-owner']) {
  mechanismRegistry.set(`definition-lint:${id}`, { file: 'bin/completion-core.cjs', token: 'collectContractIssues' });
}
for (const id of ['scope-boundary', 'permit', 'integrity', 'budgets', 'signed-checkpoint', 'no-accepted-state']) {
  mechanismRegistry.set(`runner:${id}`, { file: 'bin/completion-core.cjs', token: 'runUntilDone' });
}
for (const id of ['evidence', 'fault-evidence', 'performance-evidence', 'cost-evidence', 'operations-evidence', 'fingerprints', 'attestation', 'freshness', 'waiver-policy', 'ai-evidence', 'state-separation']) {
  mechanismRegistry.set(`evaluator:${id}`, { file: 'bin/completion-core.cjs', token: 'evaluateDoD' });
}
for (const [id, file] of Object.entries({
  'business-outcome': 'workflow/core/commands/09-验收.md',
  'domain-semantics': 'workflow/core/commands/03-技术架构.md',
  'ux-rubric': 'workflow/core/commands/09-验收.md',
  consensus: 'workflow/core/commands/09-验收.md',
  'security-privacy': 'workflow/core/commands/05-代码审查.md',
  rollback: 'workflow/core/commands/08-验收表格.md',
  'negative-control': 'workflow/core/commands/06-测试用例.md',
  'supply-chain': 'workflow/core/commands/05-代码审查.md'
})) mechanismRegistry.set(`human-gate:${id}`, { file });

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || inferWorkspaceRoot());
const core = path.join(root, 'workflow/core');
const errors = [];

let commandManifest;
let capabilityManifest;
let definitionCatalog;
try {
  commandManifest = loadCommandManifest(path.join(core, 'command-manifest.yaml'));
  capabilityManifest = loadData(path.join(core, 'capability-manifest.yaml'));
  definitionCatalog = loadData(path.join(core, 'rules/definition-quality-catalog.yaml'));
} catch (error) {
  fail(`无法解析 Definition-to-Done 事实源: ${error.message}`, 2);
}

const commandIds = new Set(commandManifest.commands.map((item) => item.id));
const capabilities = Array.isArray(capabilityManifest.capabilities) ? capabilityManifest.capabilities : [];
const capabilityIds = new Set();

if (String(capabilityManifest.schema_version) !== '1.0') errors.push('capability manifest schema_version 必须为 1.0');
if (capabilityManifest.capability_count !== capabilities.length) {
  errors.push(`capability_count ${capabilityManifest.capability_count} 与实际 ${capabilities.length} 不一致`);
}
if (!capabilities.length) errors.push('capabilities 不得为空');

for (const [index, capability] of capabilities.entries()) {
  const label = capability && capability.id ? capability.id : `capabilities[${index}]`;
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
    errors.push(`${label} 必须为 object`);
    continue;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(capability.id || ''))) errors.push(`${label} id 非法`);
  if (capabilityIds.has(capability.id)) errors.push(`重复 capability id: ${capability.id}`);
  capabilityIds.add(capability.id);
  if (!['essential', 'recommended', 'optional'].includes(capability.tier)) errors.push(`${label} tier 非法`);
  if (!['agent', 'external', 'hybrid', 'builtin'].includes(capability.executor)) errors.push(`${label} executor 非法`);
  if (typeof capability.blocking !== 'boolean') errors.push(`${label} blocking 必须为 boolean`);
  for (const field of ['stages', 'required_inputs', 'evidence_types']) {
    if (!Array.isArray(capability[field]) || !capability[field].length || capability[field].some((item) => typeof item !== 'string' || !item.trim())) {
      errors.push(`${label} ${field} 必须为非空字符串数组`);
    }
  }
  for (const stage of capability.stages || []) {
    if (!commandIds.has(stage)) errors.push(`${label} 引用不存在的 command: ${stage}`);
  }
  const applies = capability.applies_when;
  if (!applies || typeof applies !== 'object' || Array.isArray(applies)) errors.push(`${label} 缺少 applies_when`);
  else {
    const keywords = Array.isArray(applies.any_keywords) ? applies.any_keywords : [];
    const paths = Array.isArray(applies.contract_paths) ? applies.contract_paths : [];
    if (!keywords.length && !paths.length && applies.always !== true) errors.push(`${label} applies_when 必须定义关键词、contract path 或 always`);
  }
  const doc = path.join(core, 'capabilities', `${capability.id}.md`);
  if (!fs.existsSync(doc)) errors.push(`${label} 缺少 capability 文档`);
}
const capabilityDocs = fs
  .readdirSync(path.join(core, 'capabilities'))
  .filter((name) => name.endsWith('.md') && name !== 'README.md')
  .map((name) => name.replace(/\.md$/, ''));
for (const id of capabilityDocs) if (!capabilityIds.has(id)) errors.push(`capability 文档未登记到 manifest: ${id}`);

const definitionRules = Array.isArray(definitionCatalog.rules) ? definitionCatalog.rules : [];
const ruleIds = new Set();
if (String(definitionCatalog.schema_version) !== '1.0') errors.push('definition catalog schema_version 必须为 1.0');
if (definitionCatalog.rule_count !== definitionRules.length) {
  errors.push(`definition rule_count ${definitionCatalog.rule_count} 与实际 ${definitionRules.length} 不一致`);
}
for (const [index, rule] of definitionRules.entries()) {
  const label = rule && rule.id ? rule.id : `rules[${index}]`;
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    errors.push(`${label} 必须为 object`);
    continue;
  }
  if (!/^OWK-DEF-\d{3}$/.test(String(rule.id || ''))) errors.push(`${label} id 非法`);
  if (ruleIds.has(rule.id)) errors.push(`重复 definition rule id: ${rule.id}`);
  ruleIds.add(rule.id);
  if (!['P0', 'P1', 'P2', 'P3'].includes(rule.severity)) errors.push(`${label} severity 非法`);
  for (const field of ['title', 'applies_when', 'check']) {
    if (typeof rule[field] !== 'string' || !rule[field].trim()) errors.push(`${label} 缺少 ${field}`);
  }
  for (const field of ['capabilities', 'commands']) {
    if (!Array.isArray(rule[field]) || !rule[field].length) errors.push(`${label} ${field} 必须为非空数组`);
  }
  for (const id of rule.capabilities || []) if (!capabilityIds.has(id)) errors.push(`${label} 引用不存在的 capability: ${id}`);
  for (const id of rule.commands || []) if (!commandIds.has(id)) errors.push(`${label} 引用不存在的 command: ${id}`);
}
for (let index = 1; index <= definitionRules.length; index++) {
  const expected = `OWK-DEF-${String(index).padStart(3, '0')}`;
  if (!ruleIds.has(expected)) errors.push(`缺少连续 definition rule id: ${expected}`);
}

const enforcement = Array.isArray(definitionCatalog.enforcement) ? definitionCatalog.enforcement : [];
if (definitionCatalog.enforcement_count !== enforcement.length) errors.push(`enforcement_count ${definitionCatalog.enforcement_count} 与实际 ${enforcement.length} 不一致`);
const enforcementRuleIds = new Set();
const referencedMechanisms = new Set();
const mechanismPattern = /^(?:definition-lint|policy-pack|runner|evaluator|human-gate):[a-z0-9-]+$/;
for (const [index, item] of enforcement.entries()) {
  const label = item && item.rule_id ? item.rule_id : `enforcement[${index}]`;
  if (!item || typeof item !== 'object' || Array.isArray(item) || !ruleIds.has(item.rule_id)) errors.push(`${label} enforcement 引用不存在的 rule`);
  if (enforcementRuleIds.has(item && item.rule_id)) errors.push(`${label} enforcement 重复`);
  enforcementRuleIds.add(item && item.rule_id);
  if (!['automated', 'hybrid', 'human'].includes(item && item.proof_mode)) errors.push(`${label} proof_mode 必须是 automated/hybrid/human`);
  if (!Array.isArray(item && item.mechanisms) || !item.mechanisms.length || item.mechanisms.some((mechanism) => !mechanismPattern.test(String(mechanism)))) errors.push(`${label} mechanisms 必须映射到可审计执行器`);
  for (const mechanism of item && item.mechanisms || []) referencedMechanisms.add(mechanism);
  if (item && item.proof_mode === 'human' && !(item.mechanisms || []).some((mechanism) => mechanism.startsWith('human-gate:'))) errors.push(`${label} human proof 必须映射 human-gate`);
}
for (const ruleId of ruleIds) if (!enforcementRuleIds.has(ruleId)) errors.push(`${ruleId} 缺少 enforcement mapping`);

const packsDir = path.join(core, 'policy-packs');
const packFiles = fs.existsSync(packsDir)
  ? fs.readdirSync(packsDir).filter((name) => name.endsWith('.yaml')).sort()
  : [];
const packs = new Map();
for (const name of packFiles) {
  let pack;
  try { pack = loadData(path.join(packsDir, name)); } catch (error) {
    errors.push(`${name} 无法解析: ${error.message}`);
    continue;
  }
  const id = String(pack.id || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) errors.push(`${name} id 非法`);
  if (`${id}.yaml` !== name) errors.push(`${name} 文件名必须与 id 一致`);
  if (packs.has(id)) errors.push(`重复 policy pack: ${id}`);
  packs.set(id, pack);
}
if (!packs.has('standard')) errors.push('policy packs 缺少 standard');
for (const [id, pack] of packs) {
  if (String(pack.schema_version) !== '1.0') errors.push(`${id} schema_version 必须为 1.0`);
  if (typeof pack.title !== 'string' || !pack.title.trim()) errors.push(`${id} 缺少 title`);
  for (const field of ['extends', 'required_capabilities', 'required_contract_sections', 'mandatory_acceptance_dimensions', 'blocking_rules']) {
    if (!Array.isArray(pack[field])) errors.push(`${id} ${field} 必须为数组`);
  }
  if (!(pack.required_capabilities || []).length) errors.push(`${id} required_capabilities 不得为空`);
  if (!(pack.required_contract_sections || []).length) errors.push(`${id} required_contract_sections 不得为空`);
  if (!(pack.mandatory_acceptance_dimensions || []).length) errors.push(`${id} mandatory_acceptance_dimensions 不得为空`);
  if (!(pack.blocking_rules || []).length) errors.push(`${id} blocking_rules 不得为空`);
  for (const capability of pack.required_capabilities || []) {
    if (!capabilityIds.has(capability)) errors.push(`${id} 引用不存在的 capability: ${capability}`);
  }
  for (const parent of pack.extends || []) {
    if (!packs.has(parent)) errors.push(`${id} extends 不存在的 pack: ${parent}`);
    if (parent === id) errors.push(`${id} 不得 extends 自身`);
  }
}

for (const id of packs.keys()) visitPack(id, []);

for (const mechanism of referencedMechanisms) {
  if (mechanism.startsWith('policy-pack:')) {
    const packId = mechanism.slice('policy-pack:'.length);
    if (!packs.has(packId)) errors.push(`enforcement mechanism 引用不存在的 policy pack: ${mechanism}`);
    continue;
  }
  const implementation = mechanismRegistry.get(mechanism);
  if (!implementation) {
    errors.push(`未知 enforcement mechanism: ${mechanism}`);
    continue;
  }
  const primaryFile = path.join(root, implementation.file);
  const generatedFile = implementation.file.startsWith('bin/') ? path.join(root, 'workflow', implementation.file) : null;
  const file = fs.existsSync(primaryFile) ? primaryFile : generatedFile;
  if (!file || !fs.existsSync(file)) {
    errors.push(`enforcement mechanism ${mechanism} 的实现文件不存在: ${implementation.file}`);
    continue;
  }
  if (implementation.token && !fs.readFileSync(file, 'utf8').includes(implementation.token)) errors.push(`enforcement mechanism ${mechanism} 的实现标记不存在: ${implementation.token}`);
}

if (errors.length) {
  console.error(`Definition system 校验失败（${errors.length} 项）:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Definition system 校验通过：${capabilities.length} capabilities / ${definitionRules.length} rules / ${packs.size} policy packs。`);

function visitPack(id, ancestry) {
  if (ancestry.includes(id)) {
    errors.push(`policy pack extends 循环: ${[...ancestry, id].join(' -> ')}`);
    return;
  }
  const pack = packs.get(id);
  if (!pack) return;
  for (const parent of pack.extends || []) visitPack(parent, [...ancestry, id]);
}

function parseArgs(argv) {
  const parsed = { root: '' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root') parsed.root = argv[++index] || '';
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node bin/check-definition-system.cjs [--root dir]');
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return parsed;
}

function inferWorkspaceRoot() {
  const generatedCore = path.resolve(__dirname, '../core/capability-manifest.yaml');
  return fs.existsSync(generatedCore) ? path.resolve(__dirname, '../..') : path.resolve(__dirname, '..');
}

function fail(message, status) {
  console.error(message);
  process.exit(status);
}
