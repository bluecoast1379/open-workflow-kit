#!/usr/bin/env node
// 校验 HTML 原型的视觉取值全部来自 :root design tokens。
// 规则：<style> 内除 :root{} token 定义块与注释外，以及所有行内 style 属性中，
// 不允许出现硬编码颜色（#hex / rgb / rgba）与非零 px 数值。
// 配合 /02C-HTML原型 与 ui-baseline-reviewer 的 tokens 反查卡关使用。
const fs = require('fs');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('用法: node bin/check-prototype-tokens.cjs <file.html> [...]');
  process.exit(2);
}

let violations = 0;

function flag(file, kind, snippet) {
  violations++;
  console.error(`- ${file}: ${kind}: ${snippet.trim().slice(0, 100)}`);
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PX = /(?<![\w-])[1-9][0-9]*px\b/;
const RGB = /\brgba?\(/;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');

  // <style> 块：剔除注释与 :root token 定义块后逐行检查
  const styles = [...text.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const outsideRoot = styles
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/:root\s*\{[\s\S]*?\n\}/g, '');
  for (const line of outsideRoot.split('\n')) {
    if (HEX.test(line)) flag(file, '<style> 内 :root 外硬编码颜色', line);
    if (PX.test(line)) flag(file, '<style> 内 :root 外硬编码 px', line);
    if (RGB.test(line)) flag(file, '<style> 内 :root 外硬编码 rgb/rgba', line);
  }

  // 行内 style 属性
  for (const m of text.matchAll(/style="([^"]*)"/g)) {
    const s = m[1];
    if (HEX.test(s) || PX.test(s) || RGB.test(s)) flag(file, '行内 style 硬编码', s);
  }
}

if (violations) {
  console.error(`prototype tokens 校验失败：${violations} 处硬编码。视觉取值必须来自 tokens（CSS 变量）。`);
  process.exit(1);
}
console.log('prototype tokens 校验通过。');
