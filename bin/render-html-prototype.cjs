#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { canonicalStringify, createProvenance, loadPrototypeBundle, validatePrototypeModel, reasonError, assertFeatureId } = require('./prototype-core.cjs');
const { atomicWriteJson, ensureSafeDirectory } = require('./prototype-output.cjs');

function renderHtml(model, provenance) {
  const validated = validatePrototypeModel(model);
  if (!provenance || provenance.model_hash !== validated.model_hash) throw reasonError('PROVENANCE_MISMATCH', 'HTML provenance 与 model hash 不一致');
  const routes = model.pages.map((page, index) => `<a href="#/${escapeAttr(page.route || page.id)}" data-route="#/${escapeAttr(page.route || page.id)}"${index === 0 ? ' class="active"' : ''}>${escapeHtml(page.name)}</a>`).join('');
  const screens = model.pages.map((page, index) => {
    const route = `#/${page.route || page.id}`;
    const normal = renderNodes(page.nodes || []);
    return `<section class="screen${index === 0 ? ' active' : ''}" id="screen-${escapeAttr(page.id)}" data-route="${escapeAttr(route)}" data-state="normal" tabindex="-1">
<div class="anno">${escapeHtml((page.requirement_ids || []).join(', ') || 'No requirement mapping')}</div>
<div class="state-panel state-normal">${normal}</div>
<div class="state-panel state-empty"><div class="card empty" role="status">暂无数据</div></div>
<div class="state-panel state-error"><div class="card error-box" role="alert">加载失败。请重试。</div></div>
<div class="state-panel state-loading"><div class="card loading-box" role="status" aria-live="polite">加载中…</div></div>
<div class="state-panel state-permission"><div class="card permission-box" role="alert">没有访问权限。请联系管理员。</div></div>
</section>`;
  }).join('\n');
  const firstRoute = `#/${model.pages[0].route || model.pages[0].id}`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(model.feature.name || model.feature.id)} · HTML prototype</title>
