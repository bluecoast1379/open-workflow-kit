#!/usr/bin/env node
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  EVIDENCE_STATUSES,
  parseData,
  loadData,
  canonicalStringify,
  hashCanonical,
  fingerprintPaths,
  fingerprintOraclePaths,
  fingerprintEnvironment,
  collectContractIssues,
  validateCompletionContract,
  validateEvidencePayload,
  appendEvidence,
  recoverEvidenceLedgerLock,
  signEvidenceEntry,
  readLedger,
  verifyLedgerEntries,
  evaluateDoD,
  runCommandOracle,
  commandSpecHash,
  publicKeyFingerprint,
  signExecutionPermit,
  signLedgerAnchor,
  fingerprintContractEnvironment,
  resolveGitHead,
  resolveExecutableIdentity,
  buildOracleEnvironment,
  signCheckpointState,
  verifyCheckpointState,
  runFileOracle,
  runOracle,
  measureGitDiffLines,
  runUntilDone,
  generateDoneCockpit
} = require('../bin/completion-core.cjs');

const TEST_AUTOMATION_KEY_ID = 'automation-local-v1';
const TEST_HUMAN_KEY_ID = 'human-owner-v1';
const TEST_AUTOMATION_KEY = 'automation-test-key-32-bytes-minimum-0001';
const TEST_HUMAN_KEY = 'human-test-key-32-bytes-minimum-00000001';
const TEST_FINDINGS_SNAPSHOT_AT = new Date().toISOString();
const TEST_ATTESTATION_KEYS = {
  [TEST_AUTOMATION_KEY_ID]: TEST_AUTOMATION_KEY,
  [TEST_HUMAN_KEY_ID]: TEST_HUMAN_KEY
};
const TEST_EXECUTION_KEYS = crypto.generateKeyPairSync('ed25519');
const TEST_EXECUTION_PUBLIC_KEY = TEST_EXECUTION_KEYS.publicKey.export({ type: 'spki', format: 'pem' });
const TEST_EXECUTION_PRIVATE_KEY = TEST_EXECUTION_KEYS.privateKey.export({ type: 'pkcs8', format: 'pem' });

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

function makeTemp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `owk-${name}-`));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function installOracleFixture(cwd) {
  write(path.join(cwd, 'oracle.cjs'), [
    "const fs = require('fs');",
    "const mode = process.argv[2] || '0';",
    "if (mode === 'mutate') fs.writeFileSync('source.txt', 'after\\n');",
    "if (mode === 'forbidden') fs.writeFileSync('forbidden.txt', 'unauthorized\\n');",
    "if (mode === 'env-clean' && Object.hasOwn(process.env, 'OWK_AUTOMATION_KEY')) process.exit(9);",
    "if (mode === 'echo') process.stdout.write(process.argv[3] || '');",
    "const numeric = Number(mode);",
    "process.exit(Number.isInteger(numeric) ? numeric : 0);",
    ''
  ].join('\n'));
  return fingerprintOraclePaths(['oracle.cjs'], { cwd }).fingerprint;
}

function configureOracle(contract, cwd, mode = '0') {
  const integrityFingerprint = installOracleFixture(cwd);
  contract.acceptance[0].oracle = {
    type: 'command',
    command: process.execPath,
    args: ['oracle.cjs', String(mode)],
    timeout_ms: 10000,
    expected_exit_code: 0,
    integrity_paths: ['oracle.cjs'],
    integrity_fingerprint: integrityFingerprint
  };
  return commandSpecHash(contract.acceptance[0].oracle);
}

function testEnvironmentManifest(name = 'test') {
  return {
    name,
    runtime_versions: { node: process.versions.node },
    dependency_versions: { fixture: 'synthetic-v1' },
    service_versions: { reason: 'N/A: no external service' },
    dataset_versions: { fixture: 'synthetic-v1' },
    model_versions: { reason: 'N/A: no model' },
    tool_versions: { 'open-workflow-kit': '1.0.0-test' }
  };
}

function testFindingsManifest(contract, overrides = {}) {
  return {
    schema_version: '1.0',
    snapshot_at: TEST_FINDINGS_SNAPSHOT_AT,
    owner: contract.governance.findings_registry.owner,
    source: contract.governance.findings_registry.source,
    findings: [],
    ...overrides
  };
}

function directCommandOptions(spec, cwd, overrides = {}) {
  const env = overrides.env || process.env;
  const specHash = commandSpecHash(spec);
  return {
    cwd,
    allowSpecHashes: [specHash],
    executableFingerprints: { [specHash]: resolveExecutableIdentity(spec.command, { cwd: path.resolve(cwd, spec.cwd || '.'), env }).fingerprint },
    ...overrides,
    env
  };
}

function authorizeOptions(options) {
  const contract = options.contract;
  const environment = isPlainEnvironment(options.environment) ? options.environment : testEnvironmentManifest(options.environment || 'local');
  const findingsManifest = options.findingsManifest || testFindingsManifest(contract);
  const commandSpecHashes = [
    ...(contract.acceptance || []).filter((criterion) => criterion && !criterion.human_gate && criterion.oracle && criterion.oracle.type === 'command').map((criterion) => commandSpecHash(criterion.oracle)),
    ...(contract.autonomy.iteration_command ? [commandSpecHash(contract.autonomy.iteration_command)] : [])
  ];
  const commandSpecs = [
    ...(contract.acceptance || []).filter((criterion) => criterion && !criterion.human_gate && criterion.oracle && criterion.oracle.type === 'command').map((criterion) => criterion.oracle),
    ...(contract.autonomy.iteration_command ? [contract.autonomy.iteration_command] : [])
  ];
  const oracleEnvironment = buildOracleEnvironment(options.env || process.env, contract.autonomy.oracle_env_allowlist, [TEST_AUTOMATION_KEY]);
  const executableFingerprints = Object.fromEntries(commandSpecs.map((spec) => [commandSpecHash(spec), resolveExecutableIdentity(spec.command, { cwd: path.resolve(options.cwd, spec.cwd || '.'), env: oracleEnvironment }).fingerprint]));
  const now = new Date(Number.isFinite(options.permitIssuedAtMs) ? options.permitIssuedAtMs : Date.now());
  const expiresAt = Number.isFinite(options.permitExpiresAtMs) ? options.permitExpiresAtMs : now.getTime() + 5 * 60000;
  const permit = signExecutionPermit({
    schema_version: '1.0',
    permit_id: crypto.randomUUID(),
    key_id: contract.governance.execution_authorization.key_id,
    issued_at: now.toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
    contract_hash: validateCompletionContract(contract).contract_hash,
    environment_fingerprint: fingerprintContractEnvironment(contract, environment),
    findings_fingerprint: hashCanonical(findingsManifest),
    scope_hash: hashCanonical(contract.scope),
    base_commit: resolveGitHead(options.cwd),
    command_spec_hashes: [...new Set(commandSpecHashes)].sort(),
    executable_fingerprints: executableFingerprints,
    budgets: {
      max_iterations: options.maxIterations === undefined ? contract.autonomy.max_iterations : Number(options.maxIterations),
      max_elapsed_ms: options.maxElapsedMs === undefined ? contract.autonomy.max_elapsed_minutes * 60000 : Number(options.maxElapsedMs),
      max_command_executions: options.maxCommandExecutions === undefined ? contract.autonomy.max_command_executions : Number(options.maxCommandExecutions),
      max_cost_units: options.maxCostUnits === undefined ? contract.autonomy.max_cost_units : Number(options.maxCostUnits),
      cost_per_execution: options.costPerExecution === undefined ? contract.autonomy.cost_per_execution : Number(options.costPerExecution),
      max_diff_lines: contract.autonomy.max_diff_lines === undefined ? null : Number(contract.autonomy.max_diff_lines)
    },
    nonce: crypto.randomBytes(16).toString('hex')
  }, TEST_EXECUTION_PRIVATE_KEY);
  return { ...options, environment, findingsManifest, executionPermit: permit, executionPublicKey: TEST_EXECUTION_PUBLIC_KEY };
}


function isPlainEnvironment(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function runAuthorized(options) {
  return runUntilDone(authorizeOptions(options));
}

function withLedgerAnchor(file, contract, options) {
  const entries = readLedger(file);
  const anchor = signLedgerAnchor({
    schema_version: '1.0',
    anchor_id: crypto.randomUUID(),
    key_id: contract.governance.ledger_anchor.key_id,
    observed_at: new Date().toISOString(),
    contract_hash: validateCompletionContract(contract).contract_hash,
    source_fingerprint: options.sourceFingerprint,
    environment_fingerprint: options.environmentFingerprint,
    findings_fingerprint: hashCanonical(options.findingsManifest),
    ledger_head_hash: entries.length ? entries[entries.length - 1].entry_hash : 'GENESIS',
    ledger_entry_count: entries.length,
    nonce: crypto.randomBytes(16).toString('hex')
  }, TEST_EXECUTION_PRIVATE_KEY);
  return {
    ...options,
    ledgerAnchor: anchor,
    ledgerAnchorPublicKey: TEST_EXECUTION_PUBLIC_KEY
  };
}

function initializeGitRepository(cwd) {
  assert.strictEqual(spawnSync('git', ['init', '-q'], { cwd }).status, 0);
  assert.strictEqual(spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd }).status, 0);
  assert.strictEqual(spawnSync('git', ['config', 'user.name', 'Completion Test'], { cwd }).status, 0);
  assert.strictEqual(spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd }).status, 0);
  assert.strictEqual(spawnSync('git', ['add', '.'], { cwd }).status, 0);
  assert.strictEqual(spawnSync('git', ['commit', '-qm', 'baseline'], { cwd }).status, 0);
}

