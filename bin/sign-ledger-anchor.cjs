#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  loadData,
  validateCompletionContract,
  validateEnvironmentManifest,
  validateFindingsManifest,
  resolveContractFingerprints,
  readLedger,
  hashCanonical,
  publicKeyFingerprint,
  signLedgerAnchor,
  atomicWrite,
  parseCliArgs
} = require('./completion-core.cjs');

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, ['help', 'contract', 'ledger', 'environment-manifest', 'findings', 'private-key', 'public-key', 'output', 'cwd', 'anchor-id'], 0);
  if (args.help) return printHelp();
  for (const name of ['contract', 'ledger', 'environment-manifest', 'findings', 'private-key', 'public-key', 'output']) if (!args[name]) throw new Error(`必须提供 --${name}`);
  const cwd = path.resolve(args.cwd || process.cwd());
  const contract = loadData(path.resolve(args.contract));
  validateCompletionContract(contract);
  if (contract.feature.status !== 'frozen' || contract.governance.status !== 'frozen') throw new Error('只为 fully frozen Contract 签发 ledger anchor');
  const environment = validateEnvironmentManifest(loadData(path.resolve(args['environment-manifest'])));
  const findingsManifest = validateFindingsManifest(loadData(path.resolve(args.findings)), contract.governance.findings_registry);
  const fingerprints = resolveContractFingerprints(contract, { cwd, environment });
  const entries = readLedger(path.resolve(args.ledger));
  const privateKeyPath = path.resolve(args['private-key']);
  const outputPath = path.resolve(args.output);
  assertOutsideWorkspace(cwd, privateKeyPath, 'private key');
  assertOutsideWorkspace(cwd, outputPath, 'anchor output');
  const keyStat = fs.lstatSync(privateKeyPath);
  if (!keyStat.isFile() || keyStat.isSymbolicLink()) throw new Error('private key 必须是 regular file，禁止 symlink');
  if (process.platform !== 'win32' && (keyStat.mode & 0o077) !== 0) throw new Error('private key 权限必须禁止 group/other 访问（建议 0600）');
  const publicKey = fs.readFileSync(path.resolve(args['public-key']), 'utf8');
  const policy = contract.governance.ledger_anchor;
  if (publicKeyFingerprint(publicKey) !== policy.trusted_public_key_sha256) throw new Error('ledger anchor public key fingerprint 与 Contract 不匹配');
  const anchor = signLedgerAnchor({
    schema_version: '1.0',
    anchor_id: args['anchor-id'] || crypto.randomUUID(),
    key_id: policy.key_id,
    observed_at: new Date().toISOString(),
    contract_hash: fingerprints.contract_hash,
    source_fingerprint: fingerprints.source_fingerprint,
    environment_fingerprint: fingerprints.environment_fingerprint,
    findings_fingerprint: hashCanonical(findingsManifest),
    ledger_head_hash: entries.length ? entries[entries.length - 1].entry_hash : 'GENESIS',
    ledger_entry_count: entries.length,
    nonce: crypto.randomBytes(16).toString('hex')
  }, fs.readFileSync(privateKeyPath, 'utf8'));
  atomicWrite(outputPath, JSON.stringify(anchor, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ generated: true, output: outputPath, anchor_id: anchor.anchor_id, ledger_head_hash: anchor.ledger_head_hash, ledger_entry_count: anchor.ledger_entry_count }, null, 2) + '\n');
  return anchor;
}

function assertOutsideWorkspace(workspace, target, label) {
  const relative = path.relative(path.resolve(workspace), path.resolve(target));
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error(`${label} 必须位于 Agent 工作区之外`);
}

function printHelp() {
  console.log('用法: node bin/sign-ledger-anchor.cjs --contract <contract.yaml> --ledger <ledger.jsonl> --environment-manifest <env.yaml> --findings <findings.yaml> --private-key <owner-private.pem> --public-key <owner-public.pem> --output <anchor.json> [--cwd .]');
}

module.exports = { main };
