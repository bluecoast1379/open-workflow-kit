#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalStringify, compositeRunId, reasonError, semanticHash } = require('./prototype-core.cjs');

function createOutputContext(bundle, target, exporterVersion, targetConfig) {
  const targetConfigHash = semanticHash(targetConfig || {});
  const runId = compositeRunId(bundle.model_hash, exporterVersion, targetConfigHash);
  const targetRoot = safeResolve(bundle.prototypeRoot, 'exports', target);
  return { ...bundle, target, exporterVersion, targetConfig: targetConfig || {}, targetConfigHash, runId, targetRoot };
}

function commitExport(context, artifacts, reportFields = {}) {
  ensureSafeDirectory(context.prototypeRoot, context.targetRoot);
  fs.mkdirSync(context.targetRoot, { recursive: true });
  const runsRoot = safeResolve(context.targetRoot, 'runs');
  const runDir = safeResolve(runsRoot, context.runId);
  const attemptId = makeAttemptId();
  const attempt = baseAttempt(context, attemptId);
  try {
    const material = normalizeArtifacts(artifacts);
    const manifest = {
      schema_version: '1.0', target: context.target, run_id: context.runId,
      model_hash: context.model_hash, provenance_hash: semanticHash(context.provenance),
      exporter_version: context.exporterVersion, target_config_hash: context.targetConfigHash,
      files: Object.keys(material).sort().map((name) => ({ path: name, sha256: hashBytes(material[name]), bytes: material[name].length }))
    };
    const report = {
      schema_version: '1.0', target: context.target, run_id: context.runId, initial_attempt_id: `run-${context.runId.slice(0, 20)}`,
      model_hash: context.model_hash, provenance_hash: manifest.provenance_hash,
      exporter_version: context.exporterVersion, target_config_hash: context.targetConfigHash,
      generation_status: 'PASS', structural_validation_status: 'PASS', client_validation_status: 'NOT_RUN',
      execution_status: 'NOT_RUN', capability_status: 'NOT_VERIFIED', external_write: false,
      recovery_steps: [], ...reportFields
    };
    material['manifest.json'] = Buffer.from(`${canonicalStringify(manifest)}\n`);
    material['report.json'] = Buffer.from(`${canonicalStringify(report)}\n`);
    if (fs.existsSync(runDir)) {
      verifyExistingRun(runDir, material);
    } else {
      fs.mkdirSync(runsRoot, { recursive: true });
      const staging = safeResolve(runsRoot, `.staging-${context.runId}-${crypto.randomBytes(4).toString('hex')}`);
      fs.mkdirSync(staging, { recursive: false });
      try {
        writeArtifacts(staging, material);
        fs.renameSync(staging, runDir);
      } catch (error) {
        fs.rmSync(staging, { recursive: true, force: true });
        throw error;
      }
    }
    const passedAttempt = { ...attempt, status: 'PASS', reason_code: 'STRUCTURAL_PASS', run_id: context.runId };
    appendAttempt(context, passedAttempt);
    atomicWriteJson(safeResolve(context.targetRoot, 'current.json'), { schema_version: '1.0', run_id: context.runId, report: `runs/${context.runId}/report.json` });
    atomicWriteJson(safeResolve(context.targetRoot, 'latest-attempt.json'), passedAttempt);
    return { runDir, runId: context.runId, report, attempt: passedAttempt };
  } catch (error) {
    recordFailure(context, error, attemptId);
    error.recorded = true;
    throw error;
  }
}

function recordBlocked(context, code, message, recoverySteps) {
  ensureSafeDirectory(context.prototypeRoot, context.targetRoot);
  fs.mkdirSync(context.targetRoot, { recursive: true });
  const attempt = {
    ...baseAttempt(context, makeAttemptId()), status: 'BLOCKED', reason_code: code,
    message: redact(message), recovery_steps: (recoverySteps || []).map(redact)
  };
  appendAttempt(context, attempt);
  atomicWriteJson(safeResolve(context.targetRoot, 'latest-attempt.json'), attempt);
  return attempt;
}

