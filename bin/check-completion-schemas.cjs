#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  loadData,
  collectContractIssues,
  validateCompletionContract,
  validateEnvironmentManifest,
  validateFindingsManifest
} = require('./completion-core.cjs');

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || inferRoot());
const schemaDir = path.join(root, 'workflow/core/schemas');
const templateDir = path.join(root, 'workflow/core/templates');
const errors = [];
const allowedKeywords = new Set([
  '$schema', '$id', '$ref', '$defs', 'title', 'description', 'type', 'const', 'enum', 'properties',
  'additionalProperties', 'required', 'items', 'contains', 'minContains', 'minItems', 'maxItems',
  'uniqueItems', 'minLength', 'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum',
  'minProperties', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then'
]);

const schemaFiles = fs.readdirSync(schemaDir).filter((name) => name.endsWith('.schema.json')).sort();
if (!schemaFiles.length) errors.push('没有 completion schemas');
const schemas = new Map();
for (const name of schemaFiles) {
  let schema;
  try { schema = JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8')); }
  catch (error) { errors.push(`${name} 不是有效 JSON: ${error.message}`); continue; }
  schemas.set(name, schema);
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') errors.push(`${name} 必须声明 Draft 2020-12`);
  if (schema.type !== 'object') errors.push(`${name} 根 type 必须为 object`);
  inspectSchema(schema, name, schema);
}

const contractSchema = schemas.get('completion-contract.schema.json');
const requiredContractFields = ['schema_version', 'feature', 'policy_packs', 'policy_pack_exceptions', 'enabled_capabilities', 'objective', 'outcome', 'stakeholders', 'approvers', 'operational_owner', 'glossary', 'organization', 'assumptions', 'decisions', 'requirements', 'risks', 'scope', 'domain', 'quality_budgets', 'unknowns', 'release', 'acceptance', 'autonomy', 'governance'];
for (const field of requiredContractFields) if (!contractSchema || !(contractSchema.required || []).includes(field)) errors.push(`completion-contract schema required 缺少 ${field}`);

const runStateSchema = schemas.get('completion-run-state.schema.json');
const runStatuses = runStateSchema && runStateSchema.properties && runStateSchema.properties.status && runStateSchema.properties.status.enum || [];
if (runStatuses.includes('ACCEPTED')) errors.push('runner run-state schema 不得允许 ACCEPTED');
if (!runStateSchema || !runStateSchema.properties.accepted || runStateSchema.properties.accepted.const !== false) errors.push('runner run-state schema 必须固定 accepted=false');

for (const [schemaName, field] of [['execution-permit.schema.json', 'findings_fingerprint'], ['ledger-anchor.schema.json', 'findings_fingerprint'], ['completion-run-state.schema.json', 'findings_fingerprint']]) {
  const schema = schemas.get(schemaName);
  if (!schema || !schema.properties || !schema.properties[field]) errors.push(`${schemaName} 缺少 ${field}`);
}

const goldenContractFile = path.join(root, 'examples/definition-to-done/valid-contract.yaml');
const goldenEnvironmentFile = path.join(root, 'examples/definition-to-done/environment-manifest.yaml');
let goldenConformance = 'not-bundled-in-generated-workspace';
if (fs.existsSync(goldenContractFile) && fs.existsSync(goldenEnvironmentFile)) try {
  const validContract = loadData(goldenContractFile);
  validateCompletionContract(validContract);
  const env = loadData(goldenEnvironmentFile);
  validateEnvironmentManifest(env);
  const findings = {
    schema_version: '1.0',
    snapshot_at: new Date().toISOString(),
    owner: validContract.governance.findings_registry.owner,
    source: validContract.governance.findings_registry.source,
    findings: []
  };
  validateFindingsManifest(findings, validContract.governance.findings_registry);
  assertInstance(validContract, contractSchema, 'valid contract');
  assertInstance(env, schemas.get('environment-manifest.schema.json'), 'environment manifest');
  assertInstance(findings, schemas.get('findings-manifest.schema.json'), 'findings manifest');
  const unknownRoot = { ...validContract, unknown_root_field: true };
  if (!schemaErrors(unknownRoot, contractSchema, contractSchema, '$').length) errors.push('completion-contract schema 必须拒绝未知根字段');
  if (!collectContractIssues(unknownRoot).some((item) => item.code === 'UNKNOWN_FIELD')) errors.push('runtime contract linter 必须拒绝未知根字段');
  const invalidContract = loadData(path.join(root, 'examples/definition-to-done/invalid-vague-contract.yaml'));
  if (!collectContractIssues(invalidContract).some((item) => item.severity === 'error')) errors.push('invalid contract golden fixture 必须被 runtime validator 拒绝');
  goldenConformance = 'passed';
} catch (error) { errors.push(`runtime golden conformance 失败: ${error.message}`); }

for (const name of ['completion-contract.template.yaml', 'environment-manifest.template.yaml', 'findings-manifest.template.yaml', 'completion-run-state.template.yaml', 'completion-decision-packet.template.json', 'completion-evidence-entry.template.json']) {
  try { loadData(path.join(templateDir, name)); }
  catch (error) { errors.push(`${name} template 无法解析: ${error.message}`); }
}

try {
  const zeroHash = `sha256:${'0'.repeat(64)}`;
  const runState = loadData(path.join(templateDir, 'completion-run-state.template.yaml'));
  assertInstance(runState, schemas.get('completion-run-state.schema.json'), 'run-state template');
  assertInstance({
    schema_version: '1.0', sequence: 1, previous_hash: 'GENESIS', entry_hash: zeroHash,
    observed_at: new Date().toISOString(), criterion_id: 'AC-001', status: 'FAIL',
    contract_hash: zeroHash, source_fingerprint: zeroHash, environment_fingerprint: zeroHash,
    executor: { type: 'command' }
  }, schemas.get('evidence-ledger-entry.schema.json'), 'evidence entry fixture');
  assertInstance({
    schema_version: '1.0', permit_id: 'permit-fixture', key_id: 'owner-v1', issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(),
    contract_hash: zeroHash, environment_fingerprint: zeroHash, findings_fingerprint: zeroHash, scope_hash: zeroHash, base_commit: null,
    command_spec_hashes: [], executable_fingerprints: {}, budgets: { max_iterations: 1, max_elapsed_ms: 1000, max_command_executions: 1, max_cost_units: 1, cost_per_execution: 1, max_diff_lines: null },
    nonce: '0'.repeat(32), signature: { algorithm: 'ed25519', value: 'A'.repeat(40) }
  }, schemas.get('execution-permit.schema.json'), 'execution permit fixture');
  assertInstance({
    schema_version: '1.0', anchor_id: 'anchor-fixture', key_id: 'owner-v1', observed_at: new Date().toISOString(), contract_hash: zeroHash,
    source_fingerprint: zeroHash, environment_fingerprint: zeroHash, findings_fingerprint: zeroHash, ledger_head_hash: 'GENESIS', ledger_entry_count: 0,
    nonce: '0'.repeat(32), signature: { algorithm: 'ed25519', value: 'A'.repeat(40) }
  }, schemas.get('ledger-anchor.schema.json'), 'ledger anchor fixture');
  assertInstance(loadData(path.join(templateDir, 'completion-decision-packet.template.json')), schemas.get('completion-decision-packet.schema.json'), 'decision packet template');
} catch (error) { errors.push(`schema instance conformance 失败: ${error.message}`); }

if (errors.length) {
  console.error(`Completion schema 校验失败（${errors.length} 项）:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Completion schema 校验通过：${schemas.size} schemas / runtime golden conformance ${goldenConformance}.`);

function inspectSchema(node, label, rootSchema) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  for (const key of Object.keys(node)) if (!allowedKeywords.has(key)) errors.push(`${label} 使用未登记 JSON Schema keyword: ${key}`);
  if (node.required !== undefined) {
    if (!Array.isArray(node.required) || node.required.some((item) => typeof item !== 'string') || new Set(node.required).size !== node.required.length) errors.push(`${label}.required 必须是唯一字符串数组`);
    if (node.properties && typeof node.properties === 'object') for (const field of node.required || []) if (!Object.hasOwn(node.properties, field)) errors.push(`${label}.required 引用未声明 property: ${field}`);
  }
  if (node.pattern !== undefined) {
    try { new RegExp(node.pattern); } catch (error) { errors.push(`${label}.pattern 无效: ${error.message}`); }
  }
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/$defs/')) {
    const name = node.$ref.slice('#/$defs/'.length);
    if (!rootSchema.$defs || !Object.hasOwn(rootSchema.$defs, name)) errors.push(`${label} 引用不存在的 local $ref: ${node.$ref}`);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' || key === '$defs') for (const [child, childValue] of Object.entries(value || {})) inspectSchema(childValue, `${label}.${key}.${child}`, rootSchema);
    else if (['items', 'contains', 'additionalProperties', 'not', 'if', 'then'].includes(key) && value && typeof value === 'object') inspectSchema(value, `${label}.${key}`, rootSchema);
    else if (['oneOf', 'anyOf', 'allOf'].includes(key) && Array.isArray(value)) value.forEach((child, index) => inspectSchema(child, `${label}.${key}[${index}]`, rootSchema));
  }
}

