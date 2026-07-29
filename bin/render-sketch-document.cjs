#!/usr/bin/env node
const crypto = require('crypto');
const { canonicalStringify, flattenNodes } = require('./prototype-core.cjs');
const { buildCoverage } = require('./prototype-coverage.cjs');
const { createDeterministicZip } = require('./deterministic-zip.cjs');

const NAMESPACE = Buffer.from('52c346e2fbb85d15a0e44f3d56f81152', 'hex');

function renderSketchDocument(bundle, config = {}) {
  const mapped = [...bundle.model.pages.map((page) => page.id), ...flattenNodes(bundle.model).map(({ node }) => node.id)];
  const coverage = buildCoverage(bundle.model, 'sketch', mapped, config.coverage_options);
  const pages = {};
  const pageRefs = [];
  for (const page of bundle.model.pages) {
    const objectID = uuidV5(`${bundle.model.schema_version}:${page.id}`);
    pageRefs.push({ _class: 'MSJSONFileReference', _ref_class: 'MSImmutablePage', _ref: `pages/${objectID}` });
    pages[`pages/${objectID}.json`] = `${canonicalStringify({
      _class: 'page', do_objectID: objectID, name: page.name,
      layers: [{ _class: 'artboard', do_objectID: uuidV5(`${bundle.model.schema_version}:${page.id}:artboard`), name: page.name,
        frame: { _class: 'rect', constrainProportions: false, height: page.height || 768, width: page.width || 1024, x: 0, y: 0 },
        layers: (page.nodes || []).map((node) => sketchLayer(node, bundle.model.schema_version)) }]
    })}\n`;
  }
  const entries = {
    'meta.json': `${canonicalStringify({ app: 'open-workflow-kit', appVersion: '1.0.0', version: 136, compatibilityVersion: 99, model_hash: bundle.model_hash })}\n`,
    'document.json': `${canonicalStringify({ _class: 'document', do_objectID: uuidV5(`${bundle.model.schema_version}:${bundle.feature}:document`), pages: pageRefs })}\n`,
    'user.json': `${canonicalStringify({ document: { pageListHeight: 110, pageListCollapsed: 0 } })}\n`,
    ...pages
  };
  const archive = createDeterministicZip(entries);
  const readme = `# Sketch local bundle\n\n1. 在 macOS 上启动本合同记录版本的 Sketch。\n2. 打开 prototype.sketch。\n3. 确认页面与 artboard 数量等于 report。\n4. 选择一个 artboard。\n5. 修改一个 text layer。\n6. 修改一个 shape 或 symbol。\n7. 保存并关闭。\n8. 重开并记录工具版本、日期和脱敏证据。\n\n打开失败时保留 previous current，并按 report 的 reason code 重建。\n`;
  return {
    artifacts: { 'prototype.sketch': archive, 'README.md': readme },
    report: { delivery_mode: 'NATIVE_FILE', capability_ceiling: 'SUPPORTED', sketch_schema_version: 136, archive_method: 'STORE', ...coverage }
  };
}

function sketchLayer(node, schemaVersion) {
  const objectID = uuidV5(`${schemaVersion}:${node.id}`);
  const frame = { _class: 'rect', constrainProportions: false, height: node.height || 40, width: node.width || 160, x: node.x || 0, y: node.y || 0 };
  if (node.type === 'text') return { _class: 'text', do_objectID: objectID, name: node.name, frame, attributedString: { _class: 'attributedString', string: node.text, attributes: [] } };
  return { _class: node.type === 'component' ? 'symbolMaster' : node.type === 'rectangle' ? 'rectangle' : 'group', do_objectID: objectID, name: node.name, frame, layers: (node.children || []).map((child) => sketchLayer(child, schemaVersion)) };
}

function uuidV5(name) {
  const digest = crypto.createHash('sha1').update(NAMESPACE).update(Buffer.from(name)).digest().subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`.toUpperCase();
}

module.exports = { renderSketchDocument, sketchLayer, uuidV5 };
