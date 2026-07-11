#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  loadData,
  atomicWrite,
  readLedger,
  evaluateDoD,
  resolveContractFingerprints,
  validateEnvironmentManifest,
  validateFindingsManifest,
  parseCliArgs
} = require('./completion-core.cjs');

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, ['help', 'contract', 'ledger', 'cwd', 'environment-manifest', 'source-fingerprint', 'environment-fingerprint', 'findings', 'attestation-key', 'ledger-anchor', 'ledger-anchor-public-key', 'output'], 0);
  if (args.help) return printHelp();
  if (!args.contract || !args.ledger) throw new Error('必须提供 --contract 与 --ledger');
  if (!args['environment-manifest']) throw new Error('必须提供 --environment-manifest');
  const contract = loadData(path.resolve(args.contract));
  const cwd = path.resolve(args.cwd || process.cwd());
  const environment = validateEnvironmentManifest(loadData(path.resolve(args['environment-manifest'])));
  if (!args.findings) throw new Error('必须提供 --findings');
  const findingsManifest = validateFindingsManifest(loadData(path.resolve(args.findings)), contract.governance.findings_registry);
  const fingerprints = resolveContractFingerprints(contract, {
    cwd,
    sourceFingerprint: args['source-fingerprint'],
    environmentFingerprint: args['environment-fingerprint'],
    environment
  });
  const attestationKeys = loadAttestationKeys(args['attestation-key']);
  const ledgerAnchor = args['ledger-anchor'] ? loadData(path.resolve(args['ledger-anchor'])) : null;
  const ledgerAnchorPublicKey = args['ledger-anchor-public-key'] ? fs.readFileSync(path.resolve(args['ledger-anchor-public-key']), 'utf8') : null;
  const result = evaluateDoD(contract, readLedger(path.resolve(args.ledger)), {
    sourceFingerprint: fingerprints.source_fingerprint,
    environmentFingerprint: fingerprints.environment_fingerprint,
    artifactRoot: cwd,
    attestationKeys,
    findingsManifest,
    ledgerAnchor,
    ledgerAnchorPublicKey,
  });
  const output = JSON.stringify(result, null, 2) + '\n';
  if (args.output) atomicWrite(path.resolve(args.output), output);
  else process.stdout.write(output);
  if (!result.automation_complete) process.exitCode = 2;
  else if (!result.accepted) process.exitCode = 3;
  return result;
}

function printHelp() {
  console.log('用法: node bin/evaluate-dod.cjs --contract <contract.yaml> --ledger <ledger.jsonl> --environment-manifest <env.yaml> --findings <findings.yaml> --attestation-key <key-id=ENV_NAME> [--attestation-key <key-id=ENV_NAME> ...] --ledger-anchor <owner-signed-anchor.json> --ledger-anchor-public-key <owner-public.pem> [--cwd .] [--output result.json]\n退出码: 0=ACCEPTED, 2=automation 未完成, 3=等待人工验收或 Owner-signed ledger anchor。');
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

module.exports = { main, loadAttestationKeys };
