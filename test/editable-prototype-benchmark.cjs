#!/usr/bin/env node
const assert = require('assert');
const { spawnSync } = require('child_process');
const { performance } = require('perf_hooks');

const workerTarget = process.argv[2] === '--worker' ? process.argv[3] : '';
if (workerTarget) runWorker(workerTarget);
else runParent();

function runParent() {
  const results = {};
  for (const target of ['html', 'figma', 'sketch']) {
    results[target] = [];
    for (let run = 0; run < 10; run++) {
      const child = spawnSync(process.execPath, [__filename, '--worker', target], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      if (child.status !== 0) throw new Error(`${target} benchmark worker failed:\n${child.stdout}\n${child.stderr}`);
      results[target].push(JSON.parse(child.stdout));
    }
    assert.equal(new Set(results[target].map((entry) => entry.sha256)).size, 1, `${target} 10 次输出必须相同`);
    assert(Math.max(...results[target].map((entry) => entry.wall_ms)) <= 10000, `${target} 超过 10 秒`);
    assert(Math.max(...results[target].map((entry) => entry.peak_rss_mib)) <= 256, `${target} 峰值 RSS 超过 256 MiB`);
  }
  console.log(JSON.stringify({
    fixture: { pages: 20, nodes: 2000, embedded_asset_bytes: 10 * 1024 * 1024 }, deterministic_runs: 10,
    max_ms: Object.fromEntries(Object.entries(results).map(([target, rows]) => [target, Math.max(...rows.map((row) => row.wall_ms))])),
    peak_rss_mib: Object.fromEntries(Object.entries(results).map(([target, rows]) => [target, Math.max(...rows.map((row) => row.peak_rss_mib))]))
  }));
}

function runWorker(target) {
  const crypto = require('crypto');
  const { canonicalStringify, createProvenance, semanticHash } = require('../bin/prototype-core.cjs');
  const { renderHtml } = require('../bin/render-html-prototype.cjs');
  const { renderFigmaBundle } = require('../bin/render-figma-bundle.cjs');
  const { renderSketchDocument } = require('../bin/render-sketch-document.cjs');
  const model = makeBenchmarkModel();
  const modelHash = semanticHash(model);
  const provenance = createProvenance(model, ['features/benchmark/02-产品文档.md']);
  const bundle = { feature: 'benchmark', model, provenance, model_hash: modelHash };
  const start = performance.now();
  const output = target === 'html' ? Buffer.from(renderHtml(model, provenance))
    : target === 'figma' ? Buffer.from(canonicalStringify(renderFigmaBundle(bundle, { plugin_id: 'benchmark_local', run_id: '0'.repeat(64) }).artifacts))
    : renderSketchDocument(bundle).artifacts['prototype.sketch'];
  const wallMs = performance.now() - start;
  const peakRssMiB = process.resourceUsage().maxRSS / 1024;
  process.stdout.write(JSON.stringify({ target, wall_ms: wallMs, peak_rss_mib: peakRssMiB, sha256: crypto.createHash('sha256').update(output).digest('hex') }));
}

function makeBenchmarkModel() {
  const asset = Buffer.alloc(10 * 1024 * 1024, 7).toString('base64');
  return {
    schema_version: '1.0', feature: { id: 'benchmark', name: 'Benchmark' }, sources: { prd: 'features/benchmark/02-产品文档.md' },
    assets: [{ id: 'asset.1', mime_type: 'application/octet-stream', data: asset }], tokens: {}, components: [],
    pages: Array.from({ length: 20 }, (_, page) => ({ id: `page.${page}`, name: `Page ${page}`, nodes: Array.from({ length: 100 }, (_, node) => ({ id: `page.${page}.text.${node}`, name: `Text ${node}`, type: 'text', text: `Text ${page}-${node}`, x: node, y: node, width: 120, height: 24, font_size: 14 })) }))
  };
}
