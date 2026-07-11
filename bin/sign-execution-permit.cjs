#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  loadData,
  validateCompletionContract,
  fingerprintContractEnvironment,
  validateEnvironmentManifest,
  validateFindingsManifest,
  resolveGitHead,
  commandSpecHash,
  resolveExecutableIdentity,
  buildOracleEnvironment,
  hashCanonical,
  publicKeyFingerprint,
  signExecutionPermit,
  atomicWrite,
  parseCliArgs
} = require('./completion-core.cjs');

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, ['help', 'print-public-key-fingerprint', 'public-key', 'contract', 'private-key', 'output', 'environment-manifest', 'findings', 'cwd', 'valid-minutes', 'permit-id', 'max-iterations', 'max-elapsed-ms', 'max-command-executions', 'max-cost-units', 'cost-per-execution'], 0);
  if (args.help) return printHelp();
  if (args['print-public-key-fingerprint']) {
    if (!args['public-key']) throw new Error('必须提供 --public-key');
    const fingerprint = publicKeyFingerprint(fs.readFileSync(path.resolve(args['public-key']), 'utf8'));
    process.stdout.write(`${fingerprint}\n`);
    return fingerprint;
  }
  for (const name of ['contract', 'private-key', 'public-key', 'output']) if (!args[name]) throw new Error(`必须提供 --${name}`);
  const contract = loadData(path.resolve(args.contract));
  const validated = validateCompletionContract(contract);
  if (contract.feature.status !== 'frozen' || contract.governance.status !== 'frozen') throw new Error('只为 fully frozen Contract 签发 permit');
  const cwd = path.resolve(args.cwd || process.cwd());
  if (!args['environment-manifest']) throw new Error('签发 permit 必须提供 --environment-manifest');
  const environment = validateEnvironmentManifest(loadData(path.resolve(args['environment-manifest'])));
  const environmentFingerprint = fingerprintContractEnvironment(contract, environment);
  if (!args.findings) throw new Error('签发 permit 必须提供 --findings');
  const findingsManifest = validateFindingsManifest(loadData(path.resolve(args.findings)), contract.governance.findings_registry);
  const privateKeyPath = path.resolve(args['private-key']);
  const outputPath = path.resolve(args.output);
  assertOutsideWorkspace(cwd, privateKeyPath, 'private key');
  assertOutsideWorkspace(cwd, outputPath, 'permit output');
  const privateKeyStat = fs.lstatSync(privateKeyPath);
  if (!privateKeyStat.isFile() || privateKeyStat.isSymbolicLink()) throw new Error('private key 必须是 regular file，禁止 symlink');
  if (process.platform !== 'win32' && (privateKeyStat.mode & 0o077) !== 0) throw new Error('private key 权限必须禁止 group/other 访问（建议 0600）');
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const publicKey = fs.readFileSync(path.resolve(args['public-key']), 'utf8');
  const policy = contract.governance.execution_authorization;
  if (publicKeyFingerprint(publicKey) !== policy.trusted_public_key_sha256) throw new Error('public key fingerprint 与 Contract 不匹配');
  const selectCeiling = (argName, contractValue, integer = false) => {
    const limit = Number(contractValue);
    const selected = args[argName] === undefined ? limit : Number(args[argName]);
    if (!Number.isFinite(selected) || selected <= 0 || selected > limit || (integer && !Number.isInteger(selected))) throw new Error(`--${argName} 必须为${integer ? '正整数' : '正数'}且不得超过 Contract 上限 ${limit}`);
    return selected;
  };
  const costFloor = Number(contract.autonomy.cost_per_execution);
  const costPerExecution = args['cost-per-execution'] === undefined ? costFloor : Number(args['cost-per-execution']);
  if (!Number.isFinite(costPerExecution) || costPerExecution < costFloor) throw new Error(`--cost-per-execution 不得低于 Contract 下限 ${costFloor}`);
  const validMinutes = args['valid-minutes'] === undefined ? Math.min(60, policy.max_validity_minutes) : Number(args['valid-minutes']);
  if (!Number.isFinite(validMinutes) || validMinutes <= 0 || validMinutes > policy.max_validity_minutes) throw new Error(`--valid-minutes 必须位于 1..${policy.max_validity_minutes}`);
  const issuedAt = new Date();
  const commandSpecs = [
    ...(contract.acceptance || []).filter((criterion) => criterion && !criterion.human_gate && criterion.oracle && criterion.oracle.type === 'command').map((criterion) => criterion.oracle),
    ...(contract.autonomy.iteration_command ? [contract.autonomy.iteration_command] : [])
  ];
  const commandSpecHashes = commandSpecs.map(commandSpecHash);
  const oracleEnvironment = buildOracleEnvironment(process.env, contract.autonomy.oracle_env_allowlist, []);
  const executableFingerprints = Object.fromEntries(commandSpecs.map((spec) => [commandSpecHash(spec), resolveExecutableIdentity(spec.command, { cwd: ensureWithin(cwd, spec.cwd || '.', 'oracle cwd'), env: oracleEnvironment }).fingerprint]));
  const permit = signExecutionPermit({
    schema_version: '1.0',
    permit_id: args['permit-id'] || crypto.randomUUID(),
    key_id: policy.key_id,
    issued_at: issuedAt.toISOString(),
    expires_at: new Date(issuedAt.getTime() + validMinutes * 60000).toISOString(),
    contract_hash: validated.contract_hash,
    environment_fingerprint: environmentFingerprint,
    findings_fingerprint: hashCanonical(findingsManifest),
    scope_hash: hashCanonical(contract.scope),
    base_commit: resolveGitHead(cwd),
    command_spec_hashes: [...new Set(commandSpecHashes)].sort(),
    executable_fingerprints: executableFingerprints,
    budgets: {
      max_iterations: selectCeiling('max-iterations', contract.autonomy.max_iterations, true),
      max_elapsed_ms: selectCeiling('max-elapsed-ms', contract.autonomy.max_elapsed_minutes * 60000),
      max_command_executions: selectCeiling('max-command-executions', contract.autonomy.max_command_executions, true),
      max_cost_units: selectCeiling('max-cost-units', contract.autonomy.max_cost_units),
      cost_per_execution: costPerExecution,
      max_diff_lines: contract.autonomy.max_diff_lines === undefined ? null : Number(contract.autonomy.max_diff_lines)
    },
    nonce: crypto.randomBytes(16).toString('hex')
  }, privateKey);
  atomicWrite(outputPath, JSON.stringify(permit, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ generated: true, output: outputPath, permit_id: permit.permit_id, expires_at: permit.expires_at, contract_hash: permit.contract_hash }, null, 2) + '\n');
  return permit;
}

