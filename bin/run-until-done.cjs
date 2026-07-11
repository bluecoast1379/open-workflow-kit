#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  loadData,
  atomicWrite,
  commandSpecHash,
  resolveExecutableIdentity,
  buildOracleEnvironment,
  validateCompletionContract,
  validateEnvironmentManifest,
  validateFindingsManifest,
  fingerprintContractEnvironment,
  resolveGitHead,
  hashCanonical,
  ensureWithin,
  runUntilDone,
  parseCliArgs
} = require('./completion-core.cjs');

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, ['help', 'no-resume', 'contract', 'cwd', 'environment-manifest', 'findings', 'print-required-specs', 'allow-spec', 'execution-permit', 'execution-public-key', 'attestation-key-id', 'attestation-key-env', 'ledger', 'checkpoint', 'decision-packet', 'environment-fingerprint', 'max-iterations', 'max-elapsed-ms', 'max-command-executions', 'max-cost-units', 'cost-per-execution', 'output'], 0);
  if (args.help) return printHelp();
  if (args['no-resume']) throw new Error('--no-resume 已禁用；新运行必须归档旧 runtime 并使用经 Owner 批准的新 Contract/version');
  if (!args.contract) throw new Error('必须提供 --contract');
  const contractFile = path.resolve(args.contract);
  const completionDir = path.dirname(contractFile);
  const contract = loadData(contractFile);
  const cwd = path.resolve(args.cwd || process.cwd());
  if (!args['environment-manifest']) throw new Error('自主执行与 --print-required-specs 都必须提供 --environment-manifest，单一环境名称不足以绑定依赖、数据、服务、模型与工具版本');
  const environment = validateEnvironmentManifest(loadData(path.resolve(args['environment-manifest'])));
  const validated = validateCompletionContract(contract);
  if (!args.findings) throw new Error('自主执行与 --print-required-specs 都必须提供 --findings');
  const findingsManifest = validateFindingsManifest(loadData(path.resolve(args.findings)), contract.governance.findings_registry);
  const findingsFingerprint = hashCanonical(findingsManifest);
  const oracleEnvironment = buildOracleEnvironment(process.env, contract.autonomy && contract.autonomy.oracle_env_allowlist || [], []);
  const rawSpecs = [
    ...(contract.acceptance || []).filter((item) => item && item.oracle && item.oracle.type === 'command').map((item) => ({ criterion_id: item.id, spec: item.oracle })),
    ...(contract.autonomy && contract.autonomy.iteration_command ? [{ criterion_id: 'REMEDIATION', spec: contract.autonomy.iteration_command }] : [])
  ];
  const requiredSpecs = rawSpecs.map((item) => ({
    ...item,
    spec_hash: commandSpecHash(item.spec),
    executable_fingerprint: resolveExecutableIdentity(item.spec.command, { cwd: ensureWithin(cwd, item.spec.cwd || '.', 'oracle cwd'), env: oracleEnvironment }).fingerprint
  }));
  if (args['print-required-specs']) {
    process.stdout.write(JSON.stringify({
      contract: contractFile,
      contract_hash: validated.contract_hash,
      environment_fingerprint: fingerprintContractEnvironment(contract, environment),
      findings_fingerprint: findingsFingerprint,
      base_commit: resolveGitHead(cwd),
      scope_hash: hashCanonical(contract.scope),
      required_command_specs: requiredSpecs
    }, null, 2) + '\n');
    return { required_command_specs: requiredSpecs };
  }
  if (args['allow-spec']) throw new Error('--allow-spec 不再是授权凭证；请使用 Owner Ed25519 签名的 --execution-permit');
  if (!args['execution-permit'] || !args['execution-public-key']) throw new Error('必须提供 --execution-permit 与 --execution-public-key');
  const executionPermit = loadData(path.resolve(args['execution-permit']));
  const executionPublicKey = fs.readFileSync(path.resolve(args['execution-public-key']), 'utf8');
  const attestationKeyId = args['attestation-key-id'];
  const attestationKey = readSecretEnv(args['attestation-key-env']);
  if (!attestationKeyId) throw new Error('必须提供 --attestation-key-id');
  const result = await runUntilDone({
    contract,
    cwd,
    ledgerPath: path.resolve(args.ledger || path.join(completionDir, 'evidence/ledger.jsonl')),
    checkpointPath: path.resolve(args.checkpoint || path.join(completionDir, 'run-state.yaml')),
    decisionPacketPath: path.resolve(args['decision-packet'] || path.join(completionDir, 'decision-packet.json')),
    environment,
    findingsManifest,
    environmentFingerprint: args['environment-fingerprint'],
    executionPermit,
    executionPublicKey,
    attestationKey,
    attestationKeyId,
    maxIterations: args['max-iterations'] ? Number(args['max-iterations']) : undefined,
    maxElapsedMs: args['max-elapsed-ms'] ? Number(args['max-elapsed-ms']) : undefined,
    maxCommandExecutions: args['max-command-executions'] ? Number(args['max-command-executions']) : undefined,
    maxCostUnits: args['max-cost-units'] ? Number(args['max-cost-units']) : undefined,
    costPerExecution: args['cost-per-execution'] ? Number(args['cost-per-execution']) : undefined,
    resume: !args['no-resume']
  });
  const output = JSON.stringify(result, null, 2) + '\n';
  if (args.output) atomicWrite(path.resolve(args.output), output);
  else process.stdout.write(output);
  if (result.outcome === 'BLOCKED_WITH_DECISION_PACKET') process.exitCode = 2;
  else if (result.outcome === 'BUDGET_EXHAUSTED') process.exitCode = 3;
  else if (result.outcome === 'READY_FOR_HUMAN_ACCEPTANCE') process.exitCode = 4;
  return result;
}

function printHelp() {
  console.log(`用法:
  node bin/run-until-done.cjs --contract <contract.yaml> --cwd <repo> --environment-manifest <environment.yaml> --findings <findings.yaml> --print-required-specs
  node bin/run-until-done.cjs --contract <contract.yaml> --cwd <repo> --environment-manifest <environment.yaml> --findings <findings.yaml> --execution-permit <owner-signed-permit.json> --execution-public-key <owner-public-key.pem> --attestation-key-id automation-local-v1 --attestation-key-env OWK_AUTOMATION_KEY [--cost-per-execution 1]

安全约束：oracle 始终以 shell:false 的 command + args 执行；Owner permit 绑定 contract/environment/findings/base/scope/spec/executable/budgets；PASS 证据使用外部密钥签名。
预算约束：runner 的 --max-* / --cost-per-execution 必须与签发 permit 时完全一致；permit 在运行中到期会立即生成 EXECUTION_PERMIT_EXPIRED 决策包并停止后续 Oracle/remediation。
结果：READY_FOR_HUMAN_ACCEPTANCE / BLOCKED_WITH_DECISION_PACKET / BUDGET_EXHAUSTED。`);
}

function readSecretEnv(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || ''))) throw new Error('必须提供合法 --attestation-key-env');
  if (!Object.hasOwn(process.env, name) || !process.env[name]) throw new Error(`环境变量 ${name} 未设置`);
  const value = process.env[name];
  delete process.env[name];
  return value;
}

module.exports = { main };