function assertInstance(value, schema, label) {
  if (!schema) { errors.push(`${label} 缺少 schema`); return; }
  const failures = schemaErrors(value, schema, schema, '$');
  for (const failure of failures) errors.push(`${label}: ${failure}`);
}

function schemaErrors(value, schema, rootSchema, location) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/$defs/')) return [`${location} 不支持 external $ref ${schema.$ref}`];
    return schemaErrors(value, rootSchema.$defs && rootSchema.$defs[schema.$ref.slice('#/$defs/'.length)], rootSchema, location);
  }
  const failures = [];
  if (schema.allOf) for (const child of schema.allOf) failures.push(...schemaErrors(value, child, rootSchema, location));
  if (schema.anyOf && !schema.anyOf.some((child) => schemaErrors(value, child, rootSchema, location).length === 0)) failures.push(`${location} 不匹配 anyOf`);
  if (schema.oneOf && schema.oneOf.filter((child) => schemaErrors(value, child, rootSchema, location).length === 0).length !== 1) failures.push(`${location} 必须且只能匹配 oneOf 一个分支`);
  if (schema.not && schemaErrors(value, schema.not, rootSchema, location).length === 0) failures.push(`${location} 命中 not`);
  if (schema.if && schemaErrors(value, schema.if, rootSchema, location).length === 0 && schema.then) failures.push(...schemaErrors(value, schema.then, rootSchema, location));
  if (Object.hasOwn(schema, 'const') && !deepEqual(value, schema.const)) failures.push(`${location} 不等于 const`);
  if (schema.enum && !schema.enum.some((item) => deepEqual(value, item))) failures.push(`${location} 不在 enum 中`);
  if (schema.type && !matchesType(value, schema.type)) {
    failures.push(`${location} 类型不匹配 ${JSON.stringify(schema.type)}`);
    return failures;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) failures.push(`${location} 长度小于 ${schema.minLength}`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) failures.push(`${location} 不匹配 pattern`);
    if (schema.format === 'date-time' && !Number.isFinite(Date.parse(value))) failures.push(`${location} 不是 date-time`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) failures.push(`${location} 小于 minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) failures.push(`${location} 大于 maximum`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) failures.push(`${location} 不大于 exclusiveMinimum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) failures.push(`${location} items 少于 ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) failures.push(`${location} items 多于 ${schema.maxItems}`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) failures.push(`${location} items 不唯一`);
    if (schema.items) value.forEach((item, index) => failures.push(...schemaErrors(item, schema.items, rootSchema, `${location}[${index}]`)));
    if (schema.contains) {
      const count = value.filter((item) => schemaErrors(item, schema.contains, rootSchema, location).length === 0).length;
      if (count < (schema.minContains === undefined ? 1 : schema.minContains)) failures.push(`${location} contains 数量不足`);
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) failures.push(`${location} properties 少于 ${schema.minProperties}`);
    for (const field of schema.required || []) if (!Object.hasOwn(value, field)) failures.push(`${location}.${field} 缺失`);
    for (const [field, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, field)) failures.push(...schemaErrors(value[field], child, rootSchema, `${location}.${field}`));
    const declared = new Set(Object.keys(schema.properties || {}));
    const extras = Object.keys(value).filter((field) => !declared.has(field));
    if (schema.additionalProperties === false && extras.length) failures.push(`${location} 存在未知字段 ${extras.join(',')}`);
    else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') for (const field of extras) failures.push(...schemaErrors(value[field], schema.additionalProperties, rootSchema, `${location}.${field}`));
  }
  return failures;
}

function matchesType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => candidate === 'null' ? value === null
    : candidate === 'array' ? Array.isArray(value)
      : candidate === 'object' ? Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        : candidate === 'integer' ? Number.isInteger(value)
          : candidate === 'number' ? typeof value === 'number' && Number.isFinite(value)
            : candidate === 'string' ? typeof value === 'string'
              : candidate === 'boolean' ? typeof value === 'boolean' : false);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--root') output.root = argv[++index];
    else if (argv[index] === '--help') { console.log('用法: node bin/check-completion-schemas.cjs [--root dir]'); process.exit(0); }
    else throw new Error(`未知参数: ${argv[index]}`);
  }
  return output;
}

function inferRoot() {
  return fs.existsSync(path.resolve(__dirname, '../workflow/core/schemas')) ? path.resolve(__dirname, '..') : path.resolve(__dirname, '../..');
}
