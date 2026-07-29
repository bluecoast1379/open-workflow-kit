#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { EXPORTER_VERSION, assertTarget, loadPrototypeBundle, reasonError } = require('./prototype-core.cjs');
const { createOutputContext, commitExport, recordBlocked, recordFailure, safeResolve, ensureSafeDirectory } = require('./prototype-output.cjs');
const { renderFigmaBundle } = require('./render-figma-bundle.cjs');
const { renderSketchDocument } = require('./render-sketch-document.cjs');
const { renderAxureHandoff } = require('./render-axure-handoff.cjs');

function exportEditablePrototype(options) {
  const target = assertTarget(options.target);
  const bundle = loadPrototypeBundle(options);
  const config = loadConfig(options, target);
  const context = createOutputContext(bundle, target, EXPORTER_VERSION, publicConfig(config));
  config.run_id = context.runId;
  try {
    if (target === 'figma') ensureFigmaIgnore(context.targetRoot);
    const rendered = target === 'figma' ? renderFigmaBundle(bundle, config)
      : target === 'sketch' ? renderSketchDocument(bundle, config)
      : renderAxureHandoff(bundle, config);
    return commitExport(context, rendered.artifacts, rendered.report);
  } catch (error) {
    if (String(error.code || '').startsWith('BLOCKED_')) {
      recordBlocked(context, error.code, error.message, recoveryFor(error.code, bundle.feature));
      error.recorded = true;
    }
    if (!error.recorded) {
      recordFailure(context, error);
      error.recorded = true;
    }
    throw error;
  }
}

function loadConfig(options, target) {
  const config = {};
  if (options.config) Object.assign(config, JSON.parse(fs.readFileSync(path.resolve(options.config), 'utf8')));
  if (options.plugin_id) config.plugin_id = options.plugin_id;
  if (options.source_figma_run_id) config.source_figma_run_id = options.source_figma_run_id;
  config.target = target;
  return config;
}

function publicConfig(config) {
  const output = { ...config };
  if (output.plugin_id) output.plugin_id_hash = require('./prototype-core.cjs').semanticHash(output.plugin_id);
  delete output.plugin_id;
  delete output.coverage_options;
  delete output.run_id;
  return output;
}

function ensureFigmaIgnore(targetRoot) {
  ensureSafeDirectory(path.dirname(path.dirname(targetRoot)), targetRoot);
  fs.mkdirSync(targetRoot, { recursive: true });
  const file = safeResolve(targetRoot, '.gitignore');
  const required = 'runs/*/figma/manifest.json\nlocal-config.json\n';
  if (!fs.existsSync(file)) fs.writeFileSync(file, required);
  else {
    const current = fs.readFileSync(file, 'utf8');
    if (!current.includes('runs/*/figma/manifest.json')) fs.appendFileSync(file, required);
  }
}

function recoveryFor(code, feature) {
  if (code === 'BLOCKED_NO_BASELINE') return [`重新执行 /02C-HTML原型 ${feature} 生成 model.json 与 provenance.json。`];
  if (code === 'BLOCKED_LOCAL_PLUGIN_ID') return ['在 exports/figma/local-config.json（已忽略）写入 plugin_id，然后使用 --config 重试。'];
  if (code === 'BLOCKED_FIGMA_BASELINE') return ['完成同 model hash 的 Figma client 验证，并传入其 source_figma_run_id。'];
  return ['修复前置条件后重试。'];
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--workspace') options.workspace = argv[++index];
    else if (arg === '--feature') options.feature = argv[++index];
    else if (arg === '--target') options.target = argv[++index];
    else if (arg === '--config') options.config = argv[++index];
    else if (arg === '--plugin-id') options.plugin_id = argv[++index];
    else if (arg === '--source-figma-run-id') options.source_figma_run_id = argv[++index];
    else throw reasonError('INVALID_ARGUMENT', `未知参数: ${arg}`);
  }
  if (!options.feature || !options.target) throw reasonError('INVALID_ARGUMENT', '必须提供 --feature 与 --target');
  return options;
}

if (require.main === module) {
  try {
    const result = exportEditablePrototype(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ status: 'PASS', target: result.report.target, run_id: result.runId, run_dir: result.runDir }));
  } catch (error) {
    console.error(`${error.code || 'EXPORT_FAILED'}: ${error.message}`);
    process.exit(error.recorded ? 2 : 1);
  }
}

module.exports = { exportEditablePrototype, parseArgs, publicConfig };
