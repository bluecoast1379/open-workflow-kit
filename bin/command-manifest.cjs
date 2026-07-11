const fs = require('fs');

const REQUIRED_FIELDS = [
  'id',
  'skill_slug',
  'title',
  'description',
  'argument_hint',
  'implementation_gate'
];

function loadCommandManifest(file) {
  const source = fs.readFileSync(file, 'utf8');
  const manifest = parseCommandManifest(source, file);
  validateCommandManifest(manifest, file);
  return manifest;
}

function parseCommandManifest(source, file = 'command-manifest.yaml') {
  const manifest = { schemaVersion: '', commandCount: NaN, commands: [] };
  const seenRootFields = new Set();
  let current = null;
  let inCommands = false;

  source.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (!line.trim() || line.trimStart().startsWith('#')) return;

    let match = line.match(/^schema_version:\s*(.+)$/);
    if (match) {
      assertUniqueField(seenRootFields, 'schema_version', file, lineNumber);
      manifest.schemaVersion = parseScalar(match[1], file, lineNumber);
      return;
    }
    match = line.match(/^command_count:\s*(.+)$/);
    if (match) {
      assertUniqueField(seenRootFields, 'command_count', file, lineNumber);
      manifest.commandCount = parseScalar(match[1], file, lineNumber);
      return;
    }
    if (/^commands:\s*$/.test(line)) {
      assertUniqueField(seenRootFields, 'commands', file, lineNumber);
      inCommands = true;
      return;
    }
    if (!inCommands) throw syntaxError(file, lineNumber, 'commands 之前存在未知字段');

    match = line.match(/^  - ([a-z_]+):\s*(.+)$/);
    if (match) {
      if (match[1] !== 'id') throw syntaxError(file, lineNumber, '每个 command 的首字段必须是 id');
      current = {};
      manifest.commands.push(current);
      current[match[1]] = parseScalar(match[2], file, lineNumber);
      return;
    }
    match = line.match(/^    ([a-z_]+):\s*(.+)$/);
    if (match && current) {
      if (!REQUIRED_FIELDS.includes(match[1])) throw syntaxError(file, lineNumber, `未知 command 字段: ${match[1]}`);
      if (match[1] in current) throw syntaxError(file, lineNumber, `重复 command 字段: ${match[1]}`);
      current[match[1]] = parseScalar(match[2], file, lineNumber);
      return;
    }
    throw syntaxError(file, lineNumber, `无法解析: ${line.trim()}`);
  });

  return manifest;
}

function assertUniqueField(seen, field, file, lineNumber) {
  if (seen.has(field)) throw syntaxError(file, lineNumber, `重复根字段: ${field}`);
  seen.add(field);
}

function validateCommandManifest(manifest, file = 'command-manifest.yaml') {
  const errors = [];
  if (manifest.schemaVersion !== '1.0') errors.push('schema_version 必须为 "1.0"');
  if (!Number.isInteger(manifest.commandCount) || manifest.commandCount < 1) {
    errors.push('command_count 必须为正整数');
  }
  if (manifest.commandCount !== manifest.commands.length) {
    errors.push(`command_count=${manifest.commandCount}，实际 commands=${manifest.commands.length}`);
  }

  const ids = new Set();
  const slugs = new Set();
  for (const [index, command] of manifest.commands.entries()) {
    const label = `commands[${index}]`;
    for (const field of REQUIRED_FIELDS) {
      if (!(field in command)) errors.push(`${label} 缺少 ${field}`);
    }
    if (typeof command.id !== 'string' || !command.id || /[\\/]/.test(command.id) || command.id.includes('..')) {
      errors.push(`${label}.id 不是安全文件名`);
    } else if (ids.has(command.id)) {
      errors.push(`重复 id: ${command.id}`);
    } else {
      ids.add(command.id);
    }
    if (typeof command.skill_slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(command.skill_slug)) {
      errors.push(`${label}.skill_slug 必须是小写 ASCII kebab-case`);
    } else if (slugs.has(command.skill_slug)) {
      errors.push(`重复 skill_slug: ${command.skill_slug}`);
    } else {
      slugs.add(command.skill_slug);
    }
    for (const field of ['title', 'description', 'argument_hint']) {
      if (typeof command[field] !== 'string' || !command[field].trim()) errors.push(`${label}.${field} 必须为非空字符串`);
    }
    if (typeof command.implementation_gate !== 'boolean') {
      errors.push(`${label}.implementation_gate 必须为 boolean`);
    }
  }

  const gateIds = manifest.commands.filter((item) => item.implementation_gate).map((item) => item.id).sort();
  const expectedGateIds = [
    '04-代码实现',
    '04A-前端代码实现',
    '04B-后端代码实现',
    'deliver-until-done'
  ].sort();
  if (JSON.stringify(gateIds) !== JSON.stringify(expectedGateIds)) {
    errors.push(`implementation_gate 只能标记 ${expectedGateIds.join(', ')}`);
  }
  if (errors.length) throw new Error(`${file} 校验失败:\n- ${errors.join('\n- ')}`);
}

function parseScalar(raw, file, lineNumber) {
  try {
    return JSON.parse(raw);
  } catch {
    throw syntaxError(file, lineNumber, '标量必须使用 JSON 字符串、数字或 boolean 格式');
  }
}

function syntaxError(file, lineNumber, message) {
  return new Error(`${file}:${lineNumber} ${message}`);
}

module.exports = {
  loadCommandManifest,
  parseCommandManifest,
  validateCommandManifest
};
