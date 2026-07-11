#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadCommandManifest } = require('./command-manifest.cjs');

const root = path.resolve(parseRoot(process.argv.slice(2)) || inferWorkspaceRoot());
const manifestFile = path.join(root, 'workflow/core/command-manifest.yaml');
const commandsDir = path.join(root, 'workflow/core/commands');
const errors = [];
let manifest;

try {
  manifest = loadCommandManifest(manifestFile);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const expectedFiles = new Set(manifest.commands.map((command) => `${command.id}.md`));
const requiredHeadingGroups = [
  ['## Required Inputs', '## 必要输入'],
  ['## Execution Rules', '## 执行规则'],
  ['## Required Structure', '## 必要结构'],
  ['## Exit Criteria', '## 退出条件'],
  ['## Required Outputs', '## 必要输出']
];
const completionAwareCommands = new Set([
  'new-feature',
  'define-done',
  '01-需求讨论',
  '02-产品文档',
  '02B-UI设计',
  '02C-HTML原型',
  '03-技术架构',
  '03-06-研发准备',
  'deliver-until-done',
  '04-代码实现',
  '04A-前端代码实现',
  '04B-后端代码实现',
  '05-代码审查',
  '06-测试用例',
  '07-测试执行',
  '08-验收表格',
  '09-验收',
  '12-复盘总结',
  'workflow-status'
]);
for (const command of manifest.commands) {
  const file = path.join(commandsDir, `${command.id}.md`);
  if (!fs.existsSync(file)) {
    errors.push(`缺少 core command: ${command.id}.md`);
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(`# /${command.id}`)) errors.push(`${command.id}.md 缺少匹配标题`);
  for (const headings of requiredHeadingGroups) {
    if (!headings.some((heading) => content.includes(heading))) {
      errors.push(`${command.id}.md 缺少 ${headings.join(' 或 ')}`);
    }
  }
  if (completionAwareCommands.has(command.id) && !content.includes('completion/contract.yaml')) {
    errors.push(`${command.id}.md 未引用 completion/contract.yaml`);
  }
  if (command.implementation_gate && !content.includes('Completion Contract')) {
    errors.push(`${command.id}.md 实现命令未引用 Completion Contract`);
  }
}

for (const name of fs.readdirSync(commandsDir)) {
  if (!name.endsWith('.md') || name === 'README.md') continue;
  if (!expectedFiles.has(name)) errors.push(`core command 未登记到 manifest: ${name}`);
}

for (const requiredId of ['define-done', 'deliver-until-done']) {
  const command = manifest.commands.find((item) => item.id === requiredId);
  if (!command) errors.push(`命令清单缺少 ${requiredId}`);
}
const deliveryCommand = manifest.commands.find((item) => item.id === 'deliver-until-done');
if (deliveryCommand && !deliveryCommand.implementation_gate) {
  errors.push('deliver-until-done 必须是 implementation_gate');
}

if (errors.length) {
  console.error(`命令清单校验失败（${errors.length} 项）:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`命令清单校验通过：${manifest.commands.length} 个命令，结构、Completion Contract 与实现闸门映射一致。`);

function parseRoot(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') return argv[++i] || '';
    if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('用法: node bin/check-command-manifest.cjs [--root dir]');
      process.exit(0);
    }
    throw new Error(`未知参数: ${argv[i]}`);
  }
  return '';
}

function inferWorkspaceRoot() {
  const generatedManifest = path.resolve(__dirname, '../core/command-manifest.yaml');
  return fs.existsSync(generatedManifest) ? path.resolve(__dirname, '../..') : path.resolve(__dirname, '..');
}