<!-- model-hash:${validated.model_hash}; source:${escapeHtml((provenance.source_documents || []).join(','))} -->
<style>${renderCss(model.tokens || {})}</style></head><body>
<a class="skip" href="#prototype-main">跳到主要内容</a>
<nav class="proto-bar" aria-label="原型页面"><strong>${escapeHtml(model.feature.name || model.feature.id)}</strong>${routes}<span class="states" aria-label="页面状态">${['normal','empty','error','loading','permission'].map((state) => `<button type="button" data-state="${state}" aria-pressed="${state === 'normal' ? 'true' : 'false'}"${state === 'normal' ? ' class="on"' : ''}>${state}</button>`).join('')}</span></nav>
<main id="prototype-main">${screens}</main>
<script>(function(){var initial=${JSON.stringify(firstRoute)};function render(){var hash=location.hash||initial;document.querySelectorAll('.screen').forEach(function(el){el.classList.toggle('active',el.dataset.route===hash)});document.querySelectorAll('[data-route]').forEach(function(el){var active=el.dataset.route===hash;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});}addEventListener('hashchange',render);document.querySelectorAll('[data-state]').forEach(function(btn){if(btn.tagName!=='BUTTON')return;btn.addEventListener('click',function(){document.querySelectorAll('.states button').forEach(function(item){item.classList.remove('on');item.setAttribute('aria-pressed','false')});btn.classList.add('on');btn.setAttribute('aria-pressed','true');var screen=document.querySelector('.screen.active');if(screen)screen.dataset.state=btn.dataset.state;});});render();})();</script>
</body></html>\n`;
}

function renderNodes(nodes) {
  return nodes.map((node) => {
    const children = renderNodes(node.children || []);
    const attrs = ` data-source-id="${escapeAttr(node.id)}" data-node-type="${escapeAttr(node.type)}"`;
    if (node.type === 'text') return `<p${attrs}>${escapeHtml(node.text)}</p>`;
    if (node.type === 'button') return `<button type="button" class="btn"${attrs}>${escapeHtml(node.text || node.name)}</button>`;
    return `<div class="${node.type === 'frame' ? 'frame' : 'card'}"${attrs}>${children || escapeHtml(node.name)}</div>`;
  }).join('');
}

function renderCss(tokens) {
  const defaults = {
    color_primary: '#2563eb', color_text: '#1f2937', color_muted: '#6b7280', color_border: '#e5e7eb', color_bg: '#f9fafb', color_surface: '#ffffff', color_danger: '#b91c1c',
    font_body: '14px', font_title: '18px', space_1: '4px', space_2: '8px', space_3: '12px', space_4: '16px', space_6: '24px', radius: '8px'
  };
  const t = { ...defaults, ...tokens };
  return `:root{--primary:${safeCss(t.color_primary)};--text:${safeCss(t.color_text)};--muted:${safeCss(t.color_muted)};--border:${safeCss(t.color_border)};--bg:${safeCss(t.color_bg)};--surface:${safeCss(t.color_surface)};--danger:${safeCss(t.color_danger)};--body:${safeCss(t.font_body)};--title:${safeCss(t.font_title)};--s1:${safeCss(t.space_1)};--s2:${safeCss(t.space_2)};--s3:${safeCss(t.space_3)};--s4:${safeCss(t.space_4)};--s6:${safeCss(t.space_6)};--radius:${safeCss(t.radius)}}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:var(--body);color:var(--text);background:var(--bg)}.skip{position:absolute;left:-9999px}.skip:focus{left:var(--s2);top:var(--s2);z-index:100;background:var(--surface);padding:var(--s2)}.proto-bar{position:sticky;top:0;display:flex;align-items:center;gap:var(--s2);padding:var(--s2) var(--s4);background:var(--text);color:var(--surface);overflow:auto}.proto-bar a{color:var(--surface);padding:var(--s1) var(--s2)}.proto-bar a.active{outline:2px solid var(--primary)}.states{display:flex;gap:var(--s1);margin-left:auto}.states button,.btn{border:1px solid var(--primary);border-radius:var(--radius);background:var(--primary);color:var(--surface);padding:var(--s2) var(--s4)}button:focus-visible,a:focus-visible{outline:3px solid var(--primary);outline-offset:2px}.screen{display:none;max-width:960px;margin:var(--s6) auto;padding:0 var(--s4)}.screen.active{display:block}.state-panel{display:none}.screen[data-state=normal] .state-normal,.screen[data-state=empty] .state-empty,.screen[data-state=error] .state-error,.screen[data-state=loading] .state-loading,.screen[data-state=permission] .state-permission{display:block}.anno,.card,.frame{padding:var(--s4);margin-bottom:var(--s3);border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.anno{color:var(--muted);border-left:3px solid var(--primary)}.error-box{color:var(--danger)}@media(max-width:320px){.proto-bar{align-items:flex-start;flex-wrap:wrap}.states{width:100%;margin-left:0}.screen{margin:var(--s3) auto;padding:0 var(--s2)}.card,.frame{overflow-wrap:anywhere}}`;
}

function writeHtmlBundle(options) {
  const workspace = fs.realpathSync(path.resolve(options.workspace || process.cwd()));
  const feature = assertFeatureId(options.feature);
  const prototypeRoot = path.join(workspace, 'features', feature, 'prototype');
  ensureSafeDirectory(workspace, path.join(workspace, 'features', feature));
  ensureSafeDirectory(path.join(workspace, 'features', feature), prototypeRoot);
  fs.mkdirSync(prototypeRoot, { recursive: true });
  let model;
  if (options.model) {
    model = JSON.parse(fs.readFileSync(path.resolve(options.model), 'utf8'));
    validatePrototypeModel(model);
    atomicWriteJson(path.join(prototypeRoot, 'model.json'), model);
    const provenance = createProvenance(model, options.sources || [`features/${feature}/02-产品文档.md`, `features/${feature}/02B-UI设计.md`, `features/${feature}/completion/contract.yaml`]);
    atomicWriteJson(path.join(prototypeRoot, 'provenance.json'), provenance);
  }
  const bundle = loadPrototypeBundle({ workspace, feature });
  const html = renderHtml(bundle.model, bundle.provenance);
  const file = path.join(prototypeRoot, 'index.html');
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, html);
  fs.renameSync(temp, file);
  return { file, model_hash: bundle.model_hash };
}

function parseArgs(argv) {
  const result = { sources: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--workspace') result.workspace = argv[++index];
    else if (arg === '--feature') result.feature = argv[++index];
    else if (arg === '--model') result.model = argv[++index];
    else if (arg === '--source') result.sources.push(argv[++index]);
    else throw new Error(`未知参数: ${arg}`);
  }
  if (!result.feature) throw new Error('缺少 --feature');
  return result;
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char])); }
function escapeAttr(value) { return escapeHtml(value); }
function safeCss(value) { const text = String(value); if (!/^[#(),.%\-\w\s]+$/.test(text)) throw reasonError('INVALID_TOKEN', `unsafe CSS token: ${text}`); return text; }

if (require.main === module) {
  try { console.log(JSON.stringify(writeHtmlBundle(parseArgs(process.argv.slice(2))))); }
  catch (error) { console.error(`${error.code || 'HTML_EXPORT_FAILED'}: ${error.message}`); process.exit(1); }
}

module.exports = { renderHtml, writeHtmlBundle, renderNodes, renderCss };
