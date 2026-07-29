#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MODEL_SCHEMA_VERSION = '1.0';
const EXPORTER_VERSION = '1.0.0';
const TARGETS = new Set(['figma', 'sketch', 'axure']);
const NODE_TYPES = new Set(['frame', 'text', 'rectangle', 'ellipse', 'component', 'instance', 'button']);
const MAX_PAGES = 200;
const MAX_NODES = 20000;
const MAX_DEPTH = 32;
const MAX_STRING_BYTES = 16 * 1024 * 1024;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function canonicalStringify(value) {
  const seen = new Set();
  function normalize(item, depth) {
    if (depth > MAX_DEPTH) throw reasonError('MODEL_LIMIT_EXCEEDED', `对象深度超过 ${MAX_DEPTH}`);
    if (item === null || typeof item === 'boolean' || typeof item === 'number') {
      if (typeof item === 'number' && !Number.isFinite(item)) throw reasonError('INVALID_MODEL', 'number 必须有限');
      return item;
    }
    if (typeof item === 'string') {
      if (Buffer.byteLength(item, 'utf8') > MAX_STRING_BYTES) throw reasonError('MODEL_LIMIT_EXCEEDED', '字符串超过 16 MiB');
      return item;
    }
    if (Array.isArray(item)) {
      if (seen.has(item)) throw reasonError('INVALID_MODEL', '模型包含循环引用');
      seen.add(item);
      const output = item.map((entry) => normalize(entry, depth + 1));
      seen.delete(item);
      return output;
    }
    if (!item || typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype) {
      throw reasonError('INVALID_MODEL', '只允许 JSON object/array/scalar');
    }
    if (seen.has(item)) throw reasonError('INVALID_MODEL', '模型包含循环引用');
    seen.add(item);
    const output = {};
    for (const key of Object.keys(item).sort()) {
      if (DANGEROUS_KEYS.has(key)) throw reasonError('INVALID_MODEL', `危险字段: ${key}`);
      if (typeof item[key] === 'undefined') continue;
      output[key] = normalize(item[key], depth + 1);
    }
    seen.delete(item);
    return output;
  }
  return JSON.stringify(normalize(value, 0));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function semanticHash(value) {
  return sha256(canonicalStringify(value));
}

function compositeRunId(modelHash, exporterVersion, targetConfigHash) {
  for (const [name, value] of Object.entries({ modelHash, exporterVersion, targetConfigHash })) {
    if (typeof value !== 'string' || !value) throw reasonError('INVALID_RUN_ID_INPUT', `${name} 不能为空`);
  }
  return sha256(`${modelHash}\0${exporterVersion}\0${targetConfigHash}`);
}

function validatePrototypeModel(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) throw reasonError('INVALID_MODEL', 'model 必须为 object');
  canonicalStringify(model);
  if (String(model.schema_version) !== MODEL_SCHEMA_VERSION) throw reasonError('UNSUPPORTED_MODEL_VERSION', `schema_version 必须为 ${MODEL_SCHEMA_VERSION}`);
  if (!model.feature || !isId(model.feature.id)) throw reasonError('INVALID_MODEL', 'feature.id 非法');
  if (!Array.isArray(model.pages) || model.pages.length < 1 || model.pages.length > MAX_PAGES) {
    throw reasonError('INVALID_MODEL', `pages 数量必须为 1..${MAX_PAGES}`);
  }
  if (!model.sources || typeof model.sources !== 'object') throw reasonError('INVALID_MODEL', 'sources 不能为空');
  const ids = new Set();
  let nodeCount = 0;
  for (const page of model.pages) {
    validateEntity(page, 'page', ids);
    if (!Array.isArray(page.nodes)) throw reasonError('INVALID_MODEL', `page ${page.id} 缺少 nodes`);
    walkNodes(page.nodes, (node, depth) => {
      if (depth > MAX_DEPTH) throw reasonError('MODEL_LIMIT_EXCEEDED', `node depth 超过 ${MAX_DEPTH}`);
      validateEntity(node, 'node', ids);
      if (!NODE_TYPES.has(node.type)) throw reasonError('INVALID_MODEL', `node ${node.id} type 不支持: ${node.type}`);
      if (node.type === 'text' && typeof node.text !== 'string') throw reasonError('INVALID_MODEL', `text node ${node.id} 缺少 text`);
      for (const dim of ['x', 'y', 'width', 'height']) {
        if (node[dim] !== undefined && (!Number.isFinite(node[dim]) || node[dim] < 0)) {
          throw reasonError('INVALID_MODEL', `node ${node.id}.${dim} 必须为非负有限数`);
        }
      }
      nodeCount += 1;
      if (nodeCount > MAX_NODES) throw reasonError('MODEL_LIMIT_EXCEEDED', `node 数量超过 ${MAX_NODES}`);
    });
  }
  return { page_count: model.pages.length, node_count: nodeCount, model_hash: semanticHash(model) };
}

