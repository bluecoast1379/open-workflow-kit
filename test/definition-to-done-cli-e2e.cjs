#!/usr/bin/env node
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const bins = {
  check: path.join(root, 'bin/check-completion-contract.cjs'),
  permit: path.join(root, 'bin/sign-execution-permit.cjs'),
  runner: path.join(root, 'bin/run-until-done.cjs'),
  evidence: path.join(root, 'bin/evidence-ledger.cjs'),
  anchor: path.join(root, 'bin/sign-ledger-anchor.cjs'),
  evaluate: path.join(root, 'bin/evaluate-dod.cjs'),
  cockpit: path.join(root, 'bin/generate-done-cockpit.cjs')
};
const automationKeyId = 'automation-local-v1';
const humanKeyId = 'human-owner-v1';
const automationKey = 'cli-e2e-automation-attestation-key-00000001';
const humanKey = 'cli-e2e-human-attestation-key-000000000001';
const automationEnv = 'OWK_CLI_E2E_AUTOMATION_KEY';
const humanEnv = 'OWK_CLI_E2E_HUMAN_KEY';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'owk-definition-cli-e2e-'));

try {
  main();
  console.log('Definition-to-Done CLI end-to-end test passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function main() {
  const workspace = path.join(tempRoot, 'workspace');
  const example = path.join(workspace, 'examples/definition-to-done');
  const runtime = path.join(example, '.runtime');
  const owner = path.join(tempRoot, 'owner-controlled');
  fs.mkdirSync(runtime, { recursive: true });
  fs.mkdirSync(owner, { recursive: true });

  copyFixture('README.md', example);
  copyFixture('oracle.cjs', example);
  copyFixture('invalid-vague-contract.yaml', example);
  copyFixture('invalid-waiver-entry.json', example);
  copyFixture('stale-evidence.json', example);

  const privateKey = path.join(owner, 'owner-private.pem');
  const publicKey = path.join(owner, 'owner-public.pem');
  const keys = crypto.generateKeyPairSync('ed25519');
  write(privateKey, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), 0o600);
  write(publicKey, keys.publicKey.export({ type: 'spki', format: 'pem' }), 0o644);

  const publicFingerprint = runCli(bins.permit, [
    '--public-key', publicKey,
    '--print-public-key-fingerprint'
  ]).stdout.trim();
  assert.match(publicFingerprint, /^sha256:[a-f0-9]{64}$/);

  const contract = path.join(example, 'valid-contract.yaml');
  let contractText = fs.readFileSync(path.join(root, 'examples/definition-to-done/valid-contract.yaml'), 'utf8');
  contractText = contractText
    .replace(/trusted_public_key_sha256: "sha256:[a-f0-9]{64}"/g, `trusted_public_key_sha256: "${publicFingerprint}"`)
    .replace(/^  max_diff_lines: 100000\r?\n/m, '');
  write(contract, contractText);

  const integrityDraft = parseJson(runCli(bins.check, [
    '--contract', contract,
    '--print-oracle-integrity',
    '--cwd', workspace,
    '--criterion', 'AC-001'
  ]).stdout, 'oracle integrity output');
  assert.strictEqual(integrityDraft.valid, true);
  assert.strictEqual(integrityDraft.criteria.length, 1);
  const integrityFingerprint = integrityDraft.criteria[0].integrity_fingerprint;
  assert.match(integrityFingerprint, /^sha256:[a-f0-9]{64}$/);
  contractText = contractText.replace(/integrity_fingerprint: "sha256:[a-f0-9]{64}"/, `integrity_fingerprint: "${integrityFingerprint}"`);
  write(contract, contractText);

  const environment = path.join(example, 'environment.json');
  write(environment, JSON.stringify({
    name: 'definition-cli-e2e',
    runtime_versions: { node: process.versions.node },
    dependency_versions: { fixture: 'definition-to-done-cli-v1' },
    service_versions: { reason: 'N/A: local deterministic test' },
    dataset_versions: { fixture: 'definition-to-done-golden-v1' },
    model_versions: { reason: 'N/A: no model inference' },
    tool_versions: { 'open-workflow-kit': '1.0.0' }
  }, null, 2) + '\n');
  const findings = path.join(example, 'findings.json');
  write(findings, JSON.stringify({
    schema_version: '1.0',
    snapshot_at: new Date().toISOString(),
    owner: 'release-owner',
    source: 'definition-to-done golden review registry',
    findings: []
  }, null, 2) + '\n');

  // 1. Frozen Contract is checked through the public CLI.
  const checked = parseJson(runCli(bins.check, [
    '--contract', contract,
    '--json'
  ]).stdout, 'contract check output');
  assert.strictEqual(checked.valid, true);
  assert.match(checked.contract_hash, /^sha256:[a-f0-9]{64}$/);

  // 2. The owner reviews the exact command/executable binding before signing.
  const required = parseJson(runCli(bins.runner, [
    '--contract', contract,
    '--cwd', workspace,
    '--environment-manifest', environment,
    '--findings', findings,
    '--print-required-specs'
  ]).stdout, 'required specs output');
  assert.strictEqual(required.contract_hash, checked.contract_hash);
  assert.strictEqual(required.required_command_specs.length, 1);
  assert.strictEqual(required.required_command_specs[0].criterion_id, 'AC-001');
  assert.match(required.required_command_specs[0].spec_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(required.required_command_specs[0].executable_fingerprint, /^sha256:[a-f0-9]{64}$/);

  // 3. Owner signs an execution permit outside the agent workspace.
  const permit = path.join(owner, 'execution-permit.json');
  const signedPermit = parseJson(runCli(bins.permit, [
    '--contract', contract,
    '--cwd', workspace,
    '--environment-manifest', environment,
    '--findings', findings,
    '--private-key', privateKey,
    '--public-key', publicKey,
    '--output', permit,
    '--valid-minutes', '5'
  ]).stdout, 'execution permit output');
  assert.strictEqual(signedPermit.generated, true);
  assert.strictEqual(signedPermit.contract_hash, checked.contract_hash);
  assert.ok(fs.existsSync(permit));

  // 4. Autonomous CLI executes the automatic oracle and intentionally exits 4 at READY.
  const ledger = path.join(runtime, 'ledger.jsonl');
  const checkpoint = path.join(runtime, 'run-state.yaml');
  const decisionPacket = path.join(runtime, 'decision-packet.json');
  const runner = runCli(bins.runner, [
    '--contract', contract,
    '--cwd', workspace,
    '--environment-manifest', environment,
    '--findings', findings,
    '--execution-permit', permit,
    '--execution-public-key', publicKey,
    '--attestation-key-id', automationKeyId,
    '--attestation-key-env', automationEnv,
    '--ledger', ledger,
    '--checkpoint', checkpoint,
    '--decision-packet', decisionPacket
  ], {
    expectedStatus: 4,
    env: { [automationEnv]: automationKey }
  });
  const ready = parseJson(runner.stdout, 'runner output');
  assert.strictEqual(ready.outcome, 'READY_FOR_HUMAN_ACCEPTANCE');
  assert.strictEqual(ready.evaluation.state, 'READY_FOR_HUMAN_ACCEPTANCE');
  assert.strictEqual(ready.evaluation.automation_complete, true);
  assert.strictEqual(ready.evaluation.accepted, false);
  assert.ok(fs.existsSync(checkpoint));
  assert.ok(!fs.existsSync(decisionPacket));

  // 5. Full human rubric PASS is appended only through evidence-ledger CLI.
  const rubric = [
    'invalid-vague-contract.yaml 标明只用于 linter 负例',
    'invalid-waiver-entry.json 缺少批准人且明确不可追加到真实 ledger',
    'stale-evidence.json 使用旧 fingerprint 且明确不得视为 PASS'
  ];
  assert.match(fs.readFileSync(path.join(example, 'invalid-vague-contract.yaml'), 'utf8'), /负例|invalid/i);
  assert.match(fs.readFileSync(path.join(example, 'invalid-waiver-entry.json'), 'utf8'), /negative fixture|cannot approve/i);
  assert.match(fs.readFileSync(path.join(example, 'stale-evidence.json'), 'utf8'), /STALE|旧|stale/i);
  const humanEntry = path.join(owner, 'human-pass.json');
  write(humanEntry, JSON.stringify({
    criterion_id: 'AC-002',
    status: 'PASS',
    executor: { type: 'authorized-human', signed_by: 'release-owner' },
    result: {
      rubric_hash: hashCanonical(rubric),
      rubric_results: rubric.map((_, index) => ({ index, passed: true }))
    }
  }, null, 2) + '\n');
  const appended = parseJson(runCli(bins.evidence, [
    'append',
    '--ledger', ledger,
    '--entry', humanEntry,
    '--contract', contract,
    '--environment-manifest', environment,
    '--cwd', workspace,
    '--attestation-key-id', humanKeyId,
    '--attestation-key-env', humanEnv
  ], {
    env: { [humanEnv]: humanKey }
  }).stdout, 'human evidence append output');
  assert.strictEqual(appended.sequence, 2);
  assert.strictEqual(appended.criterion_id, 'AC-002');
  assert.strictEqual(appended.status, 'PASS');
  assert.strictEqual(appended.attestation.key_id, humanKeyId);

  const verified = parseJson(runCli(bins.evidence, [
    'verify',
    '--ledger', ledger,
    '--attestation-key', `${automationKeyId}=${automationEnv}`,
    '--attestation-key', `${humanKeyId}=${humanEnv}`
  ], {
    env: { [automationEnv]: automationKey, [humanEnv]: humanKey }
  }).stdout, 'ledger verify output');
  assert.strictEqual(verified.valid, true);
  assert.strictEqual(verified.count, 2);

  // 6. Owner independently anchors the completed ledger.
  const anchor = path.join(owner, 'ledger-anchor.json');
  const signedAnchor = parseJson(runCli(bins.anchor, [
    '--contract', contract,
    '--ledger', ledger,
    '--environment-manifest', environment,
    '--findings', findings,
    '--private-key', privateKey,
    '--public-key', publicKey,
    '--output', anchor,
    '--cwd', workspace
  ]).stdout, 'ledger anchor output');
  assert.strictEqual(signedAnchor.generated, true);
  assert.strictEqual(signedAnchor.ledger_entry_count, 2);
  assert.ok(fs.existsSync(anchor));

  // 7. Public evaluator can now reach ACCEPTED with both HMAC keys and the Owner anchor.
  const evaluation = parseJson(runCli(bins.evaluate, [
    '--contract', contract,
    '--ledger', ledger,
    '--environment-manifest', environment,
    '--findings', findings,
    '--cwd', workspace,
    '--attestation-key', `${automationKeyId}=${automationEnv}`,
    '--attestation-key', `${humanKeyId}=${humanEnv}`,
    '--ledger-anchor', anchor,
    '--ledger-anchor-public-key', publicKey
  ], {
    env: { [automationEnv]: automationKey, [humanEnv]: humanKey }
  }).stdout, 'DoD evaluation output');
  assert.strictEqual(evaluation.state, 'ACCEPTED');
  assert.strictEqual(evaluation.automation_complete, true);
  assert.strictEqual(evaluation.accepted, true);

  // 8. Cockpit generation consumes the same verified inputs rather than a cached verdict.
  const cockpit = path.join(runtime, 'done-cockpit.html');
  const generated = parseJson(runCli(bins.cockpit, [
    '--contract', contract,
    '--ledger', ledger,
    '--environment-manifest', environment,
    '--findings', findings,
    '--cwd', workspace,
    '--attestation-key', `${automationKeyId}=${automationEnv}`,
    '--attestation-key', `${humanKeyId}=${humanEnv}`,
    '--ledger-anchor', anchor,
    '--ledger-anchor-public-key', publicKey,
    '--output', cockpit
  ], {
    env: { [automationEnv]: automationKey, [humanEnv]: humanKey }
  }).stdout, 'cockpit output');
  assert.strictEqual(generated.generated, true);
  assert.strictEqual(generated.state, 'ACCEPTED');
  const cockpitHtml = fs.readFileSync(cockpit, 'utf8');
  assert.ok(cockpitHtml.includes('ACCEPTED'));
  assert.ok(cockpitHtml.includes(checked.contract_hash));
}

function copyFixture(name, destination) {
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(path.join(root, 'examples/definition-to-done', name), path.join(destination, name));
}

function write(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode === undefined ? undefined : { mode });
  if (mode !== undefined && process.platform !== 'win32') fs.chmodSync(file, mode);
}

function runCli(script, args, options = {}) {
  const expectedStatus = options.expectedStatus === undefined ? 0 : options.expectedStatus;
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    timeout: 30000,
    windowsHide: true
  });
  if (result.error) throw result.error;
  assert.strictEqual(
    result.status,
    expectedStatus,
    `${path.basename(script)} ${args.join(' ')} exited ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );
  return result;
}

function parseJson(text, label) {
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${label} is not JSON: ${error.message}\n${text}`); }
}

function hashCanonical(value) {
  const canonical = (item) => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])]));
    return item;
  };
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}
