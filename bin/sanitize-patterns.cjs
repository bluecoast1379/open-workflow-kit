// 脱敏扫描共享模块：check-sanitized（工作树）与 check-history（Git 历史）共用同一套模式，
// 保证两个扫描口径一致。修改模式时两个入口同时生效。
const fs = require('fs');
const path = require('path');

const genericPatterns = [
  { name: 'private key marker', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'access token assignment (quoted)', regex: /\b(access[_-]?token|api[_-]?key|secret[_-]?key|password)\b\s*[:=]\s*["'][^"']{8,}["']/i },
  // 无引号赋值形态；值需形似真实凭证：12 位以上且不以占位符号开头
  { name: 'access token assignment (bare)', regex: /\b(access[_-]?token|api[_-]?key|secret[_-]?key|client[_-]?secret|auth[_-]?token|password|passwd)\b\s*[:=]\s*(?!["'<{$*\[])[A-Za-z0-9_\-.\/+]{12,}/i },
  // URL 的 userinfo 段携带凭证（协议头之后、@ 之前出现 user 或 user:token）
  { name: 'credential in URL userinfo', regex: /[a-z][a-z0-9+.-]*:\/\/[^\/\s:@"'`)]+(:[^\/\s@"'`)]+)?@[a-z0-9][a-z0-9.-]+/i },
  { name: 'private intranet URL', regex: /https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|localhost|127\.0\.0\.1)/i }
];

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

const checkedBasenames = new Set([
  'Dockerfile',
  'Jenkinsfile',
  'CODEOWNERS',
  '.npmrc',
  '.yarnrc',
  '.netrc'
]);

function isCheckedFile(file) {
  const name = path.basename(file);
  const lower = name.toLowerCase();
  if (checkedBasenames.has(name)) return true;
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  return checkedExt.has(path.extname(lower));
}

function loadBannedTerms(file) {
  if (!file) return [];
  const full = path.resolve(process.cwd(), file);
  const text = fs.readFileSync(full, 'utf8');
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

// 把命中的敏感片段掩码后返回行预览，避免扫描器自身把疑似秘密打到控制台/报告。
function maskMatch(line, match) {
  const masked = line.replace(match, '***');
  return masked.length > 100 ? masked.slice(0, 100) + '…' : masked;
}

function redactBannedTerms(value, terms) {
  let redacted = String(value);
  for (const term of terms) redacted = redacted.split(term).join('***');
  return redacted;
}

module.exports = { genericPatterns, checkedExt, isCheckedFile, loadBannedTerms, maskMatch, redactBannedTerms };