function validateProvenance(provenance, modelHash) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) throw reasonError('INVALID_PROVENANCE', 'provenance 必须为 object');
  canonicalStringify(provenance);
  if (String(provenance.schema_version) !== '1.0') throw reasonError('INVALID_PROVENANCE', 'provenance.schema_version 必须为 1.0');
  if (provenance.model_hash !== modelHash) throw reasonError('PROVENANCE_MISMATCH', 'provenance.model_hash 与 model 不一致');
  if (!Array.isArray(provenance.source_documents) || !provenance.source_documents.length) {
    throw reasonError('INVALID_PROVENANCE', 'source_documents 不能为空');
  }
  return true;
}

function loadPrototypeBundle(options) {
  const requestedWorkspace = path.resolve(options.workspace || process.cwd());
  const workspace = fs.realpathSync(requestedWorkspace);
  const feature = assertFeatureId(options.feature);
  const prototypeRoot = path.join(workspace, 'features', feature, 'prototype');
  const modelFile = path.resolve(options.model || path.join(prototypeRoot, 'model.json'));
  const provenanceFile = path.resolve(options.provenance || path.join(prototypeRoot, 'provenance.json'));
  assertContainedPathNoSymlink(workspace, prototypeRoot);
  assertContainedPathNoSymlink(prototypeRoot, modelFile);
  assertContainedPathNoSymlink(prototypeRoot, provenanceFile);
  if (!fs.existsSync(modelFile) || !fs.existsSync(provenanceFile)) {
    throw reasonError('BLOCKED_NO_BASELINE', `缺少 ${!fs.existsSync(modelFile) ? 'model.json' : 'provenance.json'}；请重新执行 /02C-HTML原型 ${feature}`);
  }
  const model = parseJsonFile(modelFile, 'INVALID_MODEL');
  const validated = validatePrototypeModel(model);
  const provenance = parseJsonFile(provenanceFile, 'INVALID_PROVENANCE');
  validateProvenance(provenance, validated.model_hash);
  return { workspace, feature, prototypeRoot, modelFile, provenanceFile, model, provenance, ...validated };
}

function createProvenance(model, sourceDocuments, generatorVersion = EXPORTER_VERSION) {
  const validated = validatePrototypeModel(model);
  const documents = [...new Set((sourceDocuments || []).map(String))].sort();
  if (!documents.length) throw reasonError('INVALID_PROVENANCE', 'sourceDocuments 不能为空');
  return {
    schema_version: '1.0',
    model_hash: validated.model_hash,
    generator: { name: 'open-workflow-kit', version: generatorVersion },
    source_documents: documents,
    requirement_ids: collectRequirementIds(model)
  };
}

function collectRequirementIds(model) {
  const values = new Set();
  for (const page of model.pages || []) {
    for (const id of page.requirement_ids || []) values.add(id);
    walkNodes(page.nodes || [], (node) => {
      for (const id of node.requirement_ids || []) values.add(id);
    });
  }
  return [...values].sort();
}

function walkNodes(nodes, visitor, depth = 1) {
  for (const node of nodes || []) {
    visitor(node, depth);
    if (node.children !== undefined && !Array.isArray(node.children)) throw reasonError('INVALID_MODEL', `node ${node.id || '?'} children 必须为 array`);
    if (node.children) walkNodes(node.children, visitor, depth + 1);
  }
}

function flattenNodes(model) {
  const output = [];
  for (const page of model.pages || []) walkNodes(page.nodes || [], (node) => output.push({ page_id: page.id, node }));
  return output;
}

function validateEntity(entity, kind, ids) {
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) throw reasonError('INVALID_MODEL', `${kind} 必须为 object`);
  if (!isId(entity.id)) throw reasonError('INVALID_MODEL', `${kind}.id 非法`);
  if (ids.has(entity.id)) throw reasonError('INVALID_MODEL', `重复 id: ${entity.id}`);
  ids.add(entity.id);
  if (typeof entity.name !== 'string' || !entity.name.trim()) throw reasonError('INVALID_MODEL', `${entity.id}.name 不能为空`);
}

function isId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function assertFeatureId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || value.includes('..')) throw reasonError('UNSAFE_PATH', `feature id 非法: ${value || '(empty)'}`);
  return value;
}

function assertContainedPathNoSymlink(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw reasonError('UNSAFE_PATH', `路径越界: ${target}`);
  let current = resolvedRoot;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw reasonError('SYMLINK_BOUNDARY', `拒绝 symlink: ${current}`); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
  return resolvedTarget;
}

function assertTarget(value) {
  if (!TARGETS.has(value)) throw reasonError('UNKNOWN_TARGET', `target 必须是 ${[...TARGETS].join(', ')}`);
  return value;
}

function parseJsonFile(file, code) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw reasonError(code, `${file}: ${error.message}`); }
}

function reasonError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  MODEL_SCHEMA_VERSION,
  EXPORTER_VERSION,
  TARGETS,
  canonicalStringify,
  sha256,
  semanticHash,
  compositeRunId,
  validatePrototypeModel,
  validateProvenance,
  loadPrototypeBundle,
  createProvenance,
  collectRequirementIds,
  walkNodes,
  flattenNodes,
  assertFeatureId,
  assertContainedPathNoSymlink,
  assertTarget,
  reasonError
};
