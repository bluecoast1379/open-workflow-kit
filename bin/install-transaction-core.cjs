#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LEGACY_101_HASHES = new Map(Object.entries({
  'workflow/core/command-manifest.yaml': 'c7acd470a5fb90f12c069b718a82a2353e72d6c2301eb6916c3ad34979f6fbfb',
  'workflow/core/capability-manifest.yaml': 'beb9d8a978bed722204ab482513451db4083e93f4f2094bef31091227fbfe9a6',
  'workflow/core/commands/02C-HTML原型.md': 'c83d08b9028c06c34d0ecc4069dd42b04d2ed3f6cad78edbe7d15d41bde48043',
  'workflow/core/commands/02B-UI设计.md': 'ad7016a103d6dd61962713d63eb75890be178e4e62715c6da39f7b90d79617e0',
  'workflow/core/commands/04A-前端代码实现.md': '1cac523e6afb1d87c57898ed492c8b8b5e1341e3d48b45041e597ebda7679d6b',
  'workflow/core/commands/06-测试用例.md': 'cda38dfbc7e46a2c8f04e0c38e914bbec79c81af7afb7f3b47536ac6c69054bc',
  'workflow/core/templates/prototype-page.html': 'd38db03c6bb94a36982f2dd246c832ef9b95ab36cc31727dd9b0fe97fffbd22a',
  'workflow/core/README.md': 'de9d9daa3f754ff392091ef6e349d51c1c75b6044e8937e1ed17a22a23a5b116',
  'workflow/core/templates/README.md': 'fd6cb296ac38ca5dbd15a6b9a9b8f54b498aced60b7b5be63ccfcc3d300cb70e',
  'workflow/adapters/support-matrix.yaml': '5f11f2fee33c332b84ff04ec98a48a95cc725f8f475ffaa7026970cc2e0b7c2e',
  'workflow/bin/check-command-manifest.cjs': 'a6cf4a4bb94d18ada48fdfd3953638932ee3ef9df0106ba25d2fa6a4698b14be'
}));

function applyInstallTransaction(input) {
  const target = fs.realpathSync(path.resolve(input.target));
  recoverIncompleteTransaction(target);
  const writes = input.writes.map((write) => normalizeWrite(target, write));
  const removes = (input.removes || []).map((item) => normalizeRemove(target, item));
  const options = input.options || {};
  const preflight = buildPreflight(target, writes, removes, options);
  if (preflight.conflicts.length) {
    const error = new Error(`升级冲突，active cohort 未改变:\n${preflight.conflicts.map((item) => `- ${item.rel}`).join('\n')}`);
    error.code = 'INSTALL_CONFLICT';
    error.conflicts = preflight.conflicts;
    throw error;
  }
  const id = crypto.randomBytes(12).toString('hex');
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = sha256(token);
  const transactionRoot = path.join(target, 'workflow', '.open-workflow-kit-transactions', id);
  const journalFile = path.join(target, 'workflow', '.open-workflow-kit-transaction.json');
  fs.mkdirSync(transactionRoot, { recursive: true });
  const journal = {
    schema_version: '1.0', transaction_id: id, status: 'planned', token_hash: tokenHash,
    target_fingerprint: sha256(target), kit_version: input.kitVersion || 'development',
    entries: preflight.actions.map((action) => ({ rel: action.rel, kind: action.kind, existed: action.existed, before_sha256: action.beforeSha256 || null }))
  };
  writeJsonAtomic(journalFile, journal);
  snapshotBefore(target, transactionRoot, preflight.actions);
  try {
    transition(journalFile, journal, 'applying');
    let mutationCount = 0;
    for (const action of preflight.actions) {
      applyAction(target, action);
      mutationCount += 1;
      if (Number(process.env.OWK_INSTALL_FAIL_AFTER || 0) === mutationCount) {
        const injected = new Error(`injected failure after mutation ${mutationCount}`);
        injected.code = 'INSTALL_INJECTED_FAILURE';
        throw injected;
      }
    }
    transition(journalFile, journal, 'validating');
    validateInstalledCohort(target, writes, tokenHash, preflight.actions);
    transition(journalFile, journal, 'committed');
    writeJsonAtomic(path.join(target, 'workflow', '.open-workflow-kit-install.json'), {
      schema_version: '1.0', kit_version: input.kitVersion || 'development', command_count: readCommandCount(target),
      cohort_hash: cohortHash(target, writes), committed_transaction_id: id
    });
    fs.rmSync(transactionRoot, { recursive: true, force: true });
    cleanupEmptyDirs(input.cleanupDirs || [], target);
    return { transaction_id: id, status: 'committed', action_count: preflight.actions.length, proposals: preflight.proposals };
  } catch (error) {
    journal.failure_code = error.code || 'INSTALL_FAILED';
    journal.failure_message = String(error.message || error);
    transition(journalFile, journal, 'rolling_back');
    restoreSnapshot(target, transactionRoot, journal.entries);
    transition(journalFile, journal, 'rolled_back');
    fs.rmSync(transactionRoot, { recursive: true, force: true });
    throw error;
  }
}

