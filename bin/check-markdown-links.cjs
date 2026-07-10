#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(parseRoot(process.argv.slice(2)) || inferWorkspaceRoot());
const ignoredDirs = new Set(['.git', 'node_modules', 'dist']);
const files = [];
const errors = [];

walk(root);
for (const file of files) checkFile(file);

if (errors.length) {
  console.error(`Markdown 链接校验失败（${errors.length} 项）:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Markdown 链接校验通过：${files.length} 个文件的本地相对链接均可解析。`);

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    errors.push(`${path.relative(root, dir) || '.'}: 无法读取目录 (${error.message})`);
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(full);
  }
}

function checkFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let inFence = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+['"][^'"]*['"])?\)/g)) {
      const raw = match[1].replace(/^<|>$/g, '');
      if (!raw || raw.startsWith('#') || /^(?:https?:|mailto:|app:|data:)/i.test(raw)) continue;
      const withoutAnchor = raw.split('#')[0].split('?')[0];
      if (!withoutAnchor) continue;
      let decoded;
      try {
        decoded = decodeURIComponent(withoutAnchor);
      } catch {
        errors.push(`${relative(file)}:${index + 1}: 链接编码非法 ${raw}`);
        continue;
      }
      if (path.isAbsolute(decoded)) {
        errors.push(`${relative(file)}:${index + 1}: 不得使用本地绝对链接 ${raw}`);
        continue;
      }
      const target = path.resolve(path.dirname(file), decoded);
      if (!fs.existsSync(target)) errors.push(`${relative(file)}:${index + 1}: 目标不存在 ${raw}`);
    }
  }
}

function relative(file) {
  return path.relative(root, file) || '.';
}

function parseRoot(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') return argv[++i] || '';
    if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('用法: node bin/check-markdown-links.cjs [--root dir]');
      process.exit(0);
    }
    throw new Error(`未知参数: ${argv[i]}`);
  }
  return '';
}

function inferWorkspaceRoot() {
  const generatedCore = path.resolve(__dirname, '../core');
  return fs.existsSync(generatedCore) ? path.resolve(__dirname, '../..') : path.resolve(__dirname, '..');
}