function assertOutsideWorkspace(workspace, target, label) {
  const relative = path.relative(path.resolve(workspace), path.resolve(target));
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error(`${label} 必须位于 Agent 工作区之外`);
}

function ensureWithin(workspace, target, label) {
  const resolvedWorkspace = path.resolve(workspace);
  const resolvedTarget = path.resolve(resolvedWorkspace, target);
  const relative = path.relative(resolvedWorkspace, resolvedTarget);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${label} 越出工作区`);
  return resolvedTarget;
}

function printHelp() {
  console.log('用法:\n  node bin/sign-execution-permit.cjs --public-key <owner-public.pem> --print-public-key-fingerprint\n  node bin/sign-execution-permit.cjs --contract <contract.yaml> --private-key <owner-ed25519-private.pem> --public-key <owner-ed25519-public.pem> --environment-manifest <environment.yaml> --findings <findings.yaml> --output <permit.json> [--cwd .] [--valid-minutes 60] [--max-iterations N --max-elapsed-ms N --max-command-executions N --max-cost-units N --cost-per-execution N]\n\nPermit 精确绑定预算；若签发时收紧预算，run-until-done 必须逐项传入完全相同的值。Permit 到期会在迭代、Oracle 与 remediation 边界触发硬停止。');
}

module.exports = { main };