function buildPreflight(target, writes, removes, options) {
  const actions = [];
  const conflicts = [];
  const proposals = [];
  for (const write of writes) {
    const existed = fs.existsSync(write.file);
    const current = existed ? fs.readFileSync(write.file) : null;
    const next = Buffer.from(write.content);
    if (current && current.equals(next)) continue;
    if (existed && ((options.upgrade && write.preserveOnUpgrade) || (!options.upgrade && !options.force))) {
      const proposalRel = `${write.rel}.agent-workflow-new`;
      actions.push({ kind: 'write', rel: proposalRel, bytes: next, existed: fs.existsSync(path.join(target, proposalRel)), beforeSha256: fileHashOrNull(path.join(target, proposalRel)) });
      proposals.push(proposalRel);
      continue;
    }
    if (existed && !options.force) {
      if (!options.upgrade || !isRecognizedManaged(write.rel, current)) {
        conflicts.push({ rel: write.rel, reason: 'existing bytes are not a recognized managed baseline' });
        continue;
      }
    }
    actions.push({ kind: 'write', rel: write.rel, bytes: next, existed, beforeSha256: current ? sha256(current) : null });
  }
  for (const remove of removes) {
    if (!fs.existsSync(remove.file)) continue;
    const stat = fs.lstatSync(remove.file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      conflicts.push({ rel: remove.rel, reason: 'remove target is not a regular managed file' });
      continue;
    }
    actions.push({ kind: 'remove', rel: remove.rel, existed: true, beforeSha256: fileHashOrNull(remove.file) });
  }
  return { actions, conflicts, proposals };
}

function normalizeWrite(target, write) {
  const file = assertInside(target, write.file);
  return { ...write, file, rel: portable(path.relative(target, file)), content: Buffer.isBuffer(write.content) ? write.content : Buffer.from(String(write.content)) };
}
function normalizeRemove(target, item) { const file = assertInside(target, item.file); return { ...item, file, rel: portable(path.relative(target, file)) }; }

function isRecognizedManaged(rel, bytes) {
  const text = bytes.length <= 2 * 1024 * 1024 ? bytes.toString('utf8') : '';
  if (text.includes('generated-by: open-workflow-kit; managed-adapter: true')) return true;
  if (text.includes('本工作区使用 open-workflow-kit ') || text.includes('本目录由 open-workflow-kit ') || text.includes('generated_by: "open-workflow-kit ')) return true;
  if (rel === 'workflow/INSTALL_REPORT.md' && text.startsWith('# 安装报告\n') && text.includes('- 生成器: open-workflow-kit ')) return true;
  if (rel === 'workflow/TOOLCHAIN_MCP_PLAN.md' && text.startsWith('# 工具链 MCP 连接计划\n') && text.includes('open-workflow-kit ')) return true;
  if (rel === 'workflow/INITIALIZATION_QUESTIONS.md' && text.startsWith('# 初始化待补资料\n')) return true;
  const expected = LEGACY_101_HASHES.get(rel);
  return Boolean(expected && sha256(bytes) === expected);
}

function snapshotBefore(target, transactionRoot, actions) {
  const inventory = [];
  for (const action of actions) {
    const file = path.join(target, action.rel);
    if (!action.existed) { inventory.push({ rel: action.rel, existed: false }); continue; }
    const backup = path.join(transactionRoot, 'before', action.rel);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(file, backup);
    inventory.push({ rel: action.rel, existed: true, sha256: sha256(fs.readFileSync(backup)) });
  }
  writeJsonAtomic(path.join(transactionRoot, 'inventory.json'), { schema_version: '1.0', entries: inventory });
}

