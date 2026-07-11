#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  loadData,
  parseData,
  stringifyYaml,
  atomicWrite,
  hashCanonical,
  validateCompletionContract,
  collectContractIssues,
  fingerprintPaths,
  fingerprintOraclePaths,
  fingerprintContractEnvironment,
  ensureWithin,
  parseCliArgs
} = require('./completion-core.cjs');

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, ['help', 'init', 'contract', 'json', 'feature', 'workspace', 'output', 'print-oracle-integrity', 'cwd', 'criterion'], 1);
  if (args.contract && args._.length) throw new Error('不能同时使用 --contract 与位置 contract 参数');
  if (args.help) return printHelp();
  if (args.init) return initializeContract(args);
  const contractFile = args.contract || args._[0];
  if (!contractFile) throw new Error('必须提供 --contract <features/{feature}/completion/contract.yaml>，或使用 --init --feature <id>');
  const resolved = path.resolve(contractFile);
  const contract = loadData(resolved);
  if (args['print-oracle-integrity']) return printOracleIntegrity(contract, resolved, args);
  const issues = collectContractIssues(contract);
  const errors = issues.filter((item) => item.severity === 'error');
  const warnings = issues.filter((item) => item.severity === 'warning');
  let contractHash = null;
  if (!errors.length) contractHash = validateCompletionContract(contract).contract_hash;
  const result = {
    valid: errors.length === 0,
    contract: resolved,
    contract_hash: contractHash,
    acceptance_count: Array.isArray(contract.acceptance) ? contract.acceptance.length : 0,
    error_count: errors.length,
    warning_count: warnings.length,
    issues
  };
  if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    console.log(result.valid ? `Completion Contract 有效: ${resolved}` : `Completion Contract 无效: ${resolved}`);
    if (contractHash) console.log(`contract_hash: ${contractHash}`);
    for (const issue of issues) console.log(`${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`);
  }
  if (!result.valid) process.exitCode = 1;
  return result;
}

function printOracleIntegrity(contract, contractFile, args) {
  const workspace = path.resolve(args.cwd || process.cwd());
  const requestedCriterion = args.criterion ? String(args.criterion) : null;
  const candidates = [];
  for (const criterion of Array.isArray(contract.acceptance) ? contract.acceptance : []) {
    if (!criterion || criterion.human_gate || !criterion.oracle || criterion.oracle.type !== 'command') continue;
    candidates.push({ criterion_id: String(criterion.id || ''), oracle: criterion.oracle });
  }
  if (contract.autonomy && contract.autonomy.iteration_command) candidates.push({ criterion_id: 'AUTONOMY_ITERATION_COMMAND', oracle: contract.autonomy.iteration_command });
  const selected = requestedCriterion ? candidates.filter((item) => item.criterion_id === requestedCriterion) : candidates;
  if (!selected.length) throw new Error(requestedCriterion ? `找不到 command oracle criterion: ${requestedCriterion}` : 'Contract 中没有可计算的 command oracle');
  const criteria = selected.map(({ criterion_id: criterionId, oracle }) => {
    const relativeCwd = oracle.cwd || '.';
    if (path.isAbsolute(relativeCwd) || String(relativeCwd).split(/[\\/]+/).includes('..')) throw new Error(`${criterionId} 的 oracle cwd 必须是工作区内相对路径`);
    if (!Array.isArray(oracle.integrity_paths) || !oracle.integrity_paths.length) throw new Error(`${criterionId} 缺少 integrity_paths`);
    for (const item of oracle.integrity_paths) {
      if (typeof item !== 'string' || !item.trim() || path.isAbsolute(item) || String(item).split(/[\\/]+/).includes('..')) throw new Error(`${criterionId} 包含非法 integrity path: ${item}`);
    }
    const oracleCwd = ensureWithin(workspace, relativeCwd, `${criterionId} oracle cwd`);
    const workspaceStat = fs.lstatSync(workspace);
    const cwdStat = fs.lstatSync(oracleCwd);
    if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink() || !cwdStat.isDirectory() || cwdStat.isSymbolicLink()) throw new Error(`${criterionId} 的 workspace/oracle cwd 必须是非符号链接 directory`);
    const realWorkspace = fs.realpathSync(workspace);
    const realCwd = fs.realpathSync(oracleCwd);
    const realRelative = path.relative(realWorkspace, realCwd);
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error(`${criterionId} 的 oracle cwd realpath 越出工作区`);
    const computed = fingerprintOraclePaths(oracle.integrity_paths, { cwd: oracleCwd });
    const unsafeRecords = computed.records.filter((item) => ['missing', 'symlink', 'symlink-file', 'other'].includes(item.type));
    return {
      criterion_id: criterionId,
      cwd: path.relative(workspace, oracleCwd) || '.',
      integrity_paths: [...oracle.integrity_paths],
      integrity_fingerprint: computed.fingerprint,
      records_count: computed.records.length,
      usable_for_freeze: unsafeRecords.length === 0,
      unsafe_records: unsafeRecords
    };
  });
  const result = {
    valid: criteria.every((item) => item.usable_for_freeze),
    contract: contractFile,
    workspace,
    criteria,
    note: '将每项 integrity_fingerprint 写回对应 command oracle 后，再执行完整 Contract 校验。'
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.valid) process.exitCode = 1;
  return result;
}

