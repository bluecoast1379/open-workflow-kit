#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const kitRoot = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const banned = loadBannedTerms(args.extraBanned);
const genericPatterns = [
  { name: 'private key marker', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'access token assignment', regex: /\b(access[_-]?token|api[_-]?key|secret[_-]?key|password)\b\s*[:=]\s*["'][^"']{8,}["']/i },
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
  '.sh'
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

walk(kitRoot);

if (hits.length) {
  console.error('Sanitization check failed. Remove project-specific terms before external distribution.');
  for (const hit of hits) {
    console.error(`- ${hit.rel}:${hit.line} contains ${JSON.stringify(hit.term)}`);
  }
  process.exit(1);
}

console.log('Sanitization check passed.');

function parseArgs(argv) {
  const parsed = { extraBanned: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--extra-banned') parsed.extraBanned = argv[++i] || '';
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node bin/check-sanitized.cjs [--extra-banned file]

The built-in scan checks generic secret and private URL patterns. Use --extra-banned
with a private local denylist before external distribution. The private denylist
must not be committed into the starter kit.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
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