function recordFailure(context, error, attemptId = makeAttemptId()) {
  if (!context.targetRoot) return;
  ensureSafeDirectory(context.prototypeRoot, context.targetRoot);
  fs.mkdirSync(context.targetRoot, { recursive: true });
  const attempt = {
    ...baseAttempt(context, attemptId), status: 'FAIL', reason_code: error.code || 'EXPORT_FAILED',
    message: redact(error.message || String(error)), recovery_steps: ['修复失败原因后以相同 model/exporter/config 重新执行；previous current 未改变。']
  };
  appendAttempt(context, attempt);
  atomicWriteJson(safeResolve(context.targetRoot, 'latest-attempt.json'), attempt);
  return attempt;
}

function baseAttempt(context, attemptId) {
  return {
    schema_version: '1.0', attempt_id: attemptId, target: context.target, run_id: context.runId,
    model_hash: context.model_hash, exporter_version: context.exporterVersion,
    target_config_hash: context.targetConfigHash, recorded_at: new Date().toISOString(), external_write: false
  };
}

function appendAttempt(context, attempt) {
  const dir = safeResolve(context.targetRoot, 'attempts');
  fs.mkdirSync(dir, { recursive: true });
  const file = safeResolve(dir, `${attempt.attempt_id}.json`);
  fs.writeFileSync(file, `${canonicalStringify(attempt)}\n`, { flag: 'wx' });
}

function normalizeArtifacts(artifacts) {
  const output = {};
  for (const [name, value] of Object.entries(artifacts || {})) {
    assertRelativeArtifact(name);
    output[name] = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  }
  return output;
}

function writeArtifacts(root, artifacts) {
  for (const name of Object.keys(artifacts).sort()) {
    const file = safeResolve(root, ...name.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, artifacts[name], { flag: 'wx' });
  }
}

function verifyExistingRun(root, artifacts) {
  for (const [name, bytes] of Object.entries(artifacts)) {
    const file = safeResolve(root, ...name.split('/'));
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)) throw reasonError('RUN_ID_COLLISION', `immutable run 内容冲突: ${name}`);
  }
}

function atomicWriteJson(file, value) {
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(temp, `${canonicalStringify(value)}\n`, { flag: 'wx' });
  fs.renameSync(temp, file);
}

function ensureSafeDirectory(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw reasonError('UNSAFE_PATH', `路径越界: ${target}`);
  let current = resolvedRoot;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw reasonError('SYMLINK_BOUNDARY', `拒绝 symlink: ${current}`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
}

function safeResolve(root, ...segments) {
  for (const segment of segments) {
    if (typeof segment !== 'string' || !segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
      throw reasonError('UNSAFE_PATH', `非法路径段: ${segment}`);
    }
  }
  const output = path.resolve(root, ...segments);
  const rel = path.relative(path.resolve(root), output);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw reasonError('UNSAFE_PATH', `路径越界: ${output}`);
  return output;
}

function assertRelativeArtifact(name) {
  if (!name || path.isAbsolute(name) || name.split('/').some((part) => !part || part === '.' || part === '..') || name.includes('\\')) {
    throw reasonError('UNSAFE_PATH', `artifact path 非法: ${name}`);
  }
}

function hashBytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function makeAttemptId() { return `${Date.now().toString(36)}-${process.pid.toString(36)}-${crypto.randomBytes(5).toString('hex')}`; }
function redact(value) { return String(value).replace(/https?:\/\/[^\s]+/g, '[redacted-url]').replace(/(?:token|secret|password)=\S+/gi, '$1=[redacted]'); }

module.exports = {
  createOutputContext, commitExport, recordBlocked, recordFailure, safeResolve,
  ensureSafeDirectory, atomicWriteJson, normalizeArtifacts, hashBytes
};
