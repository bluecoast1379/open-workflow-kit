#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const kitRoot = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const banned = loadBannedTerms(args.extraBanned);
const genericPatterns = [
  { name: 'private key marker', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'access token assignment (quoted)', regex: /\b(access[_-]?token|api[_-]?key|secret[_-]?key|password)\b\s*[:=]\s*["'][^"']{8,}["']/i },
  // 无引号赋值形态（API_KEY=xxxx / secret_key: xxxx）；值需形似真实凭证：12 位以上且不以占位符号开头
  { name: 'access token assignment (bare)', regex: /\b(access[_-]?token|api[_-]?key|secret[_-]?key|client[_-]?secret|auth[_-]?token)\b\s*[:=]\s*(?!["'<{$*\[])[A-Za-z0-9_\-.\/+]{12,}/i },
  // URL 的 userinfo 段携带凭证（协议头之后、@ 之前出现 user 或 user:token）
  { name: 'credential in URL userinfo', regex: /[a-z][a-z0-9+.-]*:\/\/[^\/\s:@"'`)]+(:[^\/\s@"'`)]+)?@[a-z0-9][a-z0-9.-]+/i },
  { name: 'private intranet URL', regex: /https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|localhost|127\.0\.0\.1)/i }
];

const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'target']);
const checkedExt = new Set([
  '.md',
  '.json',
  '.cjs',
  '.js',
  '.yaml',
  '.yml',
  '.txt',
  '.sh',
  '.html',
  '.mdc',
  '.env',
  '.properties',
  '.xml',
  '.toml',
  '.pem',
  '.key'
]);

const hits = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(kitRoot, full);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!skipDirs.has(name)) walk(full);
      continue;
    }
    if (!checkedExt.has(path.extname(name))) continue;
    scannedCount++;
    const text = fs.readFileSync(full, 'utf8');
    for (const term of banned) {
      const idx = text.indexOf(term);
      if (idx >= 0) {
        const line = text.slice(0, idx).split(/\r?\n/).length;
        hits.push({ rel, line, term });
      }
    }
    for (const pattern of genericPatterns) {
      const match = text.match(pattern.regex);
      if (match && match.index != null) {
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        hits.push({ rel, line, term: pattern.name });
      }
    }
  }
}

let scannedCount = 0;
walk(kitRoot);

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
    '> 发布前建议另跑 gitleaks / trufflehog 类工具扫描完整提交历史。',
    ''
  ].join('\n');
  fs.writeFileSync(path.resolve(process.cwd(), args.report), report);
  console.log(`报告已写入 ${args.report}`);
}

if (hits.length) {
  console.error('脱敏检查失败。对外分发前请移除项目特定词和敏感内容。');
  for (const hit of hits) {
    console.error(`- ${hit.rel}:${hit.line} 包含 ${JSON.stringify(hit.term)}`);
  }
  process.exit(1);
}

console.log('脱敏检查通过。');

function parseArgs(argv) {
  const parsed = { extraBanned: '', report: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--extra-banned') parsed.extraBanned = argv[++i] || '';
    else if (arg === '--report') parsed.report = argv[++i] || '';
    else if (arg === '--help' || arg === '-h') {
      console.log(`用法: node bin/check-sanitized.cjs [--extra-banned file] [--report file]

内置扫描会检查通用密钥和私有 URL 模式。对外分发前，请使用 --extra-banned
指定本地私有 denylist（不得提交进 kit）。--report 输出可复查的扫描报告
（不含词表内容）。本工具只扫描当前工作树，不扫描 Git 历史；历史扫描请
配合 gitleaks / trufflehog 类工具。`);
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return parsed;
}

function loadBannedTerms(file) {
  if (!file) return [];
  const full = path.resolve(process.cwd(), file);
  const text = fs.readFileSync(full, 'utf8');
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}
