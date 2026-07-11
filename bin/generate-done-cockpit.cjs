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
  generateDoneCockpit,
  parseCliArgs
} = require('./completion-core.cjs');
const { loadAttestationKeys } = require('./evaluate-dod.cjs');

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, ['help', 'contract', 'ledger', 'cwd', 'environment-manifest', 'findings', 'source-fingerprint', 'environment-fingerprint', 'attestation-key', 'ledger-anchor', 'ledger-anchor-public-key', 'output'], 0);
  if (args.help) return printHelp();
  if (!args.contract || !args.ledger) throw new Error('必须提供 --contract 与 --ledger');
  if (!args['environment-manifest']) throw new Error('必须提供 --environment-manifest');
  const contractFile = path.resolve(args.contract);
  const contract = loadData(contractFile);
  const cwd = path.resolve(args.cwd || process.cwd());
  const environment = validateEnvironmentManifest(loadData(path.resolve(args['environment-manifest'])));
  if (!args.findings) throw new Error('必须提供 --findings');
  const findingsManifest = validateFindingsManifest(loadData(path.resolve(args.findings)), contract.governance.findings_registry);
  const ledgerAnchor = args['ledger-anchor'] ? loadData(path.resolve(args['ledger-anchor'])) : null;
  const ledgerAnchorPublicKey = args['ledger-anchor-public-key'] ? fs.readFileSync(path.resolve(args['ledger-anchor-public-key']), 'utf8') : null;
  const fingerprints = resolveContractFingerprints(contract, {
    cwd,
    sourceFingerprint: args['source-fingerprint'],
    environmentFingerprint: args['environment-fingerprint'],
    environment
  });
  const evaluation = evaluateDoD(contract, readLedger(path.resolve(args.ledger)), {
    sourceFingerprint: fingerprints.source_fingerprint,
    environmentFingerprint: fingerprints.environment_fingerprint,
    artifactRoot: cwd,
    attestationKeys: loadAttestationKeys(args['attestation-key']),
    findingsManifest,
    ledgerAnchor,
    ledgerAnchorPublicKey
  });
  const output = path.resolve(args.output || path.join(path.dirname(contractFile), 'done-cockpit.html'));
  atomicWrite(output, generateDoneCockpit(contract, evaluation));
  process.stdout.write(JSON.stringify({ generated: true, output, state: evaluation.state }, null, 2) + '\n');
  return { output, evaluation };
}

function printHelp() {
  console.log('用法: node bin/generate-done-cockpit.cjs --contract <contract.yaml> --ledger <ledger.jsonl> --environment-manifest <env.yaml> --findings <findings.yaml> --attestation-key <key-id=ENV_NAME> --ledger-anchor <owner-signed-anchor.json> --ledger-anchor-public-key <owner-public.pem> [--cwd .] [--output done-cockpit.html]');
}

module.exports = { main };