function applyAction(target, action) {
  const file = assertInside(target, path.join(target, action.rel));
  if (action.kind === 'remove') { fs.unlinkSync(file); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  assertNoSymlink(target, file);
  const temp = `${file}.owk-tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(temp, action.bytes, { flag: 'wx' });
  fs.renameSync(temp, file);
}

function validateInstalledCohort(target, writes, tokenHash, actions = []) {
  const journalFile = path.join(target, 'workflow', '.open-workflow-kit-transaction.json');
  const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
  if (journal.status !== 'validating' || journal.token_hash !== tokenHash) throw new Error('install validator token/status mismatch');
  const manifest = path.join(target, 'workflow/core/command-manifest.yaml');
  if (!fs.existsSync(manifest)) throw new Error('installed cohort missing command manifest');
  const count = readCommandCount(target);
  const source = fs.readFileSync(manifest, 'utf8');
  const ids = [...source.matchAll(/^\s+- id:\s*"([^"]+)"/gm)].map((match) => match[1]);
  if (ids.length !== count) throw new Error(`manifest count mismatch: ${count}/${ids.length}`);
  for (const id of ids) if (!fs.existsSync(path.join(target, 'workflow/core/commands', `${id}.md`))) throw new Error(`missing core command ${id}`);
  const activeWrites = writes.filter((write) => !(write.preserveOnUpgrade && fs.existsSync(write.file)));
  for (const write of activeWrites) if (!fs.existsSync(write.file)) throw new Error(`planned file missing: ${write.rel}`);
  for (const action of actions) {
    const file = path.join(target, action.rel);
    if (action.kind === 'remove' && fs.existsSync(file)) throw new Error(`planned removal still exists: ${action.rel}`);
    if (action.kind === 'write' && (!fs.existsSync(file) || !fs.readFileSync(file).equals(action.bytes))) throw new Error(`planned bytes mismatch: ${action.rel}`);
  }
}

function recoverIncompleteTransaction(target) {
  const journalFile = path.join(target, 'workflow', '.open-workflow-kit-transaction.json');
  if (!fs.existsSync(journalFile)) return { recovered: false };
  const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
  if (!['planned', 'applying', 'validating', 'rolling_back'].includes(journal.status)) return { recovered: false };
  const transactionRoot = path.join(target, 'workflow', '.open-workflow-kit-transactions', journal.transaction_id);
  restoreSnapshot(target, transactionRoot, journal.entries || []);
  journal.status = 'rolled_back';
  journal.recovered = true;
  writeJsonAtomic(journalFile, journal);
  fs.rmSync(transactionRoot, { recursive: true, force: true });
  return { recovered: true, transaction_id: journal.transaction_id };
}

function restoreSnapshot(target, transactionRoot, entries) {
  for (const entry of [...entries].reverse()) {
    const file = assertInside(target, path.join(target, entry.rel));
    if (!entry.existed) { fs.rmSync(file, { force: true }); continue; }
    const backup = path.join(transactionRoot, 'before', entry.rel);
    if (!fs.existsSync(backup)) throw new Error(`transaction backup missing: ${entry.rel}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(backup, file);
  }
}

function transition(journalFile, journal, status) {
  const allowed = { planned: ['applying'], applying: ['validating', 'rolling_back'], validating: ['committed', 'rolling_back'], rolling_back: ['rolled_back'] };
  if (!(allowed[journal.status] || []).includes(status)) throw new Error(`illegal install transition ${journal.status} -> ${status}`);
  journal.status = status;
  writeJsonAtomic(journalFile, journal);
}

function assertInside(target, file) {
  const root = path.resolve(target);
  const resolved = path.resolve(file);
  const rel = path.relative(root, resolved);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error(`unsafe install path: ${file}`);
  assertNoSymlink(root, resolved);
  return resolved;
}

function assertNoSymlink(root, file) {
  let current = path.resolve(root);
  for (const segment of path.relative(current, path.resolve(file)).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`symlink install boundary: ${current}`); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
}

function readCommandCount(target) {
  const source = fs.readFileSync(path.join(target, 'workflow/core/command-manifest.yaml'), 'utf8');
  const match = source.match(/^command_count:\s*(\d+)\s*$/m);
  if (!match) throw new Error('command_count missing');
  return Number(match[1]);
}
function cohortHash(target, writes) { return sha256(writes.map((write) => `${write.rel}:${fileHashOrNull(write.file) || 'missing'}`).sort().join('\n')); }
function fileHashOrNull(file) { try { return sha256(fs.readFileSync(file)); } catch { return null; } }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function portable(value) { return value.split(path.sep).join('/'); }
function writeJsonAtomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.tmp-${process.pid}`; fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(temp, file); }
function cleanupEmptyDirs(dirs, target) {
  const root = path.resolve(target);
  for (const dir of [...new Set(dirs)].sort((a,b) => b.length-a.length)) {
    let current = path.resolve(dir);
    while (current !== root && current.startsWith(`${root}${path.sep}`)) {
      try {
        if (!fs.existsSync(current) || fs.readdirSync(current).length !== 0) break;
        fs.rmdirSync(current);
        current = path.dirname(current);
      } catch { break; }
    }
  }
}

module.exports = { applyInstallTransaction, recoverIncompleteTransaction, buildPreflight, validateInstalledCohort, LEGACY_101_HASHES };