function loadTemplate() {
  const template = loadData(path.resolve(__dirname, '../workflow/core/templates/completion-contract.template.yaml'));
  function resolvePlaceholders(value) {
    if (Array.isArray(value)) return value.map(resolvePlaceholders);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePlaceholders(item)]));
    if (typeof value === 'string' && /<\s*(?:TODO|FEATURE_ID)/i.test(value)) return 'N/A: deterministic test fixture with explicit rationale';
    return value;
  }
  return resolvePlaceholders(template);
}

function makeContract(sourcePath = 'source.txt') {
  const contract = loadTemplate();
  contract.feature.id = 'completion-core-test';
  contract.feature.objective = '以可复现证据证明 Completion Contract 内核运行正确';
  contract.feature.owner = 'owner';
  contract.feature.reviewers = ['reviewer'];
  contract.feature.status = 'frozen';
  contract.feature.created_at = '2026-07-11T00:00:00.000Z';
  contract.feature.frozen_at = '2026-07-11T00:01:00.000Z';
  contract.outcome = {
    north_star_metric: 'first-pass verified acceptance rate',
    baseline: '0% at 2026-07-11',
    target: '100%',
    observation_window: '7 days',
    guardrails: ['P0 escaped defect count = 0']
  };
  contract.stakeholders = ['maintainer'];
  contract.approvers = ['owner'];
  contract.operational_owner = 'maintainer';
  contract.organization = { dri: 'maintainer', decision_owner: 'owner', reviewers: ['reviewer'], dependency_owners: ['none: no external dependency'], escalation_path: 'owner' };
  contract.governance.status = 'frozen';
  contract.governance.evidence_attestation.key_principals[TEST_AUTOMATION_KEY_ID] = { role: 'automation', principal: 'test-runner' };
  contract.governance.evidence_attestation.key_principals[TEST_HUMAN_KEY_ID] = { role: 'human', principal: 'owner' };
  contract.governance.execution_authorization.trusted_public_key_sha256 = publicKeyFingerprint(TEST_EXECUTION_PUBLIC_KEY);
  contract.governance.ledger_anchor.trusted_public_key_sha256 = publicKeyFingerprint(TEST_EXECUTION_PUBLIC_KEY);
  contract.scope.source_paths = [sourcePath];
  contract.acceptance = [{
    id: 'AC-001',
    priority: 'P0',
    blocking: true,
    human_gate: false,
    requirement_refs: ['REQ-001'],
    risk_refs: [],
    dimensions: ['functional', 'negative-boundary', 'permissions', 'recovery', 'regression'],
    given: '测试夹具存在',
    when: '执行确定性命令',
    then: '退出码为 0 且 100% assertions 通过',
    threshold: 'exit code = 0 and assertion pass rate = 100%',
    environment: { name: 'test' },
    fixture: { dataset: 'fixture-v1' },
    freshness: { max_age_minutes: 60 },
    evidence_required: ['exit code and fingerprints'],
    oracle: {
      type: 'command',
      command: process.execPath,
      args: ['oracle.cjs', '0'],
      timeout_ms: 10000,
      expected_exit_code: 0,
      integrity_paths: [sourcePath],
      integrity_fingerprint: hashCanonical([])
    }
  }, {
    id: 'AC-002',
    priority: 'P0',
    blocking: true,
    human_gate: true,
    requirement_refs: ['REQ-002'],
    risk_refs: [],
    dimensions: ['functional'],
    given: '自动化验证已完成',
    when: '有权验收人执行真实目标任务',
    then: 'rubric 的 100% 项目均签收',
    threshold: 'rubric pass rate = 100%',
    environment: { name: 'acceptance' },
    fixture: { scenario: 'scenario-v1' },
    freshness: { max_age_minutes: 60 },
    evidence_required: ['signed rubric'],
    oracle: { type: 'manual', rubric: ['目标结果正确', '不可自动证明的体验判断已签收'] },
    waiver: { allowed: false, approvers: [], scopes: [] }
  }];
  delete contract.autonomy.max_diff_lines;
  return contract;
}

function automaticPass(contract, criterionId, source, environment, result = { status: 'PASS', assertions: [{ type: 'test', passed: true }] }) {
  const criterion = contract.acceptance.find((item) => item.id === criterionId);
  return {
    criterion_id: criterionId,
    status: 'PASS',
    contract_hash: validateCompletionContract(contract).contract_hash,
    source_fingerprint: source,
    environment_fingerprint: environment,
    executor: { type: criterion.oracle.type, oracle_hash: hashCanonical(criterion.oracle), principal: 'test-runner' },
    evidence_manifest: [...criterion.evidence_required],
    result
  };
}

function humanPass(contract, criterionId, source, environment, signedBy = 'owner') {
  const criterion = contract.acceptance.find((item) => item.id === criterionId);
  return {
    criterion_id: criterionId,
    status: 'PASS',
    contract_hash: validateCompletionContract(contract).contract_hash,
    source_fingerprint: source,
    environment_fingerprint: environment,
    executor: { type: 'authorized-human', signed_by: signedBy },
    evidence_manifest: [...criterion.evidence_required],
    result: {
      rubric_hash: hashCanonical(criterion.oracle.rubric),
      rubric_results: criterion.oracle.rubric.map((_, index) => ({ index, passed: true }))
    }
  };
}

async function main() {
  testParsingAndCanonicalHash();
  testDefinitionLinter();
  testSourceFingerprint();
  testLedgerAndDoD();
  testCommandSecurity();
  testFileOracleAndArtifacts();
  testDiffBudgetCoverage();
  testCockpitEscaping();
  testInitialization();
  await testRunUntilDone();
  testSchemasAreJson();
  console.log('Completion core test passed.');
}

