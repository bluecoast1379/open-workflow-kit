#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { canonicalStringify, flattenNodes, reasonError } = require('./prototype-core.cjs');
const { buildCoverage } = require('./prototype-coverage.cjs');

function renderAxureHandoff(bundle, config = {}) {
  const sourceRunId = config.source_figma_run_id;
  if (!/^[a-f0-9]{64}$/.test(sourceRunId || '')) throw reasonError('BLOCKED_FIGMA_BASELINE', 'Axure 需要 source_figma_run_id');
  const figmaReportFile = path.join(bundle.prototypeRoot, 'exports', 'figma', 'runs', sourceRunId, 'report.json');
  const evidenceFile = path.join(bundle.prototypeRoot, 'exports', 'figma', 'client-evidence', `${sourceRunId}.json`);
  if (!fs.existsSync(figmaReportFile)) throw reasonError('BLOCKED_FIGMA_BASELINE', '找不到 source Figma report');
  const report = JSON.parse(fs.readFileSync(figmaReportFile, 'utf8'));
  const evidence = fs.existsSync(evidenceFile) ? JSON.parse(fs.readFileSync(evidenceFile, 'utf8')) : {};
  if (report.model_hash !== bundle.model_hash || evidence.model_hash !== bundle.model_hash || evidence.client_validation_status !== 'PASS' || evidence.status === 'STALE') {
    throw reasonError('BLOCKED_FIGMA_BASELINE', 'Figma report 必须同 model hash 且 client PASS、evidence 非 STALE');
  }
  const mapped = [...bundle.model.pages.map((page) => page.id), ...flattenNodes(bundle.model).map(({ node }) => node.id)];
  const coverage = buildCoverage(bundle.model, 'axure', mapped, config.coverage_options);
  const handoff = {
    schema_version: '1.0', delivery_mode: 'BRIDGE_ONLY', source_figma_run_id: sourceRunId,
    model_hash: bundle.model_hash, native_rp: false, required_plugin: 'Axure plugin for Figma'
  };
  const readme = `# Axure Figma bridge handoff\n\n1. 在 Figma 中打开 report 指向的 committed root Frame。\n2. 选择需要交付的产品 page Frames。\n3. 运行官方 Axure plugin for Figma 并复制。\n4. 在 Axure RP 打开目标本地文件。\n5. 粘贴为 widgets/groups。\n6. 修改一个文本与一个布局属性。\n7. 保存、关闭并重开。\n8. 记录 Figma/Axure/plugin 版本、日期和脱敏证据。\n\n本产物不包含 native .rp；失败时回到同 model hash 的 Figma run 重试。\n`;
  return {
    artifacts: { 'axure-bridge.json': `${canonicalStringify(handoff)}\n`, 'README.md': readme },
    report: { delivery_mode: 'BRIDGE_ONLY', capability_ceiling: 'DEGRADED', capability_status: 'NOT_VERIFIED', source_figma_run_id: sourceRunId, native_rp: false, ...coverage }
  };
}

module.exports = { renderAxureHandoff };
