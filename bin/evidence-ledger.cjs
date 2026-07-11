#!/usr/bin/env node
const path = require('path');
const {
  loadData,
  hashCanonical,
  resolveContractFingerprints,
  readLedger,
  verifyLedgerEntries,
  verifyEvidenceAttestation,
  appendEvidence,
  recoverEvidenceLedgerLock,
  validateEnvironmentManifest,
  parseCliArgs
} = require('./completion-core.cjs');

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, ['help', 'ledger', 'contract', 'entry', 'criterion', 'status', 'environment-manifest', 'cwd', 'source-fingerprint', 'environment-fingerprint', 'contract-hash', 'approved-by', 'signed-by', 'scope', 'reason', 'compensation', 'expires', 'attestation-key', 'attestation-key-id', 'attestation-key-env', 'lock-token', 'min-age-ms'], 1);
  if (args.help) return printHelp();
  const action = args._[0] || 'verify';
  const ledger = path.resolve(args.ledger || 'completion/evidence/ledger.jsonl');
  if (action === 'recover-lock') {
    const result = recoverEvidenceLedgerLock(ledger, {
      lockToken: args['lock-token'],
      minAgeMs: args['min-age-ms'] === undefined ? undefined : Number(args['min-age-ms'])
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result;
  }
  if (action === 'verify') {
    const entries = readLedger(ledger, { verify: false });
    const chain = verifyLedgerEntries(entries);
    const attestationKeys = loadAttestationKeys(args['attestation-key']);
    const keysProvided = Object.keys(attestationKeys).length > 0;
    const attestations = keysProvided ? entries.map((entry) => ({ sequence: entry.sequence, key_id: entry.attestation && entry.attestation.key_id || null, ...verifyEvidenceAttestation(entry, attestationKeys) })) : [];
    const attestationValid = keysProvided ? attestations.every((item) => item.valid) : null;
    const result = {
      ledger,
      chain_valid: chain.valid,
      attestation_valid: attestationValid,
      valid: keysProvided ? chain.valid && attestationValid : null,
      count: chain.count,
      head_hash: chain.head_hash,
      ...(keysProvided ? { attestations } : { note: '仅验证 hash chain；提供 --attestation-key key-id=ENV_NAME 才会验证 HMAC' })
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (keysProvided && !result.valid) process.exitCode = 1;
    return result;
  }
  if (action !== 'append') throw new Error(`未知 action: ${action}`);
  if (!args.contract) throw new Error('append 必须提供 --contract，不允许脱离完成契约写证据');
  if (!args['environment-manifest']) throw new Error('append 必须提供 --environment-manifest');
  let payload = args.entry ? loadData(path.resolve(args.entry)) : {};
  payload = { ...payload };
  if (args.criterion) payload.criterion_id = args.criterion;
  if (args.status) payload.status = String(args.status).toUpperCase();
  const contract = loadData(path.resolve(args.contract));
  const environment = validateEnvironmentManifest(loadData(path.resolve(args['environment-manifest'])));
  const fingerprints = resolveContractFingerprints(contract, {
    cwd: path.resolve(args.cwd || process.cwd()),
    sourceFingerprint: args['source-fingerprint'],
    environmentFingerprint: args['environment-fingerprint'],
    environment
  });
  payload = { ...fingerprints, ...payload };
  if (args['contract-hash']) payload.contract_hash = args['contract-hash'];
  if (args['source-fingerprint']) payload.source_fingerprint = args['source-fingerprint'];
  if (args['environment-fingerprint']) payload.environment_fingerprint = args['environment-fingerprint'];
  if (payload.status === 'WAIVED' && !payload.waiver) {
    payload.waiver = { approved_by: args['approved-by'], scope: args.scope, reason: args.reason, compensation: args.compensation, expires_at: args.expires };
  }
  const criterion = (contract.acceptance || []).find((item) => item && item.id === payload.criterion_id);
  if (!criterion) throw new Error(`contract 不包含 criterion ${payload.criterion_id || '<missing>'}`);
  if (!payload.evidence_manifest && ['PASS', 'WAIVED'].includes(payload.status)) payload.evidence_manifest = [...criterion.evidence_required];
  if (payload.status === 'WAIVED' && !payload.executor) payload.executor = { type: 'authorized-human', signed_by: args['signed-by'] || args['approved-by'] };
  if (!payload.executor) payload.executor = { type: 'manual-record', record_hash: hashCanonical({ criterion_id: payload.criterion_id, status: payload.status }) };
  if (payload.status === 'PASS' && !args.entry) throw new Error('PASS 必须通过 --entry 提供完整 oracle/rubric provenance，不允许简写造绿');
  const success = ['PASS', 'WAIVED'].includes(payload.status);
  const key = args['attestation-key-env'] ? readSecretEnv(args['attestation-key-env']) : undefined;
  const keyId = args['attestation-key-id'];
  if (success && (key === undefined || !keyId)) throw new Error(`${payload.status} 必须提供 --attestation-key-id 与 --attestation-key-env`);
  const entry = appendEvidence(ledger, payload, key === undefined ? {} : { attestationKey: key, attestationKeyId: keyId });
  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
  return entry;
}

function printHelp() {
  console.log(`用法:
  node bin/evidence-ledger.cjs verify --ledger features/<feature>/completion/evidence/ledger.jsonl [--attestation-key key-id=ENV_NAME ...]
  node bin/evidence-ledger.cjs append --ledger <file> --entry <payload.json> --contract <contract.yaml> --environment-manifest <environment.yaml> --cwd <repo> --attestation-key-id <id> --attestation-key-env <ENV_NAME>
  node bin/evidence-ledger.cjs append --ledger <file> --contract <contract.yaml> --environment-manifest <environment.yaml> --cwd <repo> --criterion AC-001 --status WAIVED --approved-by <name> --signed-by <name> --scope AC-001 --reason <reason> --compensation <control> --expires <ISO time> --attestation-key-id <id> --attestation-key-env <ENV_NAME>
  node bin/evidence-ledger.cjs recover-lock --ledger <file> --lock-token <32-hex-token> [--min-age-ms 60000]

不提供 verify key 时只验证 hash chain，并返回 attestation_valid=null；只有提供所有所需 key 后 valid=true 才表示 chain + HMAC 均有效。PASS/WAIVED 只接受外部密钥签名的完整 provenance；密钥值只从环境变量读取，不写入 contract 或命令行。recover-lock 仅接受 append 冲突输出中的精确 token，且只隔离同主机、至少 60 秒、writer pid 已死亡的 lock；隔离文件会保留供审计。`);
}

function loadAttestationKeys(values) {
  const output = Object.create(null);
  for (const value of [].concat(values || [])) {
    const match = String(value).match(/^([A-Za-z0-9][A-Za-z0-9._-]{0,127})=([A-Za-z_][A-Za-z0-9_]*)$/);
    if (!match) throw new Error('--attestation-key 格式必须为 key-id=ENV_NAME');
    if (!Object.hasOwn(process.env, match[2]) || !process.env[match[2]]) throw new Error(`环境变量 ${match[2]} 未设置`);
    output[match[1]] = process.env[match[2]];
    delete process.env[match[2]];
  }
  return output;
}

function readSecretEnv(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || ''))) throw new Error('attestation key env 名称非法');
  if (!Object.hasOwn(process.env, name) || !process.env[name]) throw new Error(`环境变量 ${name} 未设置`);
  const value = process.env[name];
  delete process.env[name];
  return value;
}

module.exports = { main };