function testParsingAndCanonicalHash() {
  const yaml = `schema_version: "1.0"\nname: demo\nitems:\n  - id: "A"\n    enabled: true\n    args: ["x", 2, false]\nmeta: {z: 1, a: "two"}\n`;
  const parsed = parseData(yaml, 'fixture.yaml');
  assert.strictEqual(parsed.items[0].id, 'A');
  assert.deepStrictEqual(parsed.items[0].args, ['x', 2, false]);
  assert.deepStrictEqual(parsed.meta, { z: 1, a: 'two' });
  assert.strictEqual(hashCanonical({ b: 2, a: { d: 4, c: 3 } }), hashCanonical({ a: { c: 3, d: 4 }, b: 2 }));
  assert.strictEqual(canonicalStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.throws(() => parseData('a: 1\na: 2\n', 'duplicate.yaml'), /重复字段/);
  assert.throws(() => parseData('a: &anchor 1\n', 'anchor.yaml'), /anchor/);
  assert.throws(() => parseData('__proto__:\n  polluted: true\nx: 1\n', 'prototype.yaml'), /禁止的对象键/);
  assert.throws(() => parseData('{"x":1,"__proto__":{"a":1}}', 'prototype.json'), /禁止的对象键/);
  const dangerousA = JSON.parse('{"x":1,"__proto__":{"a":1}}');
  const dangerousB = JSON.parse('{"x":1,"__proto__":{"a":2}}');
  assert.throws(() => hashCanonical(dangerousA), /canonical JSON 禁止对象键/);
  assert.throws(() => hashCanonical(dangerousB), /canonical JSON 禁止对象键/);
  assert.strictEqual({}.polluted, undefined);
  assert.deepStrictEqual(EVIDENCE_STATUSES, ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN', 'STALE', 'WAIVED']);
  assert.throws(() => require('../bin/completion-core.cjs').parseCliArgs(['--max-iterrations', '1'], ['max-iterations']), /未知参数/);
  assert.throws(() => require('../bin/completion-core.cjs').parseCliArgs(['unexpected'], [], 0), /位置参数过多/);
}

function testDefinitionLinter() {
  const valid = makeContract();
  assert.doesNotThrow(() => validateCompletionContract(valid));

  const missingEvidence = structuredClone(valid);
  missingEvidence.acceptance[0].evidence_required = [];
  assert.ok(collectContractIssues(missingEvidence).some((item) => item.code === 'EVIDENCE_REQUIRED' && item.severity === 'error'));

  const ambiguous = structuredClone(valid);
  ambiguous.acceptance[0].then = '交互必须流畅且自然';
  assert.ok(collectContractIssues(ambiguous).some((item) => item.code === 'AMBIGUOUS_WITHOUT_ORACLE'));

  const vagueOutcome = structuredClone(valid);
  vagueOutcome.outcome.target = '显著改善';
  assert.ok(collectContractIssues(vagueOutcome).some((item) => item.code === 'OUTCOME_NOT_QUANTIFIED'));

  const blockingUnknown = structuredClone(valid);
  blockingUnknown.unknowns = [{ id: 'U-001', question: '第三方 SLA 是什么', blocking: true }];
  const unknownIssues = collectContractIssues(blockingUnknown);
  assert.ok(unknownIssues.some((item) => item.path.endsWith('.owner') && item.severity === 'error'));
  assert.ok(unknownIssues.some((item) => item.path.endsWith('.validation_method') && item.severity === 'error'));

  const orphan = structuredClone(valid);
  orphan.acceptance[0].requirement_refs = ['REQ-999'];
  assert.ok(collectContractIssues(orphan).some((item) => item.code === 'ORPHAN_REFERENCE'));

  const badManual = structuredClone(valid);
  badManual.acceptance[0].human_gate = true;
  badManual.acceptance[0].oracle = { type: 'manual', rubric: [] };
  assert.ok(collectContractIssues(badManual).some((item) => item.code === 'MANUAL_RUBRIC'));

  const shell = structuredClone(valid);
  shell.acceptance[0].oracle = { type: 'command', command: 'sh', args: ['-c', 'true'] };
  assert.ok(collectContractIssues(shell).some((item) => item.code === 'SHELL_FORBIDDEN'));

  const unsafeScope = structuredClone(valid);
  unsafeScope.scope.allowed_paths = ['../outside'];
  assert.ok(collectContractIssues(unsafeScope).some((item) => item.code === 'SCOPE_PATH'));

  const unmappedInvariant = structuredClone(valid);
  unmappedInvariant.scope.invariant_acceptance_refs = [];
  assert.ok(collectContractIssues(unmappedInvariant).some((item) => item.code === 'INVARIANT_TRACEABILITY'));

  const badOutputAssertion = structuredClone(valid);
  badOutputAssertion.acceptance[0].oracle.stdout_contains = 'PASS';
  assert.ok(collectContractIssues(badOutputAssertion).some((item) => item.code === 'COMMAND_SPEC'));

  const blankEvidence = structuredClone(valid);
  blankEvidence.acceptance[0].evidence_required = [''];
  assert.ok(collectContractIssues(blankEvidence).some((item) => item.code === 'EVIDENCE_REQUIRED'));

  const expiredException = structuredClone(valid);
  expiredException.policy_pack_exceptions = [{ id: 'ai-feature', owner: 'owner', approved_by: 'owner', reason: 'synthetic expired exception', scope: 'ai-feature', expires_at: '2020-01-01T00:00:00.000Z' }];
  assert.ok(collectContractIssues(expiredException).some((item) => item.code === 'POLICY_EXCEPTION_EXPIRED'));

  const invalidAssumption = structuredClone(valid);
  invalidAssumption.assumptions = [{ id: 'ASM-001', statement: 'synthetic', owner: 'owner', confidence: 'high', validation_method: 'test', evidence: 'none', expires_at: 'not-a-date', status: 'open' }];
  assert.ok(collectContractIssues(invalidAssumption).some((item) => item.code === 'ASSUMPTION_INVALID'));

  const overlappingKey = structuredClone(valid);
  overlappingKey.governance.evidence_attestation.human_key_ids.push(TEST_AUTOMATION_KEY_ID);
  assert.ok(collectContractIssues(overlappingKey).some((item) => item.code === 'ATTESTATION_ROLE_OVERLAP'));

  const partialFreeze = structuredClone(valid);
  partialFreeze.feature.status = 'draft';
  assert.ok(collectContractIssues(partialFreeze).some((item) => item.code === 'FREEZE_STATUS_MISMATCH'));

  const unknownRoot = structuredClone(valid);
  unknownRoot.unpublished_extension = true;
  assert.ok(collectContractIssues(unknownRoot).some((item) => item.code === 'UNKNOWN_FIELD' && item.path === 'unpublished_extension'));

  for (const [field, value] of [['max_iterations', 1.5], ['max_command_executions', 2.25], ['max_same_failure', 'nonsense'], ['max_no_progress', 0]]) {
    const invalidBudget = structuredClone(valid);
    invalidBudget.autonomy[field] = value;
    assert.ok(collectContractIssues(invalidBudget).some((item) => item.path === `autonomy.${field}` && item.code === 'BUDGET'), `${field} must be rejected`);
  }

  const escapedCwd = structuredClone(valid);
  escapedCwd.acceptance[0].oracle.cwd = '../outside';
  assert.ok(collectContractIssues(escapedCwd).some((item) => item.path.endsWith('.cwd') && item.code === 'COMMAND_SPEC'));

  const incompleteRisk = structuredClone(valid);
  incompleteRisk.risks = [{ id: 'RISK-001' }];
  assert.ok(collectContractIssues(incompleteRisk).some((item) => item.code === 'RISK_INVALID'));

  const placeholderEnvironment = testEnvironmentManifest();
  placeholderEnvironment.runtime_versions.node = '<TODO: exact version>';
  assert.throws(() => require('../bin/completion-core.cjs').validateEnvironmentManifest(placeholderEnvironment), /placeholder/);
  const placeholderFindings = testFindingsManifest(valid, { owner: '<TODO: owner>' });
  assert.throws(() => require('../bin/completion-core.cjs').validateFindingsManifest(placeholderFindings, valid.governance.findings_registry), /placeholder/);
}

function testSourceFingerprint() {
  const tmp = makeTemp('fingerprint');
  write(path.join(tmp, 'src/a.txt'), 'one\n');
  write(path.join(tmp, 'src/b.txt'), 'two\n');
  const first = fingerprintPaths(['src'], { cwd: tmp });
  const reordered = fingerprintPaths(['src'], { cwd: tmp });
  assert.strictEqual(first.fingerprint, reordered.fingerprint);
  write(path.join(tmp, 'src/a.txt'), 'changed\n');
  const changed = fingerprintPaths(['src'], { cwd: tmp });
  assert.notStrictEqual(first.fingerprint, changed.fingerprint);
  write(path.join(tmp, 'features/demo/completion/evidence/ledger.jsonl'), 'runtime evidence');
  const withRuntime = fingerprintPaths(['.'], { cwd: tmp });
  write(path.join(tmp, 'features/demo/completion/evidence/ledger.jsonl'), 'changed runtime evidence');
  assert.strictEqual(withRuntime.fingerprint, fingerprintPaths(['.'], { cwd: tmp }).fingerprint);
  assert.throws(() => fingerprintPaths(['../escape'], { cwd: tmp }), /越出工作区/);
  for (const name of ['ä.txt', 'a.txt', 'Z.txt']) write(path.join(tmp, name), `${name}\n`);
  assert.deepStrictEqual(fingerprintOraclePaths(['ä.txt', 'a.txt', 'Z.txt'], { cwd: tmp }).records.map((item) => item.path), ['Z.txt', 'a.txt', 'ä.txt']);
  if (process.platform !== 'win32') {
    write(path.join(tmp, 'mode-check.txt'), 'same-content\n');
    fs.chmodSync(path.join(tmp, 'mode-check.txt'), 0o644);
    const sourceModeRegular = fingerprintPaths(['mode-check.txt'], { cwd: tmp }).fingerprint;
    const oracleModeRegular = fingerprintOraclePaths(['mode-check.txt'], { cwd: tmp }).fingerprint;
    fs.chmodSync(path.join(tmp, 'mode-check.txt'), 0o755);
    assert.notStrictEqual(sourceModeRegular, fingerprintPaths(['mode-check.txt'], { cwd: tmp }).fingerprint, 'source fingerprint should still detect executable-mode changes on POSIX');
    assert.strictEqual(oracleModeRegular, fingerprintOraclePaths(['mode-check.txt'], { cwd: tmp }).fingerprint, 'oracle integrity must be content/path-only across POSIX and Windows checkouts');
    write(path.join(tmp, 'src/linked-target.txt'), 'linked-v1\n');
    fs.symlinkSync('linked-target.txt', path.join(tmp, 'src/linked.txt'));
    const linkedV1 = fingerprintPaths(['src'], { cwd: tmp }).fingerprint;
    write(path.join(tmp, 'src/linked-target.txt'), 'linked-v2\n');
    assert.notStrictEqual(linkedV1, fingerprintPaths(['src'], { cwd: tmp }).fingerprint, 'in-workspace symlink target content must be fingerprinted');
    const outside = makeTemp('outside-source-link');
    write(path.join(outside, 'outside.txt'), 'outside\n');
    fs.symlinkSync(path.join(outside, 'outside.txt'), path.join(tmp, 'src/outside-link.txt'));
    assert.throws(() => fingerprintPaths(['src'], { cwd: tmp }), /source symlink.*越出工作区/);
  }

  const environmentContract = makeContract();
  const environmentV1 = fingerprintContractEnvironment(environmentContract, { name: 'test', dependency_versions: { demo: '1.0.0' } });
  environmentContract.acceptance[0].fixture.dataset = 'fixture-v2';
  const environmentV2 = fingerprintContractEnvironment(environmentContract, { name: 'test', dependency_versions: { demo: '1.0.0' } });
  assert.notStrictEqual(environmentV1, environmentV2, 'fixture changes must invalidate environment evidence even when the environment name is unchanged');
}

function testLedgerAndDoD() {
  const tmp = makeTemp('ledger');
  const ledger = path.join(tmp, 'evidence/ledger.jsonl');
  const contract = makeContract('source.txt');
  const contractHash = validateCompletionContract(contract).contract_hash;
  const source = hashCanonical('source-v1');
  const environment = fingerprintEnvironment({ name: 'test', dataset: 'v1' });
  const evaluationOptions = { sourceFingerprint: source, environmentFingerprint: environment, findingsManifest: testFindingsManifest(contract), attestationKeys: TEST_ATTESTATION_KEYS };
  let evaluation = evaluateDoD(contract, [], evaluationOptions);
  assert.strictEqual(evaluation.criteria[0].status, 'NOT_RUN');
  assert.strictEqual(evaluation.automation_complete, false);

  const first = appendEvidence(ledger, automaticPass(contract, 'AC-001', source, environment), {
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  });
  assert.strictEqual(first.sequence, 1);
  assert.strictEqual(first.previous_hash, 'GENESIS');
  assert.throws(() => validateEvidencePayload({ ...first, unpublished_extension: true }), /未知字段/);
  assert.throws(() => validateEvidencePayload({ ...first, attestation: { ...first.attestation, comment: 'unsigned extension' } }), /attestation.*未知字段/);
  write(`${ledger}.lock`, 'held');
  assert.throws(() => appendEvidence(ledger, {
    criterion_id: 'AC-001', status: 'FAIL', contract_hash: contractHash,
    source_fingerprint: source, environment_fingerprint: environment,
    executor: { type: 'test-lock' }
  }), /另一个 writer/);
  fs.unlinkSync(`${ledger}.lock`);
  const recoveryLedger = path.join(tmp, 'evidence/recovery-ledger.jsonl');
  const staleToken = crypto.randomBytes(16).toString('hex');
  const exitedWriter = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.ok(Number.isInteger(exitedWriter.pid) && exitedWriter.pid > 0);
  const staleLock = {
    schema_version: '1.0',
    token: staleToken,
    pid: exitedWriter.pid,
    host: os.hostname(),
    acquired_at: new Date(Date.now() - 120000).toISOString(),
    process_start_at: new Date(Date.now() - 180000).toISOString()
  };
  write(`${recoveryLedger}.lock`, JSON.stringify(staleLock) + '\n');
  assert.throws(() => recoverEvidenceLedgerLock(recoveryLedger, { lockToken: crypto.randomBytes(16).toString('hex'), minAgeMs: 60000 }), /token/);
  const recovered = recoverEvidenceLedgerLock(recoveryLedger, { lockToken: staleToken, minAgeMs: 60000 });
  assert.strictEqual(recovered.recovered, true);
  assert.ok(fs.existsSync(recovered.quarantine));
  assert.ok(!fs.existsSync(`${recoveryLedger}.lock`));
  const liveToken = crypto.randomBytes(16).toString('hex');
  write(`${recoveryLedger}.lock`, JSON.stringify({ ...staleLock, token: liveToken, pid: process.pid }) + '\n');
  assert.throws(() => recoverEvidenceLedgerLock(recoveryLedger, { lockToken: liveToken, minAgeMs: 60000 }), /仍存活/);
  fs.unlinkSync(`${recoveryLedger}.lock`);
  evaluation = evaluateDoD(contract, readLedger(ledger), evaluationOptions);
  assert.strictEqual(evaluation.automation_complete, true);
  assert.strictEqual(evaluation.accepted, false);
  assert.strictEqual(evaluation.state, 'READY_FOR_HUMAN_ACCEPTANCE');
  const openFindingEvaluation = evaluateDoD(contract, readLedger(ledger), {
    ...evaluationOptions,
    findingsManifest: testFindingsManifest(contract, { findings: [{ id: 'FIND-001', priority: 'P1', status: 'OPEN', title: 'blocking review finding', owner: 'owner' }] })
  });
  assert.strictEqual(openFindingEvaluation.automation_complete, false);
  assert.ok(openFindingEvaluation.blockers.some((item) => item.id === 'FIND-001' && item.reason === 'OPEN_P1_FINDING'));
  appendEvidence(ledger, humanPass(contract, 'AC-002', source, environment), {
    attestationKey: TEST_HUMAN_KEY,
    attestationKeyId: TEST_HUMAN_KEY_ID
  });
  const ledgerCli = path.resolve(__dirname, '../bin/evidence-ledger.cjs');
  const chainOnly = spawnSync(process.execPath, [ledgerCli, 'verify', '--ledger', ledger], { encoding: 'utf8' });
  assert.strictEqual(chainOnly.status, 0, chainOnly.stderr);
  const chainOnlyResult = JSON.parse(chainOnly.stdout);
  assert.strictEqual(chainOnlyResult.chain_valid, true);
  assert.strictEqual(chainOnlyResult.attestation_valid, null);
  assert.strictEqual(chainOnlyResult.valid, null);
  assert.strictEqual(chainOnlyResult.head_hash, readLedger(ledger).at(-1).entry_hash);
  const fullVerify = spawnSync(process.execPath, [ledgerCli, 'verify', '--ledger', ledger, '--attestation-key', `${TEST_AUTOMATION_KEY_ID}=TEST_AUTOMATION_HMAC`, '--attestation-key', `${TEST_HUMAN_KEY_ID}=TEST_HUMAN_HMAC`], {
    encoding: 'utf8',
    env: { ...process.env, TEST_AUTOMATION_HMAC: TEST_AUTOMATION_KEY, TEST_HUMAN_HMAC: TEST_HUMAN_KEY }
  });
  assert.strictEqual(fullVerify.status, 0, fullVerify.stderr);
  const fullVerifyResult = JSON.parse(fullVerify.stdout);
  assert.strictEqual(fullVerifyResult.valid, true);
  assert.strictEqual(fullVerifyResult.attestation_valid, true);
  evaluation = evaluateDoD(contract, readLedger(ledger), evaluationOptions);
  assert.strictEqual(evaluation.accepted, false);
  assert.strictEqual(evaluation.state, 'EXTERNAL_LEDGER_ANCHOR_REQUIRED');
  const anchoredOptions = withLedgerAnchor(ledger, contract, evaluationOptions);
  evaluation = evaluateDoD(contract, readLedger(ledger), anchoredOptions);
  assert.strictEqual(evaluation.accepted, true);
  assert.strictEqual(evaluation.state, 'ACCEPTED');
  const tamperedAnchor = structuredClone(anchoredOptions.ledgerAnchor);
  tamperedAnchor.ledger_entry_count += 1;
  const tamperedAnchorEvaluation = evaluateDoD(contract, readLedger(ledger), { ...evaluationOptions, ledgerAnchor: tamperedAnchor, ledgerAnchorPublicKey: TEST_EXECUTION_PUBLIC_KEY });
  assert.strictEqual(tamperedAnchorEvaluation.accepted, false);
  assert.strictEqual(tamperedAnchorEvaluation.state, 'EXTERNAL_LEDGER_ANCHOR_INVALID');
  const unsignedAnchorExtension = structuredClone(anchoredOptions.ledgerAnchor);
  unsignedAnchorExtension.signature.comment = 'unsigned extension';
  const unsignedAnchorEvaluation = evaluateDoD(contract, readLedger(ledger), { ...evaluationOptions, ledgerAnchor: unsignedAnchorExtension, ledgerAnchorPublicKey: TEST_EXECUTION_PUBLIC_KEY });
  assert.strictEqual(unsignedAnchorEvaluation.state, 'EXTERNAL_LEDGER_ANCHOR_INVALID');

  const stale = evaluateDoD(contract, readLedger(ledger), { ...evaluationOptions, sourceFingerprint: hashCanonical('source-v2') });
  assert.strictEqual(stale.criteria[0].status, 'STALE');
  assert.strictEqual(stale.criteria[0].reason, 'SOURCE_CHANGED');

  const draftContract = structuredClone(contract);
  draftContract.feature.status = 'draft';
  draftContract.feature.frozen_at = null;
  draftContract.governance.status = 'draft';
  const draftLedger = path.join(tmp, 'draft.jsonl');
  appendEvidence(draftLedger, automaticPass(draftContract, 'AC-001', source, environment), { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
  appendEvidence(draftLedger, humanPass(draftContract, 'AC-002', source, environment), { attestationKey: TEST_HUMAN_KEY, attestationKeyId: TEST_HUMAN_KEY_ID });
  const draftEvaluation = evaluateDoD(draftContract, readLedger(draftLedger), withLedgerAnchor(draftLedger, draftContract, evaluationOptions));
  assert.strictEqual(draftEvaluation.accepted, false);
  assert.ok(draftEvaluation.blockers.some((item) => item.reason === 'CONTRACT_NOT_FULLY_FROZEN'));

  const forgedLedger = path.join(tmp, 'forged.jsonl');
  const forged = automaticPass(contract, 'AC-001', source, environment);
  appendEvidence(forgedLedger, forged, { attestationKey: 'wrong-key-that-is-still-at-least-32-bytes-long', attestationKeyId: TEST_AUTOMATION_KEY_ID });
  const forgedEvaluation = evaluateDoD(contract, readLedger(forgedLedger), evaluationOptions);
  assert.strictEqual(forgedEvaluation.criteria[0].status, 'BLOCKED');
  assert.strictEqual(forgedEvaluation.criteria[0].reason, 'ATTESTATION_SIGNATURE_INVALID');

  const forgedHumanLedger = path.join(tmp, 'forged-human.jsonl');
  const forgedHuman = humanPass(contract, 'AC-002', source, environment, 'intruder');
  appendEvidence(forgedHumanLedger, forgedHuman, { attestationKey: TEST_HUMAN_KEY, attestationKeyId: TEST_HUMAN_KEY_ID });
  const forgedHumanEvaluation = evaluateDoD(contract, readLedger(forgedHumanLedger), evaluationOptions);
  assert.strictEqual(forgedHumanEvaluation.criteria[1].status, 'BLOCKED');
  assert.strictEqual(forgedHumanEvaluation.criteria[1].reason, 'HUMAN_SIGNER_NOT_ALLOWED');

  const unsignedLedger = path.join(tmp, 'unsigned.jsonl');
  appendEvidence(unsignedLedger, automaticPass(contract, 'AC-001', source, environment));
  const unsignedEvaluation = evaluateDoD(contract, readLedger(unsignedLedger), evaluationOptions);
  assert.strictEqual(unsignedEvaluation.criteria[0].status, 'BLOCKED');
  assert.strictEqual(unsignedEvaluation.criteria[0].reason, 'ATTESTATION_MISSING_OR_INVALID');

  const badRubricLedger = path.join(tmp, 'bad-rubric.jsonl');
  const badRubric = humanPass(contract, 'AC-002', source, environment);
  badRubric.result.rubric_results[0].passed = false;
  appendEvidence(badRubricLedger, badRubric, { attestationKey: TEST_HUMAN_KEY, attestationKeyId: TEST_HUMAN_KEY_ID });
  const badRubricEvaluation = evaluateDoD(contract, readLedger(badRubricLedger), evaluationOptions);
  assert.strictEqual(badRubricEvaluation.criteria[1].status, 'BLOCKED');
  assert.strictEqual(badRubricEvaluation.criteria[1].reason, 'HUMAN_RUBRIC_NOT_FULLY_PASSED');

  const flakyLedger = path.join(tmp, 'flaky.jsonl');
  appendEvidence(flakyLedger, automaticPass(contract, 'AC-001', source, environment), { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
  const conflictingFailure = automaticPass(contract, 'AC-001', source, environment);
  conflictingFailure.status = 'FAIL';
  conflictingFailure.reason = 'ASSERTION_FAILED';
  conflictingFailure.result = { status: 'FAIL', assertions: [{ type: 'synthetic', passed: false }] };
  appendEvidence(flakyLedger, conflictingFailure, { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
  const flakyEvaluation = evaluateDoD(contract, readLedger(flakyLedger), evaluationOptions);
  assert.strictEqual(flakyEvaluation.criteria[0].status, 'BLOCKED');
  assert.strictEqual(flakyEvaluation.criteria[0].reason, 'FLAKY_SAME_SNAPSHOT_CONFLICT');

  const futureLedger = path.join(tmp, 'future.jsonl');
  const future = automaticPass(contract, 'AC-001', source, environment);
  future.observed_at = new Date(Date.now() + 4 * 60000).toISOString();
  appendEvidence(futureLedger, future, { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
  const futureEvaluation = evaluateDoD(contract, readLedger(futureLedger), { ...evaluationOptions, nowMs: Date.now() - 2 * 60000 });
  assert.strictEqual(futureEvaluation.criteria[0].status, 'BLOCKED');
  assert.strictEqual(futureEvaluation.criteria[0].reason, 'EVIDENCE_FROM_FUTURE');

  const expiredLedger = path.join(tmp, 'expired.jsonl');
  const expired = automaticPass(contract, 'AC-001', source, environment);
  expired.observed_at = new Date(Date.now() - 61 * 60000).toISOString();
  appendEvidence(expiredLedger, expired, { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
  const expiredEvaluation = evaluateDoD(contract, readLedger(expiredLedger), evaluationOptions);
  assert.strictEqual(expiredEvaluation.criteria[0].status, 'STALE');
  assert.strictEqual(expiredEvaluation.criteria[0].reason, 'EVIDENCE_EXPIRED');

  const manual = structuredClone(contract);
  manual.acceptance[1].waiver = { allowed: true, approvers: ['owner'], scopes: ['AC-002'], max_expiry_days: 400000 };
  const manualLedger = path.join(tmp, 'manual.jsonl');
  appendEvidence(manualLedger, automaticPass(manual, 'AC-001', source, environment), { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
  evaluation = evaluateDoD(manual, readLedger(manualLedger), withLedgerAnchor(manualLedger, manual, evaluationOptions));
  assert.strictEqual(evaluation.automation_complete, true);
  assert.strictEqual(evaluation.accepted, false);
  assert.strictEqual(evaluation.state, 'READY_FOR_HUMAN_ACCEPTANCE');
  appendEvidence(manualLedger, {
    criterion_id: 'AC-002', status: 'WAIVED', contract_hash: validateCompletionContract(manual).contract_hash,
    source_fingerprint: source, environment_fingerprint: environment,
    executor: { type: 'authorized-human', signed_by: 'owner' },
    evidence_manifest: [...manual.acceptance[1].evidence_required],
    waiver: { approved_by: 'owner', scope: 'AC-002', reason: '受控范围豁免', compensation: '上线后 24 小时内补做人工验收', expires_at: '2999-01-01T00:00:00.000Z' }
  }, { attestationKey: TEST_HUMAN_KEY, attestationKeyId: TEST_HUMAN_KEY_ID });
  evaluation = evaluateDoD(manual, readLedger(manualLedger), withLedgerAnchor(manualLedger, manual, evaluationOptions));
  assert.strictEqual(evaluation.accepted, true);
  assert.strictEqual(evaluation.criteria[1].status, 'WAIVED');

  const unauthorized = structuredClone(contract);
  const unauthorizedLedger = path.join(tmp, 'unauthorized.jsonl');
  appendEvidence(unauthorizedLedger, automaticPass(unauthorized, 'AC-001', source, environment), { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
  appendEvidence(unauthorizedLedger, {
    criterion_id: 'AC-002', status: 'WAIVED', contract_hash: validateCompletionContract(unauthorized).contract_hash,
    source_fingerprint: source, environment_fingerprint: environment,
    executor: { type: 'authorized-human', signed_by: 'owner' }, evidence_manifest: [...unauthorized.acceptance[1].evidence_required],
    waiver: { approved_by: 'owner', scope: 'AC-002', reason: '没有合同授权', compensation: 'none', expires_at: '2999-01-01T00:00:00.000Z' }
  }, { attestationKey: TEST_HUMAN_KEY, attestationKeyId: TEST_HUMAN_KEY_ID });
  const unauthorizedEvaluation = evaluateDoD(unauthorized, readLedger(unauthorizedLedger), evaluationOptions);
  assert.strictEqual(unauthorizedEvaluation.criteria[1].status, 'BLOCKED');
  assert.strictEqual(unauthorizedEvaluation.criteria[1].reason, 'WAIVER_NOT_ALLOWED');

  const tampered = readLedger(ledger, { verify: false });
  tampered[0].status = 'FAIL';
  assert.throws(() => verifyLedgerEntries(tampered), /entry_hash 无效/);
}

function testCommandSecurity() {
  const tmp = makeTemp('command');
  const integrityFingerprint = installOracleFixture(tmp);
  const marker = path.join(tmp, 'injected');
  const maliciousArgument = `; touch ${marker}`;
  const spec = {
    type: 'command',
    command: process.execPath,
    args: ['oracle.cjs', 'echo', maliciousArgument],
    stdout_contains: [maliciousArgument],
    expected_exit_code: 0,
    integrity_paths: ['oracle.cjs'],
    integrity_fingerprint: integrityFingerprint
  };
  const result = runCommandOracle(spec, directCommandOptions(spec, tmp));
  assert.strictEqual(result.status, 'PASS');
  assert.strictEqual(fs.existsSync(marker), false, 'command args must never be interpreted by a shell');
  assert.ok(!Object.hasOwn(result, 'stdout'), 'raw output must not enter evidence');

  const blockedShell = runCommandOracle({
    type: 'command', command: 'sh', args: ['-c', `touch ${marker}`],
    integrity_paths: ['oracle.cjs'], integrity_fingerprint: integrityFingerprint
  }, { cwd: tmp, allowSpecHashes: [] });
  assert.strictEqual(blockedShell.status, 'BLOCKED');
  assert.strictEqual(fs.existsSync(marker), false);

  const denied = runCommandOracle(spec, { cwd: tmp, allowSpecHashes: [] });
  assert.strictEqual(denied.reason, 'COMMAND_SPEC_NOT_ALLOWLISTED');

  const inline = { ...spec, args: ['-e', 'process.exit(0)'] };
  assert.strictEqual(runCommandOracle(inline, { cwd: tmp, allowSpecHashes: [commandSpecHash(inline)] }).reason, 'INVALID_COMMAND_SPEC');
  for (const forbidden of [
    { command: 'git', args: ['push'] },
    { command: 'npm', args: ['publish'] },
    { command: 'curl', args: ['https://example.invalid'] }
  ]) {
    const unsafe = { type: 'command', ...forbidden, integrity_paths: ['oracle.cjs'], integrity_fingerprint: integrityFingerprint };
    assert.strictEqual(runCommandOracle(unsafe, { cwd: tmp, allowSpecHashes: [commandSpecHash(unsafe)] }).reason, 'INVALID_COMMAND_SPEC');
  }

  const changedIntegrity = { ...spec, integrity_fingerprint: hashCanonical('forged') };
  assert.strictEqual(runCommandOracle(changedIntegrity, directCommandOptions(changedIntegrity, tmp)).reason, 'ORACLE_INTEGRITY_MISMATCH');

  let observedTimeout = null;
  const capped = runCommandOracle(spec, directCommandOptions(spec, tmp, {
    timeoutCapMs: 5,
    spawnImpl: (_command, _args, spawnOptions) => {
      observedTimeout = spawnOptions.timeout;
      return { status: 0, stdout: maliciousArgument, stderr: '', signal: null };
    }
  }));
  assert.strictEqual(capped.status, 'PASS');
  assert.strictEqual(observedTimeout, 5, 'remaining elapsed budget must cap Oracle timeout');

  const fakeNpmCli = path.join(tmp, 'npm-cli.js');
  write(fakeNpmCli, 'process.exit(0);\n');
  const windowsNpm = resolveExecutableIdentity('npm.cmd', {
    cwd: tmp,
    env: { ...process.env, npm_execpath: fakeNpmCli },
    platform: 'win32'
  });
  assert.strictEqual(windowsNpm.path, fs.realpathSync(process.execPath));
  assert.deepStrictEqual(windowsNpm.prefix_args, [fs.realpathSync(fakeNpmCli)]);
  const fakeCmd = path.join(tmp, 'unsafe.cmd');
  write(fakeCmd, '@echo off\r\n');
  assert.throws(() => resolveExecutableIdentity(fakeCmd, { cwd: tmp, env: process.env, platform: 'win32' }), /command shim/);
  const fakeExe = path.join(tmp, 'tool.exe');
  write(fakeExe, 'portable-test-executable-bytes\n');
  assert.strictEqual(resolveExecutableIdentity('tool.exe', {
    cwd: tmp,
    env: { PATH: tmp, PATHEXT: '.EXE;.CMD' },
    platform: 'win32'
  }).path, fs.realpathSync(fakeExe));
  if (process.platform === 'win32') {
    const npmEnvironment = buildOracleEnvironment(process.env, ['PATH', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP'], []);
    const npmSpec = {
      type: 'command',
      command: 'npm',
      args: ['--version'],
      expected_exit_code: 0,
      integrity_paths: ['oracle.cjs'],
      integrity_fingerprint: fingerprintOraclePaths(['oracle.cjs'], { cwd: tmp }).fingerprint
    };
    const npmResult = runCommandOracle(npmSpec, directCommandOptions(npmSpec, tmp, { env: npmEnvironment }));
    assert.strictEqual(npmResult.status, 'PASS', JSON.stringify(npmResult));
  }

  if (process.platform !== 'win32') {
    write(path.join(tmp, 'outside-target.cjs'), "process.exit(0);\n");
    fs.symlinkSync('outside-target.cjs', path.join(tmp, 'linked-oracle.cjs'));
    const symlinkSpec = {
      type: 'command', command: process.execPath, args: ['linked-oracle.cjs'], expected_exit_code: 0,
      integrity_paths: ['linked-oracle.cjs'], integrity_fingerprint: fingerprintOraclePaths(['linked-oracle.cjs'], { cwd: tmp }).fingerprint
    };
    assert.strictEqual(runCommandOracle(symlinkSpec, directCommandOptions(symlinkSpec, tmp)).reason, 'ORACLE_INTEGRITY_UNSAFE_TYPE');

    const outsideDir = makeTemp('outside-cwd');
    fs.symlinkSync(outsideDir, path.join(tmp, 'escaped-cwd'));
    const escapedCwd = { ...spec, cwd: 'escaped-cwd' };
    assert.strictEqual(runCommandOracle(escapedCwd, { cwd: tmp, allowSpecHashes: [commandSpecHash(escapedCwd)] }).reason, 'CWD_REALPATH_UNSAFE');
  }
}

function testFileOracleAndArtifacts() {
  const tmp = makeTemp('file-oracle');
  write(path.join(tmp, 'artifact.txt'), 'verified artifact\n');
  const fileSpec = { type: 'file', path: 'artifact.txt', exists: true, text_contains: ['verified'], max_bytes: 100 };
  const fileResult = runFileOracle(fileSpec, { cwd: tmp });
  assert.strictEqual(fileResult.status, 'PASS');
  assert.match(fileResult.artifacts[0].sha256, /^sha256:[a-f0-9]{64}$/);
  assert.strictEqual(runOracle({ type: 'api' }, { cwd: tmp }).status, 'BLOCKED');

  const contract = makeContract('artifact.txt');
  contract.acceptance[0].oracle = fileSpec;
  const source = fingerprintPaths(['artifact.txt'], { cwd: tmp }).fingerprint;
  const environment = fingerprintEnvironment('test');
  const ledger = path.join(tmp, 'artifact-ledger.jsonl');
  const payload = automaticPass(contract, 'AC-001', source, environment, fileResult);
  payload.artifacts = fileResult.artifacts;
  appendEvidence(ledger, payload, { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
  const options = { sourceFingerprint: source, environmentFingerprint: environment, findingsManifest: testFindingsManifest(contract), artifactRoot: tmp, attestationKeys: TEST_ATTESTATION_KEYS };
  let evaluation = evaluateDoD(contract, readLedger(ledger), options);
  assert.strictEqual(evaluation.criteria[0].status, 'PASS');
  write(path.join(tmp, 'artifact.txt'), 'tampered\n');
  evaluation = evaluateDoD(contract, readLedger(ledger), options);
  assert.strictEqual(evaluation.criteria[0].status, 'STALE');
  assert.strictEqual(evaluation.criteria[0].reason, 'ARTIFACT_HASH_MISMATCH');

  write(path.join(tmp, 'oversized.bin'), 'x');
  fs.truncateSync(path.join(tmp, 'oversized.bin'), 17 * 1024 * 1024);
  const oversized = runFileOracle({ type: 'file', path: 'oversized.bin', exists: true }, { cwd: tmp });
  assert.strictEqual(oversized.status, 'BLOCKED');
  assert.strictEqual(oversized.reason, 'FILE_HARD_SIZE_LIMIT');

  if (process.platform !== 'win32') {
    write(path.join(tmp, 'symlink-target.txt'), 'target\n');
    fs.unlinkSync(path.join(tmp, 'artifact.txt'));
    fs.symlinkSync('symlink-target.txt', path.join(tmp, 'artifact.txt'));
    const symlinkOracle = runFileOracle(fileSpec, { cwd: tmp });
    assert.strictEqual(symlinkOracle.status, 'BLOCKED');
    assert.strictEqual(symlinkOracle.reason, 'FILE_TYPE_NOT_REGULAR');
    evaluation = evaluateDoD(contract, readLedger(ledger), options);
    assert.strictEqual(evaluation.criteria[0].status, 'STALE');
    assert.strictEqual(evaluation.criteria[0].reason, 'ARTIFACT_TYPE_CHANGED');

    const outside = makeTemp('outside-file');
    write(path.join(outside, 'secret.txt'), 'outside workspace\n');
    fs.symlinkSync(outside, path.join(tmp, 'escaped-dir'));
    const escapedFile = runFileOracle({ type: 'file', path: 'escaped-dir/secret.txt', exists: true }, { cwd: tmp });
    assert.strictEqual(escapedFile.status, 'BLOCKED');
    assert.strictEqual(escapedFile.reason, 'FILE_REALPATH_UNSAFE');

    const escapedArtifactLedger = path.join(tmp, 'escaped-artifact-ledger.jsonl');
    const escapedPayload = automaticPass(contract, 'AC-001', source, environment, fileResult);
    escapedPayload.artifacts = [{ path: 'escaped-dir/secret.txt', sha256: hashCanonical('not-used') }];
    appendEvidence(escapedArtifactLedger, escapedPayload, { attestationKey: TEST_AUTOMATION_KEY, attestationKeyId: TEST_AUTOMATION_KEY_ID });
    const escapedArtifactEvaluation = evaluateDoD(contract, readLedger(escapedArtifactLedger), options);
    assert.strictEqual(escapedArtifactEvaluation.criteria[0].status, 'BLOCKED');
    assert.strictEqual(escapedArtifactEvaluation.criteria[0].reason, 'ARTIFACT_REALPATH_UNSAFE');
  }
}

function testDiffBudgetCoverage() {
  const tmp = makeTemp('diff');
  assert.strictEqual(spawnSync('git', ['init', '-q'], { cwd: tmp }).status, 0);
  assert.strictEqual(spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: tmp }).status, 0);
  assert.strictEqual(spawnSync('git', ['config', 'user.name', 'Completion Test'], { cwd: tmp }).status, 0);
  assert.strictEqual(spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: tmp }).status, 0);
  write(path.join(tmp, 'tracked.txt'), 'base\n');
  spawnSync('git', ['add', 'tracked.txt'], { cwd: tmp });
  assert.strictEqual(spawnSync('git', ['commit', '-qm', 'base'], { cwd: tmp }).status, 0);
  write(path.join(tmp, 'tracked.txt'), 'base\nstaged\n');
  spawnSync('git', ['add', 'tracked.txt'], { cwd: tmp });
  write(path.join(tmp, 'tracked.txt'), 'base\nstaged\nunstaged\n');
  write(path.join(tmp, 'untracked.txt'), 'one\ntwo\n');
  const measured = measureGitDiffLines(tmp);
  assert.strictEqual(measured.measurable, true);
  assert.ok(measured.lines >= 4, `expected staged + unstaged + untracked coverage, got ${measured.lines}`);
  write(path.join(tmp, 'binary.bin'), Buffer.from([0, 1, 2]));
  assert.strictEqual(measureGitDiffLines(tmp).measurable, false);

  fs.unlinkSync(path.join(tmp, 'binary.bin'));
  const baseCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
  spawnSync('git', ['add', '.'], { cwd: tmp });
  assert.strictEqual(spawnSync('git', ['commit', '-qm', 'changes-after-base'], { cwd: tmp }).status, 0);
  assert.strictEqual(measureGitDiffLines(tmp).lines, 0, 'HEAD-only measurement resets after a commit');
  assert.ok(measureGitDiffLines(tmp, baseCommit).lines >= 4, 'pinned base commit must retain committed diff budget usage');
}

function testCockpitEscaping() {
  const contract = makeContract();
  contract.feature.id = '<img src=x onerror=alert(1)>';
  contract.feature.objective = '<script>alert("x")</script>';
  const validated = validateCompletionContract(contract);
  const source = hashCanonical('source');
  const environment = hashCanonical('env');
  const evaluation = evaluateDoD(contract, [], { sourceFingerprint: source, environmentFingerprint: environment, findingsManifest: testFindingsManifest(contract) });
  evaluation.criteria = EVIDENCE_STATUSES.map((status, index) => ({
    id: `AC-${String(index + 1).padStart(3, '0')}`,
    title: index === 1 ? '<script>bad title</script>' : `${status} fixture`,
    priority: index < 2 ? 'P0' : 'P1',
    oracle_type: index === 3 ? 'manual' : 'command',
    status,
    evidence_observed_at: index === 3 ? null : '2026-07-11T00:00:00.000Z',
    reason: index === 1 ? '<img src=x onerror=bad()>' : `${status} reason`,
    waiver: status === 'WAIVED' ? { approved_by: '<owner>', scope: 'AC-006', expires_at: '2026-08-01T00:00:00.000Z' } : null
  }));
  evaluation.counts = Object.fromEntries(EVIDENCE_STATUSES.map((status) => [status, 1]));
  evaluation.blockers = [{ id: 'AC-002', status: 'FAIL', reason: '<unsafe blocker>' }, { id: 'AC-003', status: 'STALE', reason: 'source changed' }];
  evaluation.pending_human_gates = [{ id: 'AC-004', status: 'NOT_RUN', reason: 'manual sign-off' }];
  const html = generateDoneCockpit(contract, evaluation);
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;unsafe blocker&gt;'));
  for (const status of EVIDENCE_STATUSES) {
    assert.ok(html.includes(`status-${status.toLowerCase()}`), `missing ${status} fixture`);
    assert.ok(html.includes(`>${status}<`) || html.includes(` ${status}<`), `missing ${status} text`);
  }
  assert.ok(html.includes('scope: AC-006'));
  assert.ok(html.includes('&lt;owner&gt;'));
  assert.ok(html.includes('证据时间'));
  assert.ok(html.includes('决策与人工 Gate'));
  assert.ok(html.includes('@media(max-width:360px)'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(validated.contract_hash);
}

function testInitialization() {
  const tmp = makeTemp('init');
  const checker = path.resolve(__dirname, '../bin/check-completion-contract.cjs');
  const first = spawnSync(process.execPath, [checker, '--init', '--feature', 'demo', '--workspace', tmp], { encoding: 'utf8' });
  assert.strictEqual(first.status, 0, first.stderr);
  const contract = path.join(tmp, 'features/demo/completion/contract.yaml');
  const state = path.join(tmp, 'features/demo/completion/run-state.yaml');
  assert.ok(fs.existsSync(contract));
  assert.ok(fs.existsSync(path.join(tmp, 'features/demo/completion/evidence')));
  assert.ok(fs.existsSync(path.join(tmp, 'features/demo/completion/environment.yaml')));
  assert.throws(() => require('../bin/completion-core.cjs').validateEnvironmentManifest(loadData(path.join(tmp, 'features/demo/completion/environment.yaml'))), /placeholder/);
  assert.ok(fs.existsSync(path.join(tmp, 'features/demo/completion/findings.yaml')));
  assert.strictEqual(loadData(contract).feature.id, 'demo');
  assert.strictEqual(loadData(state).status, 'NOT_STARTED');
  write(path.join(tmp, 'package.json'), '{"scripts":{"test":"node test/smoke.cjs"}}\n');
  write(path.join(tmp, 'test/smoke.cjs'), 'process.exit(0);\n');
  const integrity = spawnSync(process.execPath, [checker, '--contract', contract, '--print-oracle-integrity', '--cwd', tmp, '--criterion', 'AC-001'], { encoding: 'utf8' });
  assert.strictEqual(integrity.status, 0, integrity.stderr);
  const integrityResult = JSON.parse(integrity.stdout);
  assert.strictEqual(integrityResult.valid, true);
  assert.strictEqual(integrityResult.criteria[0].integrity_fingerprint, fingerprintOraclePaths(['package.json', 'test'], { cwd: tmp }).fingerprint);
  if (process.platform !== 'win32') {
    const packageReal = path.join(tmp, 'package-real.json');
    fs.renameSync(path.join(tmp, 'package.json'), packageReal);
    fs.symlinkSync('package-real.json', path.join(tmp, 'package.json'));
    const unsafeIntegrity = spawnSync(process.execPath, [checker, '--contract', contract, '--print-oracle-integrity', '--cwd', tmp, '--criterion', 'AC-001'], { encoding: 'utf8' });
    assert.strictEqual(unsafeIntegrity.status, 1, unsafeIntegrity.stderr);
    const unsafeIntegrityResult = JSON.parse(unsafeIntegrity.stdout);
    assert.strictEqual(unsafeIntegrityResult.valid, false);
    assert.ok(unsafeIntegrityResult.criteria[0].unsafe_records.some((item) => item.type === 'symlink-file'));
    const linkedWorkspace = `${tmp}-link`;
    fs.symlinkSync(tmp, linkedWorkspace);
    const unsafeCwd = spawnSync(process.execPath, [checker, '--contract', contract, '--print-oracle-integrity', '--cwd', linkedWorkspace, '--criterion', 'AC-001'], { encoding: 'utf8' });
    assert.notStrictEqual(unsafeCwd.status, 0);
    assert.match(unsafeCwd.stderr, /非符号链接 directory/);
    fs.unlinkSync(linkedWorkspace);
    fs.unlinkSync(path.join(tmp, 'package.json'));
    fs.renameSync(packageReal, path.join(tmp, 'package.json'));
  }
  const second = spawnSync(process.execPath, [checker, '--init', '--feature', 'demo', '--workspace', tmp], { encoding: 'utf8' });
  assert.notStrictEqual(second.status, 0);
  assert.match(second.stderr, /拒绝覆盖已有文件/);
  const traversal = spawnSync(process.execPath, [checker, '--init', '--feature', '../escape', '--workspace', tmp], { encoding: 'utf8' });
  assert.notStrictEqual(traversal.status, 0);
}

async function testRunUntilDone() {
  const tmp = makeTemp('runner');
  write(path.join(tmp, 'source.txt'), 'source v1\n');
  const contract = makeContract('source.txt');
  const allowedSpec = configureOracle(contract, tmp, '0');
  const completion = path.join(tmp, 'features/demo/completion');
  const options = {
    contract,
    cwd: tmp,
    ledgerPath: path.join(completion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(completion, 'run-state.yaml'),
    decisionPacketPath: path.join(completion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [allowedSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  };
  await assert.rejects(() => runUntilDone({ ...options, environment: testEnvironmentManifest('test'), findingsManifest: testFindingsManifest(contract) }), /execution permit/);
  const forgedAuthorization = authorizeOptions(options);
  forgedAuthorization.executionPermit.budgets.max_iterations = 999;
  await assert.rejects(() => runUntilDone(forgedAuthorization), /signature 无效/);
  const unknownPermitAuthorization = authorizeOptions(options);
  const unsignedUnknownPermit = { ...unknownPermitAuthorization.executionPermit, unpublished_extension: true };
  delete unsignedUnknownPermit.signature;
  unknownPermitAuthorization.executionPermit = signExecutionPermit(unsignedUnknownPermit, TEST_EXECUTION_PRIVATE_KEY);
  await assert.rejects(() => runUntilDone(unknownPermitAuthorization), /未知字段/);
  const unknownSignatureAuthorization = authorizeOptions(options);
  unknownSignatureAuthorization.executionPermit.signature.comment = 'unsigned extension';
  await assert.rejects(() => runUntilDone(unknownSignatureAuthorization), /signature.*未知字段/);
  const missingNonceAuthorization = authorizeOptions(options);
  const unsignedMissingNoncePermit = { ...missingNonceAuthorization.executionPermit };
  delete unsignedMissingNoncePermit.signature;
  delete unsignedMissingNoncePermit.nonce;
  missingNonceAuthorization.executionPermit = signExecutionPermit(unsignedMissingNoncePermit, TEST_EXECUTION_PRIVATE_KEY);
  await assert.rejects(() => runUntilDone(missingNonceAuthorization), /nonce 无效/);
  const completed = await runAuthorized(options);
  assert.strictEqual(completed.outcome, 'READY_FOR_HUMAN_ACCEPTANCE', JSON.stringify({ outcome: completed.outcome, reason: completed.reason, blockers: completed.evaluation && completed.evaluation.blockers }, null, 2));
  assert.strictEqual(loadData(options.checkpointPath).status, 'READY_FOR_HUMAN_ACCEPTANCE');
  assert.strictEqual(readLedger(options.ledgerPath).length, 1);
  await assert.rejects(() => runAuthorized({ ...options, resume: false }), /禁止用 --no-resume/);

  const blockedDir = makeTemp('runner-blocked');
  write(path.join(blockedDir, 'source.txt'), 'source v1\n');
  const blockedContract = makeContract('source.txt');
  const blockedSpec = configureOracle(blockedContract, blockedDir, '7');
  blockedContract.autonomy.max_command_executions = 5;
  const blockedCompletion = path.join(blockedDir, 'features/demo/completion');
  const blocked = await runAuthorized({
    contract: blockedContract,
    cwd: blockedDir,
    ledgerPath: path.join(blockedCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(blockedCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(blockedCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [blockedSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  });
  assert.strictEqual(blocked.outcome, 'BLOCKED_WITH_DECISION_PACKET');
  assert.strictEqual(blocked.reason, 'REMEDIATION_COMMAND_REQUIRED');
  assert.ok(fs.existsSync(path.join(blockedCompletion, 'decision-packet.json')));

  const expiryDir = makeTemp('runner-permit-expiry');
  write(path.join(expiryDir, 'source.txt'), 'source v1\n');
  const expiryContract = makeContract('source.txt');
  const expirySpec = configureOracle(expiryContract, expiryDir, '0');
  const expiryCompletion = path.join(expiryDir, 'features/demo/completion');
  let expiryClock = Date.now();
  const expiryAuthorized = authorizeOptions({
    contract: expiryContract,
    cwd: expiryDir,
    ledgerPath: path.join(expiryCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(expiryCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(expiryCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [expirySpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID,
    permitIssuedAtMs: expiryClock,
    permitExpiresAtMs: expiryClock + 1000,
    now: () => expiryClock,
    spawnImpl: (...args) => {
      expiryClock += 1500;
      return spawnSync(...args);
    }
  });
  const expiredDuringRun = await runUntilDone(expiryAuthorized);
  assert.strictEqual(expiredDuringRun.outcome, 'BLOCKED_WITH_DECISION_PACKET');
  assert.strictEqual(expiredDuringRun.reason, 'EXECUTION_PERMIT_EXPIRED');
  assert.strictEqual(loadData(expiryAuthorized.checkpointPath).status, 'BLOCKED_WITH_DECISION_PACKET');

  const budgetDir = makeTemp('runner-budget');
  write(path.join(budgetDir, 'source.txt'), 'source v1\n');
  const budgetContract = makeContract('source.txt');
  const budgetSpec = configureOracle(budgetContract, budgetDir, '8');
  budgetContract.autonomy.max_command_executions = 1;
  const budgetCompletion = path.join(budgetDir, 'features/demo/completion');
  const budget = await runAuthorized({
    contract: budgetContract,
    cwd: budgetDir,
    ledgerPath: path.join(budgetCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(budgetCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(budgetCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [budgetSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  });
  assert.strictEqual(budget.outcome, 'BUDGET_EXHAUSTED');
  assert.strictEqual(budget.reason, 'MAX_COMMAND_EXECUTIONS');

  const mutatingDir = makeTemp('runner-mutating-oracle');
  write(path.join(mutatingDir, 'source.txt'), 'before\n');
  const mutatingContract = makeContract('source.txt');
  mutatingContract.scope.allowed_paths = ['source.txt'];
  const mutatingSpec = configureOracle(mutatingContract, mutatingDir, 'mutate');
  const mutatingCompletion = path.join(mutatingDir, 'features/demo/completion');
  const mutating = await runAuthorized({
    contract: mutatingContract,
    cwd: mutatingDir,
    ledgerPath: path.join(mutatingCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(mutatingCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(mutatingCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [mutatingSpec],
    listChangedPaths: () => ({ measurable: true, paths: fs.readFileSync(path.join(mutatingDir, 'source.txt'), 'utf8') === 'before\n' ? [] : ['source.txt'] }),
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  });
  assert.strictEqual(mutating.outcome, 'BLOCKED_WITH_DECISION_PACKET');
  assert.notStrictEqual(mutating.evaluation.automation_complete, true);
  assert.strictEqual(readLedger(path.join(mutatingCompletion, 'evidence/ledger.jsonl'))[0].status, 'STALE');
  assert.strictEqual(readLedger(path.join(mutatingCompletion, 'evidence/ledger.jsonl'))[0].reason, 'SOURCE_CHANGED_DURING_ORACLE');

  const scopeDir = makeTemp('runner-scope');
  write(path.join(scopeDir, 'source.txt'), 'source v1\n');
  const scopeContract = makeContract('source.txt');
  scopeContract.scope.allowed_paths = ['source.txt'];
  scopeContract.scope.forbidden_paths = ['forbidden.txt', '.git/**'];
  const scopeSpec = configureOracle(scopeContract, scopeDir, 'forbidden');
  initializeGitRepository(scopeDir);
  const scopeCompletion = path.join(scopeDir, 'features/demo/completion');
  const scopeResult = await runAuthorized({
    contract: scopeContract,
    cwd: scopeDir,
    ledgerPath: path.join(scopeCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(scopeCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(scopeCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [scopeSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  });
  assert.strictEqual(scopeResult.outcome, 'BLOCKED_WITH_DECISION_PACKET');
  assert.strictEqual(scopeResult.reason, 'SCOPE_VIOLATION');
  assert.deepStrictEqual(scopeResult.decision_packet.scope_violation.forbidden_paths, ['forbidden.txt']);
  assert.strictEqual(readLedger(path.join(scopeCompletion, 'evidence/ledger.jsonl'))[0].status, 'BLOCKED');

  const elapsedDir = makeTemp('runner-resume-elapsed');
  write(path.join(elapsedDir, 'source.txt'), 'source v1\n');
  const elapsedContract = makeContract('source.txt');
  const elapsedSpec = configureOracle(elapsedContract, elapsedDir, '7');
  const elapsedCompletion = path.join(elapsedDir, 'features/demo/completion');
  const elapsedOptions = {
    contract: elapsedContract,
    cwd: elapsedDir,
    ledgerPath: path.join(elapsedCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(elapsedCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(elapsedCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [elapsedSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  };
  const elapsedFirst = await runAuthorized(elapsedOptions);
  assert.strictEqual(elapsedFirst.outcome, 'BLOCKED_WITH_DECISION_PACKET');
  const elapsedCheckpoint = loadData(elapsedOptions.checkpointPath);
  elapsedCheckpoint.started_at = new Date(Date.now() - 10000).toISOString();
  write(elapsedOptions.checkpointPath, JSON.stringify(signCheckpointState(elapsedCheckpoint, TEST_AUTOMATION_KEY, TEST_AUTOMATION_KEY_ID), null, 2));
  const elapsedResume = await runAuthorized({ ...elapsedOptions, maxElapsedMs: 1 });
  assert.strictEqual(elapsedResume.outcome, 'BUDGET_EXHAUSTED');
  assert.strictEqual(elapsedResume.reason, 'MAX_ELAPSED_TIME');

  const costDir = makeTemp('runner-resume-cost');
  write(path.join(costDir, 'source.txt'), 'source v1\n');
  const costContract = makeContract('source.txt');
  const costSpec = configureOracle(costContract, costDir, '7');
  const costCompletion = path.join(costDir, 'features/demo/completion');
  const costOptions = {
    contract: costContract,
    cwd: costDir,
    ledgerPath: path.join(costCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(costCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(costCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [costSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID,
    maxCostUnits: 10
  };
  const costFirst = await runAuthorized(costOptions);
  assert.strictEqual(costFirst.outcome, 'BLOCKED_WITH_DECISION_PACKET');
  assert.strictEqual(loadData(costOptions.checkpointPath).cost_units, 1);

  const costResume = await runAuthorized({ ...costOptions, maxCostUnits: 1 });
  assert.strictEqual(costResume.outcome, 'BUDGET_EXHAUSTED');
  assert.strictEqual(costResume.reason, 'MAX_COST_UNITS');
  assert.strictEqual(loadData(costOptions.checkpointPath).cost_units, 1);
  const anchoredLedger = fs.readFileSync(costOptions.ledgerPath, 'utf8');
  write(costOptions.ledgerPath, '');
  await assert.rejects(() => runAuthorized(costOptions), /Ledger head\/count 不匹配/);
  write(costOptions.ledgerPath, anchoredLedger);
  const tamperedCheckpoint = loadData(costOptions.checkpointPath);
  tamperedCheckpoint.cost_units = 0;
  write(costOptions.checkpointPath, JSON.stringify(tamperedCheckpoint, null, 2));
  await assert.rejects(() => runAuthorized(costOptions), /checkpoint attestation 无效/);
  const strictCheckpoint = signCheckpointState(loadData(path.resolve(__dirname, '../workflow/core/templates/completion-run-state.template.yaml')), TEST_AUTOMATION_KEY, TEST_AUTOMATION_KEY_ID);
  assert.doesNotThrow(() => verifyCheckpointState(strictCheckpoint, TEST_AUTOMATION_KEY, TEST_AUTOMATION_KEY_ID));
  strictCheckpoint.checkpoint_attestation.comment = 'unsigned extension';
  assert.throws(() => verifyCheckpointState(strictCheckpoint, TEST_AUTOMATION_KEY, TEST_AUTOMATION_KEY_ID), /attestation.*未知字段/);

  const relaxedDir = makeTemp('runner-relaxed-budget');
  write(path.join(relaxedDir, 'source.txt'), 'source v1\n');
  const relaxedContract = makeContract('source.txt');
  const relaxedSpec = configureOracle(relaxedContract, relaxedDir, '0');
  const relaxedCompletion = path.join(relaxedDir, 'features/demo/completion');
  const relaxedOptions = {
    contract: relaxedContract,
    cwd: relaxedDir,
    ledgerPath: path.join(relaxedCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(relaxedCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(relaxedCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [relaxedSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  };
  await assert.rejects(() => runAuthorized({ ...relaxedOptions, maxIterations: relaxedContract.autonomy.max_iterations + 1 }), /只能收紧/);
  await assert.rejects(() => runAuthorized({ ...relaxedOptions, costPerExecution: relaxedContract.autonomy.cost_per_execution / 2 }), /只能收紧/);

  const envDir = makeTemp('runner-secret-env');
  write(path.join(envDir, 'source.txt'), 'source v1\n');
  const envContract = makeContract('source.txt');
  const envSpec = configureOracle(envContract, envDir, 'env-clean');
  const envCompletion = path.join(envDir, 'features/demo/completion');
  const envResult = await runAuthorized({
    contract: envContract,
    cwd: envDir,
    ledgerPath: path.join(envCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(envCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(envCompletion, 'decision-packet.json'),
    environment: 'test',
    env: { ...process.env, OWK_AUTOMATION_KEY: TEST_AUTOMATION_KEY },
    allowSpecHashes: [envSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  });
  assert.strictEqual(envResult.outcome, 'READY_FOR_HUMAN_ACCEPTANCE', 'attestation secrets must be removed from Oracle child environments');

  const mismatchDir = makeTemp('runner-resume-source');
  write(path.join(mismatchDir, 'source.txt'), 'source v1\n');
  const mismatchContract = makeContract('source.txt');
  const mismatchSpec = configureOracle(mismatchContract, mismatchDir, '7');
  const mismatchCompletion = path.join(mismatchDir, 'features/demo/completion');
  const mismatchOptions = {
    contract: mismatchContract,
    cwd: mismatchDir,
    ledgerPath: path.join(mismatchCompletion, 'evidence/ledger.jsonl'),
    checkpointPath: path.join(mismatchCompletion, 'run-state.yaml'),
    decisionPacketPath: path.join(mismatchCompletion, 'decision-packet.json'),
    environment: 'test',
    allowSpecHashes: [mismatchSpec],
    attestationKey: TEST_AUTOMATION_KEY,
    attestationKeyId: TEST_AUTOMATION_KEY_ID
  };
  await runAuthorized(mismatchOptions);
  write(path.join(mismatchDir, 'source.txt'), 'out-of-band change\n');
  await assert.rejects(() => runAuthorized(mismatchOptions), /checkpoint source fingerprint 不匹配/);
}

function testSchemasAreJson() {
  for (const file of fs.readdirSync(path.resolve(__dirname, '../workflow/core/schemas'))) {
    if (file.endsWith('.json')) assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../workflow/core/schemas', file), 'utf8')), file);
  }
}
