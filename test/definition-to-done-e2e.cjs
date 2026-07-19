#!/usr/bin/env node
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadData,
  hashCanonical,
  fingerprintPaths,
  fingerprintContractEnvironment,
  collectContractIssues,
  validateCompletionContract,
  validateEvidencePayload,
  appendEvidence,
  readLedger,
  evaluateDoD,
  commandSpecHash,
  publicKeyFingerprint,
  signExecutionPermit,
  signLedgerAnchor,
  resolveGitHead,
  resolveExecutableIdentity,
  buildOracleEnvironment,
  runUntilDone,
  generateDoneCockpit
} = require('../bin/completion-core.cjs');

const root = path.resolve(__dirname, '..');
const exampleDir = path.join(root, 'examples/definition-to-done');
const automationKeyId = 'automation-local-v1';
const humanKeyId = 'human-owner-v1';
const automationKey = 'definition-e2e-automation-key-32-bytes-0001';
const humanKey = 'definition-e2e-human-key-32-bytes-00000001';

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

async function main() {
  const attributesFile = path.join(root, '.gitattributes');
  if (fs.existsSync(path.join(root, '.git'))) {
    assert.ok(fs.existsSync(attributesFile), 'source checkouts must retain .gitattributes');
    assert.match(
      fs.readFileSync(attributesFile, 'utf8'),
      /^\* text=auto eol=lf$/m,
      'hash-bound Oracle fixtures require LF checkout normalization on Windows'
    );
  }
  assert.ok(
    !fs.readFileSync(path.join(exampleDir, 'oracle.cjs'), 'utf8').includes('\r\n'),
    'the checked-out Oracle fixture must retain LF bytes on every CI platform'
  );

  const valid = loadData(path.join(exampleDir, 'valid-contract.yaml'));
  const executionKeys = crypto.generateKeyPairSync('ed25519');
  const executionPublicKey = executionKeys.publicKey.export({ type: 'spki', format: 'pem' });
  const executionPrivateKey = executionKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  valid.governance.execution_authorization.trusted_public_key_sha256 = publicKeyFingerprint(executionPublicKey);
  valid.governance.ledger_anchor.trusted_public_key_sha256 = publicKeyFingerprint(executionPublicKey);
  const validated = validateCompletionContract(valid);
  assert.match(validated.contract_hash, /^sha256:[a-f0-9]{64}$/);

  const invalid = loadData(path.join(exampleDir, 'invalid-vague-contract.yaml'));
  const invalidErrors = collectContractIssues(invalid).filter((item) => item.severity === 'error');
  assert.deepStrictEqual(invalidErrors.map((item) => item.code), ['AMBIGUOUS_WITHOUT_ORACLE']);

  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'owk-definition-e2e-'));
  const ledger = path.join(runtime, 'ledger.jsonl');
  const checkpoint = path.join(runtime, 'run-state.yaml');
  const packet = path.join(runtime, 'decision-packet.json');
  const specHash = commandSpecHash(valid.acceptance[0].oracle);
  const environmentManifest = {
    name: 'example-test',
    runtime_versions: { node: process.versions.node },
    dependency_versions: { fixture: 'definition-to-done-v1' },
    service_versions: { reason: 'N/A: local example' },
    dataset_versions: { example: 'v1' },
    model_versions: { reason: 'N/A: no model' },
    tool_versions: { 'open-workflow-kit': '1.0.0' }
  };
  const findingsManifest = {
    schema_version: '1.0',
    snapshot_at: new Date().toISOString(),
    owner: valid.governance.findings_registry.owner,
    source: valid.governance.findings_registry.source,
    findings: []
  };
  const oracleEnvironment = buildOracleEnvironment(process.env, valid.autonomy.oracle_env_allowlist, [automationKey]);
  const issuedAt = new Date();
  const executionPermit = signExecutionPermit({
    schema_version: '1.0',
    permit_id: crypto.randomUUID(),
    key_id: valid.governance.execution_authorization.key_id,
    issued_at: issuedAt.toISOString(),
    expires_at: new Date(issuedAt.getTime() + 5 * 60000).toISOString(),
    contract_hash: validated.contract_hash,
    environment_fingerprint: fingerprintContractEnvironment(valid, environmentManifest),
    findings_fingerprint: hashCanonical(findingsManifest),
    scope_hash: hashCanonical(valid.scope),
    base_commit: resolveGitHead(root),
    command_spec_hashes: [specHash],
    executable_fingerprints: {
      [specHash]: resolveExecutableIdentity(valid.acceptance[0].oracle.command, { cwd: path.resolve(root, valid.acceptance[0].oracle.cwd || '.'), env: oracleEnvironment }).fingerprint
    },
    budgets: {
      max_iterations: valid.autonomy.max_iterations,
      max_elapsed_ms: valid.autonomy.max_elapsed_minutes * 60000,
      max_command_executions: valid.autonomy.max_command_executions,
      max_cost_units: valid.autonomy.max_cost_units,
      cost_per_execution: valid.autonomy.cost_per_execution,
      max_diff_lines: valid.autonomy.max_diff_lines
    },
    nonce: crypto.randomBytes(16).toString('hex')
  }, executionPrivateKey);
  const run = await runUntilDone({
    contract: valid,
    cwd: root,
    ledgerPath: ledger,
    checkpointPath: checkpoint,
    decisionPacketPath: packet,
    environment: environmentManifest,
    findingsManifest,
    executionPermit,
    executionPublicKey,
    attestationKey: automationKey,
    attestationKeyId: automationKeyId,
    listChangedPaths: () => ({ measurable: true, paths: [] }),
    measureDiff: () => ({ measurable: true, lines: 0 })
  });
  assert.strictEqual(run.outcome, 'READY_FOR_HUMAN_ACCEPTANCE', JSON.stringify({
    outcome: run.outcome,
    reason: run.reason,
    blockers: run.evaluation && run.evaluation.blockers
  }, null, 2));
  assert.strictEqual(run.evaluation.accepted, false);
  assert.strictEqual(readLedger(ledger)[0].attestation.key_id, automationKeyId);

  const sourceFingerprint = fingerprintPaths(valid.scope.source_paths, { cwd: root, excludes: valid.scope.fingerprint_excludes || [] }).fingerprint;
  const environmentFingerprint = fingerprintContractEnvironment(valid, environmentManifest);
  const keys = { [automationKeyId]: automationKey, [humanKeyId]: humanKey };
  let evaluation = evaluateDoD(valid, readLedger(ledger), {
    sourceFingerprint,
    environmentFingerprint,
    artifactRoot: root,
    attestationKeys: keys,
    findingsManifest
  });
  assert.strictEqual(evaluation.state, 'READY_FOR_HUMAN_ACCEPTANCE');

  const humanCriterion = valid.acceptance.find((item) => item.id === 'AC-002');
  appendEvidence(ledger, {
    criterion_id: humanCriterion.id,
    status: 'PASS',
    contract_hash: validated.contract_hash,
    source_fingerprint: sourceFingerprint,
    environment_fingerprint: environmentFingerprint,
    executor: { type: 'authorized-human', signed_by: 'release-owner' },
    evidence_manifest: [...humanCriterion.evidence_required],
    result: {
      rubric_hash: hashCanonical(humanCriterion.oracle.rubric),
      rubric_results: humanCriterion.oracle.rubric.map((_, index) => ({ index, passed: true }))
    }
  }, { attestationKey: humanKey, attestationKeyId: humanKeyId });
  const anchoredEntries = readLedger(ledger);
  const ledgerAnchor = signLedgerAnchor({
    schema_version: '1.0',
    anchor_id: crypto.randomUUID(),
    key_id: valid.governance.ledger_anchor.key_id,
    observed_at: new Date().toISOString(),
    contract_hash: validated.contract_hash,
    source_fingerprint: sourceFingerprint,
    environment_fingerprint: environmentFingerprint,
    findings_fingerprint: hashCanonical(findingsManifest),
    ledger_head_hash: anchoredEntries[anchoredEntries.length - 1].entry_hash,
    ledger_entry_count: anchoredEntries.length,
    nonce: crypto.randomBytes(16).toString('hex')
  }, executionPrivateKey);
  evaluation = evaluateDoD(valid, readLedger(ledger), {
    sourceFingerprint,
    environmentFingerprint,
    artifactRoot: root,
    attestationKeys: keys,
    findingsManifest,
    ledgerAnchor,
    ledgerAnchorPublicKey: executionPublicKey
  });
  assert.strictEqual(evaluation.state, 'ACCEPTED');
  const cockpit = generateDoneCockpit(valid, evaluation);
  assert.ok(cockpit.includes('ACCEPTED'));
  assert.ok(cockpit.includes(validated.contract_hash));

  const invalidWaiver = loadData(path.join(exampleDir, 'invalid-waiver-entry.json'));
  assert.throws(() => validateEvidencePayload({
    criterion_id: 'AC-001',
    status: 'WAIVED',
    contract_hash: validated.contract_hash,
    source_fingerprint: sourceFingerprint,
    environment_fingerprint: environmentFingerprint,
    executor: { type: 'authorized-human', signed_by: 'release-owner' },
    evidence_manifest: [...valid.acceptance[0].evidence_required],
    waiver: invalidWaiver.waiver
  }), /approved_by/);

  const staleFixture = loadData(path.join(exampleDir, 'stale-evidence.json'));
  const staleLedger = path.join(runtime, 'stale-ledger.jsonl');
  appendEvidence(staleLedger, {
    ...staleFixture,
    executor: { type: 'command', oracle_hash: hashCanonical(valid.acceptance[0].oracle), principal: 'example-runner' },
    evidence_manifest: [...valid.acceptance[0].evidence_required],
    result: { status: 'PASS', assertions: [{ type: 'fixture', passed: true }] }
  }, { attestationKey: automationKey, attestationKeyId: automationKeyId });
  const staleEvaluation = evaluateDoD(valid, readLedger(staleLedger), {
    sourceFingerprint,
    environmentFingerprint,
    artifactRoot: root,
    attestationKeys: keys,
    findingsManifest
  });
  assert.strictEqual(staleEvaluation.criteria[0].status, 'STALE');
  assert.strictEqual(staleEvaluation.criteria[0].reason, 'CONTRACT_CHANGED');

  console.log('Definition-to-Done end-to-end test passed.');
}
