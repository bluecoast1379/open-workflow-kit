#!/usr/bin/env node
// Git 历史脱敏扫描：扫描全部提交历史中"新增行"里的凭证与私有词。
// 与 check-sanitized（只扫当前工作树）互补；两者共用 sanitize-patterns 模式。
// 输出对命中内容做掩码，不把疑似秘密回显到控制台或报告。
// 局限：轻量实现，适合中小仓库；超大仓库或更强规则建议配合 gitleaks / trufflehog。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  genericPatterns,
  isCheckedFile,
  loadBannedTerms,
  maskMatch,
  redactBannedTerms
} = require('./sanitize-patterns.cjs');

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(args.repo || path.resolve(__dirname, '..'));

const gitCheck = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
if (gitCheck.status !== 0) {
  console.error(`目标不是 Git 仓库，历史扫描跳过: ${repoRoot}`);
  process.exit(args.warnOnly ? 0 : 2);
}

const banned = loadBannedTerms(args.extraBanned);
const logArgs = ['-C', repoRoot, '-c', 'core.quotePath=false', 'log', '--all', '--no-color', '--pretty=format:@@COMMIT@@%h', '-p', '--unified=0'];
if (args.maxCommits) logArgs.splice(logArgs.indexOf('-p'), 0, `-n${args.maxCommits}`);
const log = spawnSync('git', logArgs, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
if (log.status !== 0) {
  console.error(`git log 执行失败: ${log.stderr || ''}`);
  process.exit(2);
}

let commit = '';
let file = '';
let safeFile = '';
let scannedAdds = 0;
let commitCount = 0;
const hits = [];

for (const raw of log.stdout.split('\n')) {
  if (raw.startsWith('@@COMMIT@@')) {
    commit = raw.slice('@@COMMIT@@'.length);
    commitCount++;
    continue;
  }
  if (raw.startsWith('+++ ')) {
    file = raw.replace(/^\+\+\+ (b\/)?/, '');
    safeFile = redactBannedTerms(file, banned);
    if (file !== '/dev/null') {
      for (const term of banned) {
        if (file.includes(term)) hits.push({ commit, file: safeFile, kind: '私有词路径', preview: 'path=***' });
      }
    }
    continue;
  }
  if (!raw.startsWith('+') || raw.startsWith('+++')) continue;
  if (file === '/dev/null') continue;
  if (!isCheckedFile(file)) continue;
  const line = raw.slice(1);
  scannedAdds++;
  for (const term of banned) {
    if (line.includes(term)) {
      hits.push({ commit, file: safeFile, kind: `私有词`, preview: maskMatch(line, term) });
    }
  }
  for (const pattern of genericPatterns) {
    const match = line.match(pattern.regex);
    if (match) {
      hits.push({ commit, file: safeFile, kind: pattern.name, preview: maskMatch(line, match[0]) });
    }
  }
}

if (args.report) {
  const report = [
    '# HISTORY_SANITIZATION_REPORT',
    '',
    `- 生成时间: ${new Date().toISOString()}`,
    '- 仓库: local repository (absolute path omitted)',
    `- 扫描提交数: ${commitCount}`,
    `- 扫描新增行数: ${scannedAdds}`,
    `- 通用模式: ${genericPatterns.map((p) => p.name).join(' | ')}`,
    `- 私有词表: ${banned.length ? `已加载（${banned.length} 条，内容不记录）` : '未加载'}`,
    `- 命中数: ${hits.length}`,
    `- 结论: ${hits.length ? (args.warnOnly ? 'WARN' : 'FAIL') : 'PASS'}`,
    '',
    ...hits.map((h) => `- ${h.commit} ${h.file} [${h.kind}] ${h.preview}`),
    ''
  ].join('\n');
  fs.writeFileSync(path.resolve(process.cwd(), args.report), report);
  console.log(`历史扫描报告已写入 ${args.report}`);
}

console.log(`历史扫描: ${commitCount} 个提交 / ${scannedAdds} 条新增行`);
if (hits.length) {
  console.error(`历史扫描发现 ${hits.length} 处命中（已掩码）:`);
  for (const h of hits.slice(0, 50)) console.error(`- ${h.commit} ${h.file} [${h.kind}] ${h.preview}`);
  if (hits.length > 50) console.error(`- …其余 ${hits.length - 50} 处见 --report 输出`);
  console.error('历史提交不可原地修改；确认为真实泄漏时需轮换凭证并评估历史重写（BFG/filter-repo）。');
  process.exit(args.warnOnly ? 0 : 1);
}
console.log('历史脱敏扫描通过。');

function parseArgs(argv) {
  const parsed = { extraBanned: '', report: '', warnOnly: false, maxCommits: 0, repo: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--extra-banned') parsed.extraBanned = argv[++i] || '';
    else if (arg === '--report') parsed.report = argv[++i] || '';
    else if (arg === '--warn-only') parsed.warnOnly = true;
    else if (arg === '--max-commits') parsed.maxCommits = parseInt(argv[++i] || '0', 10);
    else if (arg === '--repo') parsed.repo = argv[++i] || '';
    else if (arg === '--help' || arg === '-h') {
      console.log(`用法: node bin/check-history.cjs [--repo dir] [--extra-banned file] [--report file] [--warn-only] [--max-commits N]

扫描 Git 全历史新增行中的凭证模式与私有词（与 check-sanitized 同一套模式）。
命中内容输出前做掩码。轻量实现，适合中小仓库；更强扫描配合 gitleaks/trufflehog。`);
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return parsed;
}