function initializeContract(args) {
  const feature = String(args.feature || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(feature)) throw new Error('--feature 只能使用字母、数字、点、下划线和短横线，且不得包含路径分隔符');
  const workspace = path.resolve(args.workspace || process.cwd());
  const completionDir = args.output ? path.dirname(path.resolve(args.output)) : path.join(workspace, 'features', feature, 'completion');
  const contractFile = args.output ? path.resolve(args.output) : path.join(completionDir, 'contract.yaml');
  const evidenceDir = path.join(completionDir, 'evidence');
  const runStateFile = path.join(completionDir, 'run-state.yaml');
  const environmentFile = path.join(completionDir, 'environment.yaml');
  const findingsFile = path.join(completionDir, 'findings.yaml');
  for (const file of [contractFile, runStateFile, environmentFile, findingsFile]) if (fs.existsSync(file)) throw new Error(`拒绝覆盖已有文件: ${file}`);
  const templateCandidates = [
    path.resolve(__dirname, '../workflow/core/templates/completion-contract.template.yaml'),
    path.resolve(__dirname, '../core/templates/completion-contract.template.yaml')
  ];
  const templateFile = templateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!templateFile) throw new Error(`找不到 Completion Contract template: ${templateCandidates.join(', ')}`);
  const template = fs.readFileSync(templateFile, 'utf8');
  const contractText = template.replace(/<FEATURE_ID>/g, feature);
  const contract = parseData(contractText, templateFile);
  const environmentTemplateCandidates = [
    path.resolve(__dirname, '../workflow/core/templates/environment-manifest.template.yaml'),
    path.resolve(__dirname, '../core/templates/environment-manifest.template.yaml')
  ];
  const environmentTemplateFile = environmentTemplateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!environmentTemplateFile) throw new Error(`找不到 environment manifest template: ${environmentTemplateCandidates.join(', ')}`);
  const environmentText = fs.readFileSync(environmentTemplateFile, 'utf8').replace('<TODO: 受控环境名称>', `${feature}-test`);
  const environment = parseData(environmentText, environmentTemplateFile);
  const findingsTemplateCandidates = [
    path.resolve(__dirname, '../workflow/core/templates/findings-manifest.template.yaml'),
    path.resolve(__dirname, '../core/templates/findings-manifest.template.yaml')
  ];
  const findingsTemplateFile = findingsTemplateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!findingsTemplateFile) throw new Error(`找不到 findings manifest template: ${findingsTemplateCandidates.join(', ')}`);
  const findingsText = fs.readFileSync(findingsTemplateFile, 'utf8').replace('<SNAPSHOT_AT>', new Date().toISOString());
  const contractHash = hashCanonical(contract);
  fs.mkdirSync(evidenceDir, { recursive: true });
  atomicWrite(contractFile, contractText.endsWith('\n') ? contractText : contractText + '\n');
  atomicWrite(environmentFile, environmentText.endsWith('\n') ? environmentText : environmentText + '\n');
  atomicWrite(findingsFile, findingsText.endsWith('\n') ? findingsText : findingsText + '\n');
  const source = fingerprintPaths(contract.scope.source_paths, { cwd: workspace, excludes: contract.scope.fingerprint_excludes || [] }).fingerprint;
  const state = {
    schema_version: '1.0',
    contract_hash: contractHash,
    source_fingerprint: source,
    environment_fingerprint: fingerprintContractEnvironment(contract, environment),
    iteration: 0,
    command_executions: 0,
    cost_units: 0,
    ledger_entry_count: 0,
    ledger_head_hash: 'GENESIS',
    status: 'NOT_STARTED',
    automation_complete: false,
    accepted: false,
    blocker_count: 0,
    failure_fingerprint: null,
    same_failure_count: 0,
    no_progress_count: 0,
    base_commit: null,
    baseline_source_fingerprint: source,
    elapsed_ms: 0,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  atomicWrite(runStateFile, stringifyYaml(state) + '\n');
  const result = { initialized: true, feature, contract: contractFile, environment_manifest: environmentFile, findings_manifest: findingsFile, evidence_dir: evidenceDir, run_state: runStateFile, contract_hash: contractHash, definition_status: 'draft-with-placeholders' };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}

function printHelp() {
  console.log(`用法:
  node bin/check-completion-contract.cjs --contract features/<feature>/completion/contract.yaml [--json]
  node bin/check-completion-contract.cjs --init --feature <id> [--workspace .] [--output <contract.yaml>]
  node bin/check-completion-contract.cjs --contract <contract.yaml> --print-oracle-integrity --cwd <repo> [--criterion AC-001]

--print-oracle-integrity 可在 draft 仍含 placeholder 时先计算 command oracle 的完整性指纹；只有所有 integrity_paths 都是现存、非符号链接的安全文件时 usable_for_freeze 才为 true。初始化不会覆盖已有 contract.yaml、environment.yaml、findings.yaml 或 run-state.yaml。`);
}

module.exports = { main, initializeContract, printOracleIntegrity };
