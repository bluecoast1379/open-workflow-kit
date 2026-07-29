#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { canonicalStringify, createProvenance, semanticHash, validatePrototypeModel } = require('../bin/prototype-core.cjs');
const { buildCoverage } = require('../bin/prototype-coverage.cjs');
const { createOutputContext, commitExport, safeResolve } = require('../bin/prototype-output.cjs');
const { writeHtmlBundle } = require('../bin/render-html-prototype.cjs');
const { exportEditablePrototype } = require('../bin/export-editable-prototype.cjs');
const { listZipEntries } = require('../bin/deterministic-zip.cjs');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'owk-editable-'));
const feature = 'editable-fixture';
const prototypeRoot = path.join(workspace, 'features', feature, 'prototype');
fs.mkdirSync(prototypeRoot, { recursive: true });
const model = fixtureModel(2, 4);
const modelFile = path.join(workspace, 'model-input.json');
fs.writeFileSync(modelFile, `${canonicalStringify(model)}\n`);

const validated = validatePrototypeModel(model);
assert.equal(validated.page_count, 2);
assert.equal(validated.node_count, 8);
assert.equal(validated.model_hash, semanticHash(JSON.parse(JSON.stringify(model))));
writeHtmlBundle({ workspace, feature, model: modelFile, sources: ['features/editable-fixture/02-产品文档.md', 'features/editable-fixture/02B-UI设计.md', 'features/editable-fixture/completion/contract.yaml'] });
const htmlFile = path.join(prototypeRoot, 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
for (const marker of ['data-state="normal"', 'state-empty', 'state-error', 'state-loading', 'state-permission', '@media(max-width:320px)', 'focus-visible']) assert(html.includes(marker), `HTML 缺少 ${marker}`);
for (const forbidden of ['https://', 'http://', '<script src=', 'fetch(']) assert(!html.includes(forbidden), `HTML 出现外部依赖 ${forbidden}`);

const figma = exportEditablePrototype({ workspace, feature, target: 'figma', plugin_id: 'owk_local_fixture' });
const figmaCode = fs.readFileSync(path.join(figma.runDir, 'figma', 'code.js'), 'utf8');
const figmaManifest = JSON.parse(fs.readFileSync(path.join(figma.runDir, 'figma', 'manifest.json'), 'utf8'));
const figmaReport = JSON.parse(fs.readFileSync(path.join(figma.runDir, 'report.json'), 'utf8'));
assert(!figmaCode.includes('createPage('));
assert(!figmaCode.includes('fetch('));
assert(!figmaCode.includes('eval('));
assert.deepEqual(figmaManifest.networkAccess.allowedDomains, ['none']);
assert.equal(figmaManifest.ui, undefined);
assert.equal(figmaReport.committed_root_count, 1);
assert.equal(figmaReport.entity_coverage.unknown, 0);
assert.equal(figmaReport.property_coverage.unknown, 0);
assert.equal(figmaReport.client_validation_status, 'NOT_RUN');
assert.equal(figmaReport.capability_status, 'NOT_VERIFIED');
assert(fs.readFileSync(path.join(prototypeRoot, 'exports', 'figma', '.gitignore'), 'utf8').includes('runs/*/figma/manifest.json'));

const repeatedFigma = exportEditablePrototype({ workspace, feature, target: 'figma', plugin_id: 'owk_local_fixture' });
assert.equal(repeatedFigma.runId, figma.runId);
assert.equal(fs.readdirSync(path.join(prototypeRoot, 'exports', 'figma', 'runs')).length, 1);
assert.equal(fs.readdirSync(path.join(prototypeRoot, 'exports', 'figma', 'attempts')).length, 2);
const figmaCurrentBeforeFailure = fs.readFileSync(path.join(prototypeRoot, 'exports', 'figma', 'current.json'));
const failingConfig = path.join(workspace, 'figma-failing-config.json');
fs.writeFileSync(failingConfig, `${canonicalStringify({ plugin_id: 'owk_local_fixture', coverage_options: { unknown_properties: [`${model.pages[0].nodes[0].id}:text`] } })}\n`);
expectError(() => exportEditablePrototype({ workspace, feature, target: 'figma', config: failingConfig }), 'UNKNOWN_COVERAGE');
assert(fs.readFileSync(path.join(prototypeRoot, 'exports', 'figma', 'current.json')).equals(figmaCurrentBeforeFailure));
assert.equal(JSON.parse(fs.readFileSync(path.join(prototypeRoot, 'exports', 'figma', 'latest-attempt.json'), 'utf8')).status, 'FAIL');

const sketch = exportEditablePrototype({ workspace, feature, target: 'sketch' });
const sketchBytes = fs.readFileSync(path.join(sketch.runDir, 'prototype.sketch'));
const sketchEntries = listZipEntries(sketchBytes);
assert.deepEqual(sketchEntries.map((entry) => entry.name).sort(), sketchEntries.map((entry) => entry.name));
for (const required of ['document.json', 'meta.json', 'user.json']) assert(sketchEntries.some((entry) => entry.name === required));
const repeatedSketch = exportEditablePrototype({ workspace, feature, target: 'sketch' });
assert.equal(repeatedSketch.runId, sketch.runId);
assert(fs.readFileSync(path.join(repeatedSketch.runDir, 'prototype.sketch')).equals(sketchBytes));

expectError(() => exportEditablePrototype({ workspace, feature, target: 'axure', source_figma_run_id: figma.runId }), 'BLOCKED_FIGMA_BASELINE');
const evidenceDir = path.join(prototypeRoot, 'exports', 'figma', 'client-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, `${figma.runId}.json`), `${canonicalStringify({ schema_version: '1.0', run_id: figma.runId, model_hash: validated.model_hash, client_validation_status: 'PASS', status: 'CURRENT', tool: 'Figma stable fixture', evidence: 'redacted-local-fixture' })}\n`);
const axure = exportEditablePrototype({ workspace, feature, target: 'axure', source_figma_run_id: figma.runId });
const axureReport = JSON.parse(fs.readFileSync(path.join(axure.runDir, 'report.json'), 'utf8'));
assert.equal(axureReport.delivery_mode, 'BRIDGE_ONLY');
assert.equal(axureReport.capability_ceiling, 'DEGRADED');
assert.equal(axureReport.capability_status, 'NOT_VERIFIED');
assert.equal(axureReport.native_rp, false);
assert(!fs.readdirSync(axure.runDir).some((name) => name.endsWith('.rp')));

const bundle = require('../bin/prototype-core.cjs').loadPrototypeBundle({ workspace, feature });
const context = createOutputContext(bundle, 'sketch', 'failure-fixture', {});
const previousCurrent = fs.readFileSync(path.join(prototypeRoot, 'exports', 'sketch', 'current.json'));
expectError(() => commitExport(context, { '../escape': 'x' }, {}), 'UNSAFE_PATH');
assert(fs.readFileSync(path.join(prototypeRoot, 'exports', 'sketch', 'current.json')).equals(previousCurrent));

const mapped = [model.pages[0].id, ...model.pages[0].nodes.map((node) => node.id)];
const partial = buildCoverage(model, 'figma', mapped);
assert(partial.entity_coverage.unknown > 0);
assert(partial.blocking_unknown_count > 0);
expectError(() => buildCoverage(model, 'figma', mapped, { unknown_properties: [`${model.pages[0].nodes[0].id}:text`] }), null, (coverage) => coverage.blocking_unknown_count > 0);

expectError(() => safeResolve(prototypeRoot, '..', 'escape'), 'UNSAFE_PATH');
const symlinkRoot = path.join(workspace, 'features', 'symlink-fixture');
fs.mkdirSync(symlinkRoot, { recursive: true });
fs.symlinkSync(os.tmpdir(), path.join(symlinkRoot, 'prototype'), process.platform === 'win32' ? 'junction' : undefined);
const symlinkModel = path.join(workspace, 'symlink-model.json');
fs.writeFileSync(symlinkModel, `${canonicalStringify({ ...fixtureModel(1, 1), feature: { id: 'symlink-fixture', name: 'Symlink' } })}\n`);
expectError(() => writeHtmlBundle({ workspace, feature: 'symlink-fixture', model: symlinkModel, sources: ['features/symlink-fixture/02-产品文档.md'] }), 'SYMLINK_BOUNDARY');

const legacyFeature = 'legacy-html';
const legacyRoot = path.join(workspace, 'features', legacyFeature, 'prototype');
fs.mkdirSync(legacyRoot, { recursive: true });
fs.writeFileSync(path.join(legacyRoot, 'index.html'), '<!doctype html><title>legacy</title>');
expectError(() => exportEditablePrototype({ workspace, feature: legacyFeature, target: 'sketch' }), 'BLOCKED_NO_BASELINE');
assert(fs.readFileSync(path.join(legacyRoot, 'index.html'), 'utf8').includes('legacy'));

const unknownTarget = spawnSync(process.execPath, [path.join(__dirname, '../bin/export-editable-prototype.cjs'), '--workspace', workspace, '--feature', feature, '--target', 'unknown'], { encoding: 'utf8' });
assert.notEqual(unknownTarget.status, 0);
assert(`${unknownTarget.stdout}${unknownTarget.stderr}`.includes('UNKNOWN_TARGET'));

scanGeneratedForSensitiveData(prototypeRoot);
console.log('Editable prototype test passed: model/HTML/Figma/Sketch/Axure/state/coverage/security/legacy cases.');

function fixtureModel(pageCount, nodesPerPage) {
  return {
    schema_version: '1.0', feature: { id: feature, name: 'Editable fixture' },
    sources: { prd: 'features/editable-fixture/02-产品文档.md', ui: 'features/editable-fixture/02B-UI设计.md', completion_contract: 'features/editable-fixture/completion/contract.yaml' },
    tokens: { color_primary: '#2563eb' }, components: [{ id: 'component.primary-button', name: 'Primary button' }],
    pages: Array.from({ length: pageCount }, (_, pageIndex) => ({
      id: `page.${pageIndex + 1}`, name: `Page ${pageIndex + 1}`, route: `page-${pageIndex + 1}`, width: 1024, height: 768,
      requirement_ids: [`REQ-${String(pageIndex + 1).padStart(3, '0')}`],
      nodes: Array.from({ length: nodesPerPage }, (_, nodeIndex) => nodeIndex % 2 === 0 ? {
        id: `page.${pageIndex + 1}.text.${nodeIndex + 1}`, name: `Text ${nodeIndex + 1}`, type: 'text', text: `Visible text ${pageIndex + 1}-${nodeIndex + 1}`,
        x: 16, y: 16 + nodeIndex * 48, width: 320, height: 32, font_size: 14, font_family: 'Inter', requirement_ids: ['AC-001']
      } : {
        id: `page.${pageIndex + 1}.component.${nodeIndex + 1}`, name: `Component ${nodeIndex + 1}`, type: 'component', major: true,
        x: 16, y: 16 + nodeIndex * 48, width: 160, height: 40, radius: 8, layout: 'horizontal', requirement_ids: ['AC-002']
      })
    }))
  };
}

function expectError(fn, code, validateResult) {
  let thrown;
  try { const result = fn(); if (validateResult) assert(validateResult(result)); }
  catch (error) { thrown = error; }
  if (validateResult && !thrown) return;
  assert(thrown, `expected error ${code || ''}`);
  if (code) assert.equal(thrown.code, code);
}

function scanGeneratedForSensitiveData(root) {
  const forbidden = [/(?:password|secret|token)\s*[:=]\s*[^\s"']+/i, /https?:\/\/(?!open-workflow-kit\.local)/i];
  visit(root);
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && !file.endsWith('.sketch')) {
        const text = fs.readFileSync(file, 'utf8');
        for (const pattern of forbidden) assert(!pattern.test(text), `sensitive pattern in ${file}`);
      }
    }
  }
}

module.exports = { fixtureModel };
