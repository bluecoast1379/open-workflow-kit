#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
// 与 check-history.cjs 共用同一套扫描模式，保证工作树与历史两个口径一致。
const {
  genericPatterns,
  checkedExt,
  isCheckedFile,
  loadBannedTerms,
  redactBannedTerms
} = require('./sanitize-patterns.cjs');

const kitRoot = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const scanRoot = path.resolve(args.root || kitRoot);
const banned = loadBannedTerms(args.extraBanned);

const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'target']);

const hits = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(scanRoot, full);
    const safeRel = redactBannedTerms(rel, banned);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      hits.push({ rel: safeRel, line: 1, kind: 'symbolic link is not allowed in public kit' });
      continue;
    }
    if (stat.isDirectory()) {
      if (!skipDirs.has(name)) walk(full);
      continue;
    }
    for (const term of banned) {
      if (rel.includes(term)) hits.push({ rel: safeRel, line: 1, kind: 'private denylist term in path' });
    }
    if (!isCheckedFile(name)) continue;
    scannedCount++;
    const text = fs.readFileSync(full, 'utf8');
    for (const term of banned) {
      const idx = text.indexOf(term);
      if (idx >= 0) {
        const line = text.slice(0, idx).split(/\r?\n/).length;
        hits.push({ rel: safeRel, line, kind: 'private denylist term' });
      }
    }
    for (const pattern of genericPatterns) {
      const match = text.match(pattern.regex);
      if (match && match.index != null) {
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        hits.push({ rel: safeRel, line, kind: pattern.name });
      }
    }
  }
}

let scannedCount = 0;
walk(scanRoot);

if (args.report) {
  // 可复查的扫描报告：只记录扫描范围、模式名称与结果，不含私有词表内容。
  const report = [
    '# SANITIZATION_REPORT',
    '',
    `- 生成时间: ${new Date().toISOString()}`,
    `- 扫描文件数: ${scannedCount}`,
    `- 扫描扩展名: ${[...checkedExt].join(', ')}`,
    `- 通用模式: ${genericPatterns.map((p) => p.name).join(' | ')}`,
    `- 私有词表: ${banned.length ? `已加载（${banned.length} 条，内容不记录）` : '未加载'}`,
    `- 命中数: ${hits.length}`,
    `- 结论: ${hits.length ? 'FAIL' : 'PASS'}`,
    '',
    '> 说明：本报告只证明"本次工作树扫描"的范围与结果；不覆盖 Git 历史。',
    '> 发布前还必须运行 npm run check:history；更强需求可再配合 gitleaks / trufflehog。',
    ''
  ].join('\n');
  fs.writeFileSync(path.resolve(process.cwd(), args.report), report);
  console.log(`报告已写入 ${args.report}`);
}

if (hits.length) {
  console.error('脱敏检查失败。对外分发前请移除项目特定词和敏感内容。');
  for (const hit of hits) {
    console.error(`- ${hit.rel}:${hit.line} 包含 ${JSON.stringify(hit.kind)}`);
  }
  process.exit(1);
}

console.log('脱敏检查通过。');

function parseArgs(argv) {
  const parsed = { extraBanned: '', report: '', root: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--extra-banned') parsed.extraBanned = argv[++i] || '';
    else if (arg === '--report') parsed.report = argv[++i] || '';
    else if (arg === '--root') parsed.root = argv[++i] || '';
    else if (arg === '--help' || arg === '-h') {
      console.log(`用法: node bin/check-sanitized.cjs [--root dir] [--extra-banned file] [--report file]

内置扫描会检查通用密钥和私有 URL 模式。对外分发前，请使用 --extra-banned
指定本地私有 denylist（不得提交进 kit）。--report 输出可复查的扫描报告
（不含词表内容）。--root 可指定扫描目录。本工具只扫描当前工作树，不扫描 Git 历史；历史扫描请
运行 npm run check:history，更强需求再配合 gitleaks / trufflehog。`);
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return parsed;
}
