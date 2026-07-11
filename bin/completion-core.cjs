const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');

const EVIDENCE_STATUSES = Object.freeze([
  'PASS',
  'FAIL',
  'BLOCKED',
  'NOT_RUN',
  'STALE',
  'WAIVED'
]);
const TERMINAL_SUCCESS_STATUSES = new Set(['PASS', 'WAIVED']);
const HUMAN_ORACLE_TYPES = new Set(['manual']);
const AUTOMATABLE_ORACLE_TYPES = new Set(['command', 'file', 'api', 'browser', 'metric']);
const FORBIDDEN_SHELL_COMMANDS = new Set([
  'sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh',
  'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh'
]);
const HARD_BLOCKED_EXECUTABLES = new Set([
  'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'ftp', 'nc', 'netcat',
  'sudo', 'su', 'rm', 'dd', 'mkfs', 'mount', 'umount', 'chmod', 'chown',
  'docker', 'kubectl', 'helm', 'terraform', 'wrangler', 'gh', 'glab',
  'npx', 'pnpx', 'bunx', 'env'
]);
const READ_ONLY_GIT_SUBCOMMANDS = new Set(['status', 'diff', 'show', 'log', 'rev-parse', 'ls-files', 'grep']);
const RUNTIME_SOURCE_PATTERNS = [
  /^features\/[^/]+\/completion\/evidence(?:\/|$)/,
  /^features\/[^/]+\/completion\/run-state\.ya?ml$/,
  /^features\/[^/]+\/completion\/decision-packet\.json$/,
  /^features\/[^/]+\/completion\/done-cockpit\.html$/
];
const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const REQUIRED_STOP_CONDITIONS = new Set(['budget_exhausted', 'scope_violation', 'contract_change_required', 'approval_required', 'repeated_failure', 'no_progress', 'execution_permit_expired']);
const FORBIDDEN_ORACLE_ENV_NAMES = new Set(['NODE_OPTIONS', 'NODE_PATH', 'PYTHONPATH', 'PYTHONHOME', 'RUBYOPT', 'PERL5OPT', 'BASH_ENV', 'ENV', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH']);
const AMBIGUOUS_TERMS = [
  '流畅', '快速', '友好', '稳定', '高性能', '低延迟', '尽可能', '适当', '合理',
  '易用', '美观', '自然', '智能', '及时', '高可用', '高质量', '显著', '明显',
  'seamless', 'fast', 'user-friendly', 'robust', 'performant', 'scalable',
  'intuitive', 'responsive', 'reliable', 'appropriate', 'reasonable', 'quickly'
];
const CONTRACT_ROOT_FIELDS = new Set(['schema_version', 'feature', 'policy_packs', 'policy_pack_exceptions', 'enabled_capabilities', 'objective', 'outcome', 'stakeholders', 'approvers', 'operational_owner', 'glossary', 'organization', 'assumptions', 'decisions', 'requirements', 'risks', 'scope', 'domain', 'quality_budgets', 'unknowns', 'release', 'acceptance', 'autonomy', 'governance']);
const EVIDENCE_ROOT_FIELDS = ['schema_version', 'sequence', 'previous_hash', 'entry_hash', 'observed_at', 'criterion_id', 'status', 'contract_hash', 'source_fingerprint', 'environment_fingerprint', 'executor', 'evidence_manifest', 'attestation', 'artifacts', 'waiver', 'reason', 'result'];
const CHECKPOINT_STATE_FIELDS = ['schema_version', 'contract_hash', 'source_fingerprint', 'environment_fingerprint', 'findings_fingerprint', 'baseline_source_fingerprint', 'base_commit', 'iteration', 'command_executions', 'cost_units', 'ledger_entry_count', 'ledger_head_hash', 'execution_permit_id', 'execution_permit_hash', 'status', 'automation_complete', 'accepted', 'blocker_count', 'failure_fingerprint', 'same_failure_count', 'no_progress_count', 'elapsed_ms', 'started_at', 'updated_at', 'checkpoint_attestation'];

function parseData(text, source = '<memory>') {
  const input = String(text || '').replace(/^\uFEFF/, '');
  if (!input.trim()) throw new Error(`${source}: 文件为空`);
  let parsedJson;
  let jsonParsed = false;
  try {
    parsedJson = JSON.parse(input);
    jsonParsed = true;
  } catch {
    /* 不是 JSON 时再尝试受限 YAML。 */
  }
  if (jsonParsed) {
    assertSafeDataKeys(parsedJson, source);
    return parsedJson;
  }
  try {
    const parsed = parseYamlSubset(input, source);
    assertSafeDataKeys(parsed, source);
    return parsed;
  } catch (yamlError) {
    throw new Error(`${source}: 既不是有效 JSON，也不是支持的 YAML 子集: ${yamlError.message}`);
  }
}

function assertSafeDataKeys(value, source = '<data>', seen = new Set(), location = '$') {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new Error(`${source}: ${location} 包含循环引用`);
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (DANGEROUS_OBJECT_KEYS.has(key)) throw new Error(`${source}: ${location}.${key} 为禁止的对象键`);
    assertSafeDataKeys(value[key], source, seen, `${location}.${key}`);
  }
  seen.delete(value);
}

function loadData(file) {
  const resolved = path.resolve(file);
  return parseData(fs.readFileSync(resolved, 'utf8'), resolved);
}

function stripYamlComment(value) {
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (double && escaped) {
      escaped = false;
      continue;
    }
    if (double && char === '\\') {
      escaped = true;
      continue;
    }
    if (!double && char === "'") single = !single;
    else if (!single && char === '"') double = !double;
    else if (!single && !double && char === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value.trimEnd();
}

function findYamlColon(value) {
  let square = 0;
  let curly = 0;
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (double && escaped) {
      escaped = false;
      continue;
    }
    if (double && char === '\\') {
      escaped = true;
      continue;
    }
    if (!double && char === "'") single = !single;
    else if (!single && char === '"') double = !double;
    else if (!single && !double) {
      if (char === '[') square++;
      else if (char === ']') square--;
      else if (char === '{') curly++;
      else if (char === '}') curly--;
      else if (char === ':' && square === 0 && curly === 0) return i;
    }
  }
  return -1;
}

function splitInline(value) {
  const items = [];
  let start = 0;
  let square = 0;
  let curly = 0;
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (double && escaped) {
      escaped = false;
      continue;
    }
    if (double && char === '\\') {
      escaped = true;
      continue;
    }
    if (!double && char === "'") single = !single;
    else if (!single && char === '"') double = !double;
    else if (!single && !double) {
      if (char === '[') square++;
      else if (char === ']') square--;
      else if (char === '{') curly++;
      else if (char === '}') curly--;
      else if (char === ',' && square === 0 && curly === 0) {
        items.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  items.push(value.slice(start).trim());
  return items.filter((item) => item.length > 0);
}

function parseYamlScalar(raw, source, lineNumber) {
  const value = stripYamlComment(raw).trim();
  if (value === '') return undefined;
  if (/[\u0000]/.test(value)) throw new Error(`${source}:${lineNumber} 包含 NUL`);
  if (/^(?:&|\*|!|<<:)/.test(value)) throw new Error(`${source}:${lineNumber} 不支持 YAML anchor、alias、tag 或 merge key`);
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch { throw new Error(`${source}:${lineNumber} 双引号字符串无效`); }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) throw new Error(`${source}:${lineNumber} 单引号字符串未闭合`);
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value === 'null' || value === 'Null' || value === 'NULL' || value === '~') return null;
  if (/^(?:true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${source}:${lineNumber} 数字超出范围`);
    return number;
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const body = value.slice(1, -1).trim();
    return body ? splitInline(body).map((item) => parseYamlScalar(item, source, lineNumber)) : [];
  }
  if (value.startsWith('{') && value.endsWith('}')) {
    const body = value.slice(1, -1).trim();
    const result = {};
    if (!body) return result;
    for (const item of splitInline(body)) {
      const colon = findYamlColon(item);
      if (colon < 1) throw new Error(`${source}:${lineNumber} inline map 字段无效`);
      const key = parseYamlKey(item.slice(0, colon), source, lineNumber);
      if (Object.hasOwn(result, key)) throw new Error(`${source}:${lineNumber} 重复字段 ${key}`);
      result[key] = parseYamlScalar(item.slice(colon + 1), source, lineNumber);
    }
    return result;
  }
  return value;
}

function parseYamlKey(raw, source, lineNumber) {
  const value = raw.trim();
  if (!value) throw new Error(`${source}:${lineNumber} 字段名为空`);
  const key = (value.startsWith('"') || value.startsWith("'"))
    ? parseYamlScalar(value, source, lineNumber)
    : value;
  if (typeof key !== 'string' || !key || /[\u0000\r\n]/.test(key)) throw new Error(`${source}:${lineNumber} 字段名无效`);
  if (key === '<<') throw new Error(`${source}:${lineNumber} 不支持 YAML merge key`);
  if (DANGEROUS_OBJECT_KEYS.has(key)) throw new Error(`${source}:${lineNumber} 禁止的对象键 ${key}`);
  return key;
}

function parseYamlSubset(text, source = '<yaml>') {
  const rawLines = String(text).split(/\r?\n/);
  const lines = [];
  for (let index = 0; index < rawLines.length; index++) {
    const raw = rawLines[index];
    if (/^\s*\t/.test(raw) || /^ *[^ ]/.test(raw.replace(/^ +/, '')) && raw.slice(0, raw.search(/\S|$/)).includes('\t')) {
      throw new Error(`${source}:${index + 1} 缩进不得使用 tab`);
    }
    const withoutComment = stripYamlComment(raw);
    if (!withoutComment.trim() || withoutComment.trimStart().startsWith('---') || withoutComment.trimStart() === '...') continue;
    const indentText = withoutComment.match(/^ */)[0];
    if (indentText.length % 2 !== 0) throw new Error(`${source}:${index + 1} 缩进必须是 2 的倍数`);
    lines.push({ indent: indentText.length, content: withoutComment.slice(indentText.length), number: index + 1, rawIndex: index });
  }
  if (!lines.length) throw new Error(`${source}: YAML 为空`);

  function parseBlock(position, indent) {
    if (position >= lines.length) throw new Error(`${source}: 缺少嵌套内容`);
    if (lines[position].indent !== indent) throw new Error(`${source}:${lines[position].number} 非法缩进`);
    const isSequence = /^(?:-|-[ ])/.test(lines[position].content);
    const result = isSequence ? [] : {};
    let cursor = position;
    while (cursor < lines.length && lines[cursor].indent === indent) {
      const line = lines[cursor];
      if (isSequence) {
        if (!line.content.startsWith('-')) throw new Error(`${source}:${line.number} 同一层级不能混用 map 与 sequence`);
        const rest = line.content.slice(1).trimStart();
        if (!rest) {
          if (cursor + 1 >= lines.length || lines[cursor + 1].indent <= indent) {
            result.push(null);
            cursor++;
          } else {
            const nested = parseBlock(cursor + 1, lines[cursor + 1].indent);
            result.push(nested.value);
            cursor = nested.next;
          }
          continue;
        }
        const colon = findYamlColon(rest);
        if (colon > 0) {
          const item = {};
          const key = parseYamlKey(rest.slice(0, colon), source, line.number);
          const tail = rest.slice(colon + 1).trim();
          if (tail === '|' || tail === '>') throw new Error(`${source}:${line.number} sequence 内暂不支持 block scalar`);
          if (tail) item[key] = parseYamlScalar(tail, source, line.number);
          else if (cursor + 1 < lines.length && lines[cursor + 1].indent > indent + 1) {
            const nested = parseBlock(cursor + 1, lines[cursor + 1].indent);
            item[key] = nested.value;
            cursor = nested.next - 1;
          } else item[key] = null;
          cursor++;
          if (cursor < lines.length && lines[cursor].indent > indent) {
            const nested = parseBlock(cursor, lines[cursor].indent);
            if (!nested.value || Array.isArray(nested.value) || typeof nested.value !== 'object') {
              throw new Error(`${source}:${lines[cursor].number} sequence map 后必须继续 map 字段`);
            }
            for (const [nestedKey, nestedValue] of Object.entries(nested.value)) {
              if (Object.hasOwn(item, nestedKey)) throw new Error(`${source}:${lines[cursor].number} 重复字段 ${nestedKey}`);
              item[nestedKey] = nestedValue;
            }
            cursor = nested.next;
          }
          result.push(item);
          continue;
        }
        result.push(parseYamlScalar(rest, source, line.number));
        cursor++;
      } else {
        if (line.content.startsWith('-')) throw new Error(`${source}:${line.number} 同一层级不能混用 map 与 sequence`);
        const colon = findYamlColon(line.content);
        if (colon < 1) throw new Error(`${source}:${line.number} map 字段缺少冒号`);
        const key = parseYamlKey(line.content.slice(0, colon), source, line.number);
        if (Object.hasOwn(result, key)) throw new Error(`${source}:${line.number} 重复字段 ${key}`);
        const tail = line.content.slice(colon + 1).trim();
        if (tail === '|' || tail === '>') {
          const folded = tail === '>';
          const chunks = [];
          const baseIndent = cursor + 1 < lines.length ? lines[cursor + 1].indent : indent + 2;
          cursor++;
          while (cursor < lines.length && lines[cursor].indent > indent) {
            chunks.push(lines[cursor].content);
            cursor++;
          }
          result[key] = folded ? chunks.join(' ') : chunks.join('\n') + (chunks.length ? '\n' : '');
          continue;
        }
        if (tail) {
          result[key] = parseYamlScalar(tail, source, line.number);
          cursor++;
        } else if (cursor + 1 < lines.length && lines[cursor + 1].indent > indent) {
          const nested = parseBlock(cursor + 1, lines[cursor + 1].indent);
          result[key] = nested.value;
          cursor = nested.next;
        } else {
          result[key] = null;
          cursor++;
        }
      }
    }
    if (cursor < lines.length && lines[cursor].indent > indent) {
      throw new Error(`${source}:${lines[cursor].number} 无父字段的额外缩进`);
    }
    return { value: result, next: cursor };
  }

  const parsed = parseBlock(0, lines[0].indent);
  if (parsed.next !== lines.length) throw new Error(`${source}:${lines[parsed.next].number} 无法解析剩余内容`);
  return parsed.value;
}

function stringifyYaml(value, indent = 0) {
  const prefix = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${prefix}[]`;
    return value.map((item) => {
      if (item && typeof item === 'object') return `${prefix}-\n${stringifyYaml(item, indent + 2)}`;
      return `${prefix}- ${yamlScalar(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return `${prefix}{}`;
    return entries.map(([key, item]) => {
      const encodedKey = /^[A-Za-z0-9_.-]+$/.test(key) ? key : JSON.stringify(key);
      if (item && typeof item === 'object') return `${prefix}${encodedKey}:\n${stringifyYaml(item, indent + 2)}`;
      return `${prefix}${encodedKey}: ${yamlScalar(item)}`;
    }).join('\n');
  }
  return `${prefix}${yamlScalar(value)}`;
}

function yamlScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(String(value));
}

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON 不支持非有限数字');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('canonical JSON 不支持循环引用');
    seen.add(value);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (DANGEROUS_OBJECT_KEYS.has(key)) throw new Error(`canonical JSON 禁止对象键 ${key}`);
      const item = value[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
        throw new Error(`canonical JSON 不支持字段 ${key} 的值类型`);
      }
      result[key] = canonicalize(item, seen);
    }
    seen.delete(value);
    return result;
  }
  throw new Error(`canonical JSON 不支持 ${typeof value}`);
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function hmacSha256(value, key) {
  const normalized = normalizeAttestationKey(key);
  return `hmac-sha256:${crypto.createHmac('sha256', normalized).update(value).digest('hex')}`;
}

function normalizeAttestationKey(key) {
  const value = Buffer.isBuffer(key) ? key : Buffer.from(String(key || ''), 'utf8');
  if (value.length < 32) throw new Error('evidence attestation key 至少需要 32 bytes');
  return value;
}

function sanitizeEnvironmentSecrets(environment, secrets) {
  const secretValues = new Set((secrets || []).filter((item) => item !== undefined && item !== null).map((item) => Buffer.isBuffer(item) ? item.toString('utf8') : String(item)));
  const output = Object.create(null);
  for (const [name, value] of Object.entries(environment || {})) {
    if (!secretValues.has(String(value))) output[name] = value;
  }
  return output;
}

function buildOracleEnvironment(environment, allowlist, secrets) {
  const selected = Object.create(null);
  for (const name of allowlist || []) {
    if (FORBIDDEN_ORACLE_ENV_NAMES.has(name) || /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|API_KEY)/i.test(name)) continue;
    if (Object.hasOwn(environment || {}, name)) selected[name] = environment[name];
  }
  return sanitizeEnvironmentSecrets(selected, secrets);
}

function authorizeAutonomyAction(autonomy, action) {
  const forbidden = new Set(autonomy.forbidden_actions || []);
  const askBefore = new Set(autonomy.ask_before || []);
  const allowed = new Set(autonomy.allowed_actions || []);
  if (forbidden.has(action) || forbidden.has('*')) return { allowed: false, reason: 'ACTION_FORBIDDEN_BY_CONTRACT' };
  if (askBefore.has(action) || askBefore.has('*')) return { allowed: false, reason: 'ACTION_REQUIRES_EXTERNAL_APPROVAL' };
  if (!allowed.has(action)) return { allowed: false, reason: 'ACTION_NOT_ALLOWED_BY_CONTRACT' };
  return { allowed: true, reason: null };
}

function hashCanonical(value) {
  return sha256(canonicalStringify(value));
}

function evidenceAttestationBody(entry) {
  const copy = { ...entry };
  for (const field of ['attestation', 'entry_hash']) delete copy[field];
  return copy;
}

function signEvidenceEntry(entry, key, keyId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(keyId || ''))) throw new Error('attestation key_id 必须为安全标识符');
  const signature = hmacSha256(canonicalStringify(evidenceAttestationBody(entry)), key);
  return { algorithm: 'hmac-sha256', key_id: keyId, signature };
}

function resolveAttestationKey(attestationKeys, keyId) {
  if (!attestationKeys || !keyId) return null;
  if (typeof attestationKeys === 'function') return attestationKeys(keyId) || null;
  if (attestationKeys instanceof Map) return attestationKeys.get(keyId) || null;
  if (typeof attestationKeys === 'object') return Object.hasOwn(attestationKeys, keyId) ? attestationKeys[keyId] : null;
  return null;
}

function verifyEvidenceAttestation(entry, attestationKeys) {
  const attestation = entry && entry.attestation;
  if (!isPlainObject(attestation) || attestation.algorithm !== 'hmac-sha256' || !nonEmptyString(attestation.key_id) || !/^hmac-sha256:[a-f0-9]{64}$/.test(String(attestation.signature || ''))) {
    return { valid: false, reason: 'ATTESTATION_MISSING_OR_INVALID' };
  }
  const key = resolveAttestationKey(attestationKeys, attestation.key_id);
  if (!key) return { valid: false, reason: 'ATTESTATION_KEY_UNAVAILABLE', key_id: attestation.key_id };
  let expected;
  try { expected = hmacSha256(canonicalStringify(evidenceAttestationBody(entry)), key); }
  catch { return { valid: false, reason: 'ATTESTATION_KEY_INVALID', key_id: attestation.key_id }; }
  const actualBuffer = Buffer.from(attestation.signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const valid = actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  return { valid, reason: valid ? null : 'ATTESTATION_SIGNATURE_INVALID', key_id: attestation.key_id };
}

function normalizePublicKeyPem(value) {
  const text = String(value || '').trim();
  if (!text.includes('BEGIN PUBLIC KEY')) throw new Error('execution public key 必须是 PEM SubjectPublicKeyInfo');
  return `${text}\n`;
}

function publicKeyFingerprint(publicKeyPem) {
  return sha256(normalizePublicKeyPem(publicKeyPem));
}

function executionPermitBody(permit) {
  const copy = { ...permit };
  delete copy.signature;
  return { domain: 'open-workflow-kit/execution-permit/v1', permit: copy };
}

function signExecutionPermit(payload, privateKeyPem) {
  assertSafeDataKeys(payload, 'execution permit');
  const permit = { ...payload };
  delete permit.signature;
  const signature = crypto.sign(null, Buffer.from(canonicalStringify(executionPermitBody(permit))), crypto.createPrivateKey(String(privateKeyPem)));
  return { ...permit, signature: { algorithm: 'ed25519', value: signature.toString('base64') } };
}

function verifyExecutionPermit(permit, publicKeyPem, expected) {
  if (!isPlainObject(permit) || permit.schema_version !== '1.0' || !nonEmptyString(permit.permit_id) || !nonEmptyString(permit.key_id)) throw new Error('execution permit 格式无效');
  assertOnlyKeys(permit, ['schema_version', 'permit_id', 'key_id', 'issued_at', 'expires_at', 'contract_hash', 'environment_fingerprint', 'findings_fingerprint', 'scope_hash', 'base_commit', 'command_spec_hashes', 'executable_fingerprints', 'budgets', 'nonce', 'signature'], 'execution permit');
  if (isPlainObject(permit.signature)) assertOnlyKeys(permit.signature, ['algorithm', 'value'], 'execution permit signature');
  if (isPlainObject(permit.budgets)) assertOnlyKeys(permit.budgets, ['max_iterations', 'max_elapsed_ms', 'max_command_executions', 'max_cost_units', 'cost_per_execution', 'max_diff_lines'], 'execution permit budgets');
  if (!/^[a-f0-9]{32,}$/.test(String(permit.nonce || ''))) throw new Error('execution permit nonce 无效');
  if (!isPlainObject(permit.signature) || permit.signature.algorithm !== 'ed25519' || !/^[A-Za-z0-9+/]+={0,2}$/.test(String(permit.signature.value || ''))) throw new Error('execution permit signature 格式无效');
  if (permit.key_id !== expected.keyId) throw new Error('execution permit key_id 不被 Contract 信任');
  if (publicKeyFingerprint(publicKeyPem) !== expected.publicKeyFingerprint) throw new Error('execution public key fingerprint 与冻结 Contract 不匹配');
  const issuedAt = Date.parse(permit.issued_at);
  const expiresAt = Date.parse(permit.expires_at);
  const now = Number.isFinite(expected.nowMs) ? expected.nowMs : Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 5 * 60000 || expiresAt <= now) throw new Error('execution permit 时间窗口无效或已过期');
  if (expiresAt - issuedAt > expected.maxValidityMinutes * 60000) throw new Error('execution permit 有效期超过 Contract 上限');
  const signature = Buffer.from(permit.signature.value, 'base64');
  const valid = crypto.verify(null, Buffer.from(canonicalStringify(executionPermitBody(permit))), crypto.createPublicKey(normalizePublicKeyPem(publicKeyPem)), signature);
  if (!valid) throw new Error('execution permit Ed25519 signature 无效');
  for (const field of ['contract_hash', 'environment_fingerprint', 'findings_fingerprint', 'scope_hash']) if (permit[field] !== expected[field]) throw new Error(`execution permit ${field} 不匹配`);
  if ((permit.base_commit || null) !== (expected.base_commit || null)) throw new Error('execution permit base_commit 不匹配');
  const actualSpecs = Array.isArray(permit.command_spec_hashes) ? [...new Set(permit.command_spec_hashes)].sort() : [];
  const expectedSpecs = [...new Set(expected.command_spec_hashes || [])].sort();
  if (canonicalStringify(actualSpecs) !== canonicalStringify(expectedSpecs)) throw new Error('execution permit command spec 集合不匹配');
  if (canonicalStringify(permit.executable_fingerprints) !== canonicalStringify(expected.executable_fingerprints)) throw new Error('execution permit executable fingerprints 不匹配');
  if (canonicalStringify(permit.budgets) !== canonicalStringify(expected.budgets)) throw new Error('execution permit budgets 不匹配');
  return { valid: true, permit_hash: hashCanonical(permit), command_spec_hashes: actualSpecs, executable_fingerprints: permit.executable_fingerprints };
}

function ledgerAnchorBody(anchor) {
  const copy = { ...anchor };
  delete copy.signature;
  return { domain: 'open-workflow-kit/ledger-anchor/v1', anchor: copy };
}

function signLedgerAnchor(payload, privateKeyPem) {
  assertSafeDataKeys(payload, 'ledger anchor');
  const anchor = { ...payload };
  delete anchor.signature;
  const signature = crypto.sign(null, Buffer.from(canonicalStringify(ledgerAnchorBody(anchor))), crypto.createPrivateKey(String(privateKeyPem)));
  return { ...anchor, signature: { algorithm: 'ed25519', value: signature.toString('base64') } };
}

function verifyLedgerAnchor(anchor, publicKeyPem, expected) {
  if (!isPlainObject(anchor) || anchor.schema_version !== '1.0' || !nonEmptyString(anchor.anchor_id) || anchor.key_id !== expected.keyId) throw new Error('ledger anchor 格式或 key_id 无效');
  assertOnlyKeys(anchor, ['schema_version', 'anchor_id', 'key_id', 'observed_at', 'contract_hash', 'source_fingerprint', 'environment_fingerprint', 'findings_fingerprint', 'ledger_head_hash', 'ledger_entry_count', 'nonce', 'signature'], 'ledger anchor');
  if (isPlainObject(anchor.signature)) assertOnlyKeys(anchor.signature, ['algorithm', 'value'], 'ledger anchor signature');
  if (!/^[a-f0-9]{32,}$/.test(String(anchor.nonce || ''))) throw new Error('ledger anchor nonce 无效');
  if (publicKeyFingerprint(publicKeyPem) !== expected.publicKeyFingerprint) throw new Error('ledger anchor public key fingerprint 不匹配');
  if (!isPlainObject(anchor.signature) || anchor.signature.algorithm !== 'ed25519' || !nonEmptyString(anchor.signature.value)) throw new Error('ledger anchor signature 缺失');
  const observedAt = Date.parse(anchor.observed_at);
  const now = Number.isFinite(expected.nowMs) ? expected.nowMs : Date.now();
  if (!Number.isFinite(observedAt) || observedAt > now + 5 * 60000 || now - observedAt > expected.maxAgeMinutes * 60000) throw new Error('ledger anchor 已过期或来自未来');
  const signature = Buffer.from(anchor.signature.value, 'base64');
  if (!crypto.verify(null, Buffer.from(canonicalStringify(ledgerAnchorBody(anchor))), crypto.createPublicKey(normalizePublicKeyPem(publicKeyPem)), signature)) throw new Error('ledger anchor Ed25519 signature 无效');
  for (const field of ['contract_hash', 'source_fingerprint', 'environment_fingerprint', 'findings_fingerprint', 'ledger_head_hash']) if (anchor[field] !== expected[field]) throw new Error(`ledger anchor ${field} 不匹配`);
  if (!Number.isInteger(anchor.ledger_entry_count) || anchor.ledger_entry_count !== expected.ledger_entry_count) throw new Error('ledger anchor entry count 不匹配');
  return { valid: true, anchor_hash: hashCanonical(anchor), anchor_id: anchor.anchor_id };
}

function atomicWrite(file, content) {
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, resolved);
}

function assertOnlyKeys(value, allowedKeys, label) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) throw new Error(`${label} 包含未知字段: ${key}`);
}

function ensureWithin(root, target, label = '路径') {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, target);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} 越出工作区: ${target}`);
  }
  return resolved;
}

function assertResolvedWithin(resolvedRoot, resolvedTarget, label = '路径') {
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} 通过 symlink 越出工作区: ${resolvedTarget}`);
  }
}

function resolveExistingWithin(root, target, label = '路径') {
  const lexical = ensureWithin(root, target, label);
  const resolvedRoot = fs.realpathSync(path.resolve(root));
  const resolvedTarget = fs.realpathSync(lexical);
  assertResolvedWithin(resolvedRoot, resolvedTarget, label);
  return { lexical, resolved: resolvedTarget, root: resolvedRoot };
}

function shouldSkipSourcePath(relativePath, excludes) {
  const posix = normalizeWorkspacePath(relativePath.split(path.sep).join('/'));
  if (posix.split('/').some((part) => part === '.git' || part === 'node_modules')) return true;
  if (RUNTIME_SOURCE_PATTERNS.some((pattern) => pattern.test(posix))) return true;
  return (excludes || []).some((item) => posix === item || posix.startsWith(`${item.replace(/\/$/, '')}/`));
}

function fingerprintPaths(inputPaths, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const resolvedCwd = fs.realpathSync(cwd);
  const requested = Array.isArray(inputPaths) && inputPaths.length ? inputPaths : [];
  const records = [];
  const excludes = (options.excludes || []).map((item) => String(item).split(path.sep).join('/'));

  function visit(absolute, relative) {
    if (shouldSkipSourcePath(relative, excludes)) return;
    let stat;
    try { stat = fs.lstatSync(absolute); } catch (error) {
      if (error.code === 'ENOENT') {
        records.push({ path: relative, type: 'missing' });
        return;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const resolved = fs.realpathSync(absolute);
      assertResolvedWithin(resolvedCwd, resolved, 'source symlink');
      const targetStat = fs.statSync(resolved);
      if (!targetStat.isFile()) throw new Error(`source symlink 只允许指向工作区内 regular file: ${relative}`);
      const content = fs.readFileSync(resolved);
      records.push({ path: relative, type: 'symlink-file', target: fs.readlinkSync(absolute), target_path_hash: sha256(path.relative(cwd, resolved).split(path.sep).join('/')), size: targetStat.size, hash: sha256(content) });
      return;
    }
    assertResolvedWithin(resolvedCwd, fs.realpathSync(absolute), 'source path');
    if (stat.isDirectory()) {
      records.push({ path: relative, type: 'directory' });
      for (const name of fs.readdirSync(absolute).sort()) {
        visit(path.join(absolute, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (stat.isFile()) {
      const content = fs.readFileSync(absolute);
      const record = { path: relative, type: 'file', size: stat.size, hash: sha256(content) };
      if (options.includeExecutableMode !== false) record.mode = stat.mode & 0o111 ? 'executable' : 'regular';
      records.push(record);
      return;
    }
    records.push({ path: relative, type: 'other' });
  }

  for (const input of [...new Set(requested.map(String))].sort()) {
    const absolute = ensureWithin(cwd, input, 'source path');
    const relative = path.relative(cwd, absolute).split(path.sep).join('/') || '.';
    visit(absolute, relative);
  }
  records.sort((left, right) => compareCodeUnits(left.path, right.path) || compareCodeUnits(left.type, right.type));
  return { algorithm: 'sha256', fingerprint: hashCanonical(records), records };
}

function fingerprintOraclePaths(inputPaths, options = {}) {
  return fingerprintPaths(inputPaths, { ...options, includeExecutableMode: false });
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fingerprintEnvironment(environment) {
  return hashCanonical({ environment: environment === undefined ? 'unspecified' : environment });
}

function contractEnvironmentDescriptor(contract, environment) {
  const provided = environment === undefined ? 'unspecified' : environment;
  return {
    supplied_environment: provided,
    observed_runtime_versions: {
      node: process.versions.node,
      v8: process.versions.v8,
      uv: process.versions.uv,
      openssl: process.versions.openssl || 'N/A',
      platform: process.platform,
      arch: process.arch
    },
    declared_runtime_versions: isPlainObject(provided) ? provided.runtime_versions || null : null,
    acceptance_context: (contract.acceptance || []).map((criterion) => ({
      id: criterion.id,
      environment: criterion.environment,
      fixture: criterion.fixture,
      oracle_type: criterion.oracle && criterion.oracle.type,
      oracle_integrity: criterion.oracle && criterion.oracle.integrity_fingerprint || null
    }))
  };
}

function validateEnvironmentManifest(environment) {
  if (!isPlainObject(environment) || !nonEmptyString(environment.name)) throw new Error('environment manifest 必须是 object 且包含 name');
  for (const field of ['runtime_versions', 'dependency_versions', 'service_versions', 'dataset_versions', 'model_versions', 'tool_versions']) {
    const value = environment[field];
    if (!isPlainObject(value) || !Object.keys(value).length || Object.values(value).some((item) => typeof item !== 'string' || !nonEmptyString(item))) throw new Error(`environment manifest.${field} 必须是 string-to-string 非空 object；不适用时写 N/A: reason`);
  }
  assertSafeDataKeys(environment, 'environment manifest');
  if (containsPlaceholder(environment)) throw new Error('environment manifest 仍包含 TODO/TBD/placeholder，必须替换为精确版本或 N/A: reason');
  return environment;
}

function containsPlaceholder(value, seen = new Set()) {
  if (isPlaceholder(value)) return true;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  const found = Array.isArray(value)
    ? value.some((item) => containsPlaceholder(item, seen))
    : Object.values(value).some((item) => containsPlaceholder(item, seen));
  seen.delete(value);
  return found;
}

function validateFindingsManifest(manifest, policy, options = {}) {
  if (!isPlainObject(manifest) || manifest.schema_version !== '1.0' || !nonEmptyString(manifest.owner) || !nonEmptyString(manifest.source) || !Array.isArray(manifest.findings)) {
    throw new Error('findings manifest 必须包含 schema_version=1.0、owner、source、snapshot_at 与 findings 数组');
  }
  assertSafeDataKeys(manifest, 'findings manifest');
  if (containsPlaceholder(manifest)) throw new Error('findings manifest 仍包含 TODO/TBD/placeholder');
  const snapshotAt = Date.parse(manifest.snapshot_at);
  const now = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  if (!Number.isFinite(snapshotAt) || snapshotAt > now + 5 * 60000) throw new Error('findings manifest snapshot_at 无效或来自未来');
  if (!isPlainObject(policy) || policy.required_for_completion !== true || !nonEmptyString(policy.owner) || !nonEmptyString(policy.source) || !Number.isFinite(policy.max_age_minutes) || policy.max_age_minutes <= 0) {
    throw new Error('governance.findings_registry policy 无效');
  }
  if (manifest.owner !== policy.owner || manifest.source !== policy.source) throw new Error('findings manifest owner/source 与冻结 Contract policy 不匹配');
  if (now - snapshotAt > policy.max_age_minutes * 60000) throw new Error('findings manifest 已超过冻结 Contract 的 freshness 上限');
  const ids = new Set();
  for (const [index, finding] of manifest.findings.entries()) {
    if (!isPlainObject(finding) || !/^[A-Za-z][A-Za-z0-9._-]{1,127}$/.test(String(finding.id || '')) || !['P0', 'P1', 'P2', 'P3'].includes(finding.priority) || !['OPEN', 'CLOSED'].includes(finding.status) || !nonEmptyString(finding.title) || !nonEmptyString(finding.owner)) {
      throw new Error(`findings[${index}] 必须包含唯一 id、P0..P3 priority、OPEN/CLOSED status、title 与 owner`);
    }
    if (ids.has(finding.id)) throw new Error(`findings manifest ID 重复: ${finding.id}`);
    ids.add(finding.id);
    if (finding.status === 'CLOSED' && !nonEmptyString(finding.closure_evidence)) throw new Error(`findings[${index}] CLOSED 必须包含 closure_evidence`);
  }
  return manifest;
}

function fingerprintContractEnvironment(contract, environment) {
  return hashCanonical(contractEnvironmentDescriptor(contract, environment));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeRelativePattern(value) {
  if (!nonEmptyString(value) || /[\u0000\r\n]/.test(value) || path.isAbsolute(value)) return false;
  const normalized = String(value).replace(/\\/g, '/');
  return !normalized.split('/').includes('..');
}

function normalizeWorkspacePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '.';
}

function pathMatchesPattern(relativePath, rawPattern) {
  const candidate = normalizeWorkspacePath(relativePath);
  const pattern = normalizeWorkspacePath(rawPattern);
  if (pattern === '.') return true;
  if (!/[?*]/.test(pattern)) return candidate === pattern || candidate.startsWith(`${pattern}/`);
  let expression = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      expression += '.*';
      index++;
    } else if (char === '*') expression += '[^/]*';
    else if (char === '?') expression += '[^/]';
    else expression += char.replace(/[\\^$+?.()|{}\[\]]/g, '\\$&');
  }
  return new RegExp(`${expression}$`).test(candidate);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasNumericThreshold(text) {
  return /(?:\d+(?:\.\d+)?\s*(?:ms|s|秒|分钟|小时|天|周|月|days?|weeks?|months?|%|％|MB|GB|KB|元|次|个|条|人|QPS|RPS|TPS|并发|以内|以下|以上)|p(?:50|90|95|99)|(?:[<>=≤≥]|为|至少|至多|不得超过|不高于|不低于)\s*\d+)/i.test(String(text || ''));
}

function findAmbiguousTerms(text) {
  const lowered = String(text || '').toLowerCase();
  return AMBIGUOUS_TERMS.filter((term) => lowered.includes(term.toLowerCase()));
}

function isPlaceholder(value) {
  return typeof value === 'string' && /(?:<\s*(?:TODO|FEATURE_ID)\b|\bTODO\s*:|待补充|TBD\b)/i.test(value);
}

function collectPlaceholderIssues(value, pathName, addError, seen = new Set()) {
  if (isPlaceholder(value)) {
    addError(pathName || '$', '仍包含 TODO/TBD/placeholder，不能视为已定义', 'PLACEHOLDER');
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item, index) => collectPlaceholderIssues(item, `${pathName}[${index}]`, addError, seen));
  else for (const [key, item] of Object.entries(value)) collectPlaceholderIssues(item, pathName ? `${pathName}.${key}` : key, addError, seen);
  seen.delete(value);
}

function findPolicyPackDir(explicitRoot) {
  const candidates = [];
  if (explicitRoot) {
    candidates.push(path.resolve(explicitRoot, 'workflow/core/policy-packs'));
    candidates.push(path.resolve(explicitRoot, 'core/policy-packs'));
    candidates.push(path.resolve(explicitRoot, 'policy-packs'));
  }
  candidates.push(path.resolve(__dirname, '../workflow/core/policy-packs'));
  candidates.push(path.resolve(__dirname, '../core/policy-packs'));
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || null;
}

function loadPolicyPackRegistry(options = {}) {
  const directory = options.policyPackDir || findPolicyPackDir(options.root);
  if (!directory) throw new Error('找不到 workflow/core/policy-packs');
  const registry = new Map();
  for (const name of fs.readdirSync(directory).filter((item) => /\.ya?ml$/i.test(item)).sort()) {
    const file = path.join(directory, name);
    const pack = loadData(file);
    if (!isPlainObject(pack) || !nonEmptyString(pack.id)) throw new Error(`${file}: policy pack 缺少 id`);
    if (registry.has(pack.id)) throw new Error(`policy pack ID 重复: ${pack.id}`);
    registry.set(pack.id, { ...pack, __file: file });
  }
  return registry;
}

function resolvePolicyPack(id, registry, visiting = [], memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  if (visiting.includes(id)) throw new Error(`policy pack 继承循环: ${[...visiting, id].join(' -> ')}`);
  const pack = registry.get(id);
  if (!pack) throw new Error(`policy pack 不存在: ${id}`);
  const chain = [];
  for (const parent of pack.extends || []) chain.push(...resolvePolicyPack(parent, registry, [...visiting, id], memo));
  chain.push(pack);
  const unique = [...new Map(chain.map((item) => [item.id, item])).values()];
  memo.set(id, unique);
  return unique;
}

const CONTRACT_PATH_ALIASES = {
  'governance.rollback': ['release.rollback'],
  'organization.approvals': ['approvers'],
  'quality_budgets.reliability': ['quality_budgets.reliability_resilience'],
  'quality_budgets.cost': ['quality_budgets.performance_cost'],
  'quality_budgets.accessibility': ['quality_budgets.ux'],
  'quality_budgets.security': ['quality_budgets.security_privacy'],
  'quality_budgets.privacy': ['quality_budgets.security_privacy']
};

function getContractPath(contract, pathName) {
  const paths = [pathName, ...(CONTRACT_PATH_ALIASES[pathName] || [])];
  for (const candidate of paths) {
    const value = candidate.split('.').reduce((current, key) => current === null || current === undefined ? undefined : current[key], contract);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function isAuditNaValue(value) {
  if (typeof value === 'string') return /^\s*N\/?A\s*:/i.test(value) || /^\s*不适用\s*[:：]/.test(value);
  if (isPlainObject(value)) {
    if (typeof value.reason === 'string' && isAuditNaValue(value.reason)) return true;
    const values = Object.values(value);
    return values.length > 0 && values.every(isAuditNaValue);
  }
  return false;
}

function isMeaningfullyPopulated(value) {
  if (value === undefined || value === null || isAuditNaValue(value)) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.some(isMeaningfullyPopulated);
  if (isPlainObject(value)) return Object.keys(value).length > 0 && Object.values(value).some(isMeaningfullyPopulated);
  return value === true || (typeof value === 'number' && Number.isFinite(value));
}

function keywordMatches(text, keyword) {
  const needle = String(keyword || '').toLowerCase();
  if (!needle) return false;
  if (/^[a-z0-9 _.-]+$/i.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text);
  }
  return text.includes(needle);
}

function collectPolicyPackIssues(contract, options = {}) {
  const issues = [];
  const add = (severity, pathName, message, code) => issues.push({ severity, path: pathName, message, code });
  let registry;
  try { registry = loadPolicyPackRegistry(options); } catch (error) {
    return [{ severity: 'error', path: 'policy_packs', message: error.message, code: 'POLICY_PACK_LOAD' }];
  }
  const declarations = Array.isArray(contract.policy_packs) ? contract.policy_packs : [];
  const exceptions = new Map();
  if (!Array.isArray(contract.policy_pack_exceptions)) add('error', 'policy_pack_exceptions', '必须显式定义数组', 'POLICY_EXCEPTION_INVALID');
  else for (const [index, exception] of contract.policy_pack_exceptions.entries()) {
    const base = `policy_pack_exceptions[${index}]`;
    if (!isPlainObject(exception) || !nonEmptyString(exception.id)) { add('error', base, '必须包含 pack id', 'POLICY_EXCEPTION_INVALID'); continue; }
    if (exceptions.has(exception.id)) add('error', base, `重复 exception ${exception.id}`, 'DUPLICATE');
    exceptions.set(exception.id, exception);
    if (!registry.has(exception.id)) add('error', `${base}.id`, `未知 policy pack ${exception.id}`, 'POLICY_EXCEPTION_INVALID');
    for (const field of ['owner', 'approved_by', 'reason', 'scope', 'expires_at']) if (!nonEmptyString(exception[field])) add('error', `${base}.${field}`, '必须为非空字符串', 'POLICY_EXCEPTION_INVALID');
    if (exception.scope !== exception.id) add('error', `${base}.scope`, '必须精确等于被例外的 policy pack id', 'POLICY_EXCEPTION_INVALID');
    if (!Array.isArray(contract.approvers) || !contract.approvers.includes(exception.approved_by)) add('error', `${base}.approved_by`, '必须是 Contract approver', 'POLICY_EXCEPTION_APPROVER');
    const expires = Date.parse(exception.expires_at);
    if (!Number.isFinite(expires)) add('error', `${base}.expires_at`, '必须是有效 ISO 时间', 'POLICY_EXCEPTION_INVALID');
    else if (expires <= Date.now()) add('error', `${base}.expires_at`, 'policy pack exception 已过期', 'POLICY_EXCEPTION_EXPIRED');
  }
  const enabled = new Map();
  for (const [index, declaration] of declarations.entries()) {
    const id = typeof declaration === 'string' ? declaration : declaration && declaration.id;
    if (!nonEmptyString(id)) add('error', `policy_packs[${index}]`, '必须包含 id', 'POLICY_PACK_ID');
    else if (enabled.has(id)) add('error', `policy_packs[${index}]`, `重复 pack ${id}`, 'DUPLICATE');
    else enabled.set(id, declaration);
  }
  if (!enabled.has('standard')) add('error', 'policy_packs', '每个 Completion Contract 必须启用 standard', 'STANDARD_PACK_REQUIRED');
  const contractText = canonicalStringify({
    feature_objective: contract.feature && contract.feature.objective,
    objective: contract.objective,
    requirements: contract.requirements,
    domain: contract.domain
  }).toLowerCase();
  for (const pack of registry.values()) {
    const applies = Boolean(pack.applies_when && (
      pack.applies_when.always === true ||
      (pack.applies_when.any_keywords || []).some((keyword) => keywordMatches(contractText, keyword)) ||
      (pack.applies_when.contract_paths || []).some((pathName) => {
        const value = getContractPath(contract, pathName);
        return isMeaningfullyPopulated(value);
      })
    ));
    if (applies && !enabled.has(pack.id)) {
      const exception = exceptions.get(pack.id);
      if (exception && nonEmptyString(exception.owner) && nonEmptyString(exception.approved_by) && exception.scope === pack.id && Number.isFinite(Date.parse(exception.expires_at)) && Date.parse(exception.expires_at) > Date.now()) add('warning', 'policy_pack_exceptions', `适用 pack ${pack.id} 被有期限地例外: ${exception.reason}`, 'APPLICABLE_PACK_EXCEPTION');
      else add('error', 'policy_packs', `检测到 ${pack.id} 适用但未启用；需启用或提供 owner/reason/expires_at 例外`, 'APPLICABLE_PACK_MISSING');
    }
  }
  const applied = new Map();
  for (const id of enabled.keys()) {
    try { for (const pack of resolvePolicyPack(id, registry)) applied.set(pack.id, pack); }
    catch (error) { add('error', 'policy_packs', error.message, 'POLICY_PACK_RESOLUTION'); }
  }
  const capabilities = new Set(contract.enabled_capabilities || []);
  const dimensions = new Set((contract.acceptance || []).flatMap((item) => Array.isArray(item.dimensions) ? item.dimensions : []));
  const acknowledged = new Set(contract.governance && Array.isArray(contract.governance.blocking_rules_acknowledged) ? contract.governance.blocking_rules_acknowledged : []);
  for (const pack of applied.values()) {
    for (const section of pack.required_contract_sections || []) if (getContractPath(contract, section) === undefined) add('error', section, `policy pack ${pack.id} 要求此 section`, 'POLICY_SECTION_REQUIRED');
    for (const capability of pack.required_capabilities || []) if (!capabilities.has(capability)) add('error', 'enabled_capabilities', `policy pack ${pack.id} 要求 capability ${capability}`, 'POLICY_CAPABILITY_REQUIRED');
    for (const dimension of pack.mandatory_acceptance_dimensions || []) if (!dimensions.has(dimension)) add('error', 'acceptance.dimensions', `policy pack ${pack.id} 要求维度 ${dimension}`, 'POLICY_DIMENSION_REQUIRED');
    if ((pack.blocking_rules || []).length && !acknowledged.has(pack.id)) add('error', 'governance.blocking_rules_acknowledged', `必须确认并执行 ${pack.id} 的 blocking_rules`, 'POLICY_RULES_UNACKNOWLEDGED');
  }
  return issues;
}

function collectContractIssues(contract) {
  const issues = [];
  const error = (pathName, message, code) => issues.push({ severity: 'error', path: pathName, message, code });
  const warning = (pathName, message, code) => issues.push({ severity: 'warning', path: pathName, message, code });
  if (!isPlainObject(contract)) return [{ severity: 'error', path: '$', message: 'contract 必须是 object', code: 'TYPE' }];
  for (const key of Object.keys(contract)) if (!CONTRACT_ROOT_FIELDS.has(key)) error(key, 'Completion Contract 根字段未在 schema 1.0 中声明', 'UNKNOWN_FIELD');
  if (String(contract.schema_version) !== '1.0') error('schema_version', '必须为 "1.0"', 'SCHEMA_VERSION');
  if (!isPlainObject(contract.feature)) error('feature', '必须是 object', 'REQUIRED');
  else {
    if (!nonEmptyString(contract.feature.id)) error('feature.id', '必须为非空字符串', 'REQUIRED');
    if (!nonEmptyString(contract.feature.objective)) error('feature.objective', '必须定义目标', 'REQUIRED');
    if (!Array.isArray(contract.feature.non_goals)) error('feature.non_goals', '必须显式定义数组（允许为空）', 'REQUIRED');
    if (!Number.isInteger(contract.feature.contract_version) || contract.feature.contract_version < 1) error('feature.contract_version', '必须为正整数', 'TYPE');
    if (!nonEmptyString(contract.feature.owner)) error('feature.owner', '必须定义 owner', 'REQUIRED');
    if (!Array.isArray(contract.feature.reviewers) || !contract.feature.reviewers.length || contract.feature.reviewers.some((item) => !nonEmptyString(item))) error('feature.reviewers', '至少定义一个非空 reviewer', 'REQUIRED');
    if (!['draft', 'frozen'].includes(contract.feature.status)) error('feature.status', '必须是 draft 或 frozen', 'REQUIRED');
    if (!nonEmptyString(contract.feature.created_at) || !Number.isFinite(Date.parse(contract.feature.created_at))) error('feature.created_at', '必须是有效时间', 'REQUIRED');
    if (contract.feature.status === 'frozen' && (!nonEmptyString(contract.feature.frozen_at) || !Number.isFinite(Date.parse(contract.feature.frozen_at)))) error('feature.frozen_at', 'frozen contract 必须记录 frozen_at', 'REQUIRED');
  }

  if (!isPlainObject(contract.objective)) error('objective', '必须定义 problem/target_users/success_definition', 'REQUIRED');
  else {
    if (!nonEmptyString(contract.objective.problem)) error('objective.problem', '必须定义待解决问题', 'REQUIRED');
    if (!Array.isArray(contract.objective.target_users) || !contract.objective.target_users.length || contract.objective.target_users.some((item) => !nonEmptyString(item))) error('objective.target_users', '至少定义一个非空目标用户', 'REQUIRED');
    if (!nonEmptyString(contract.objective.success_definition)) error('objective.success_definition', '必须定义业务成功含义', 'REQUIRED');
  }

  if (!isPlainObject(contract.outcome)) error('outcome', '必须定义商业结果', 'REQUIRED');
  else {
    for (const field of ['north_star_metric', 'baseline', 'target', 'observation_window']) {
      if (!nonEmptyString(contract.outcome[field])) error(`outcome.${field}`, '必须为非空字符串', 'REQUIRED');
    }
    if (!Array.isArray(contract.outcome.guardrails) || !contract.outcome.guardrails.length || contract.outcome.guardrails.some((item) => !nonEmptyString(item))) error('outcome.guardrails', '至少定义一个非空 guardrail', 'REQUIRED');
    for (const field of ['baseline', 'target', 'observation_window']) if (nonEmptyString(contract.outcome[field]) && !hasNumericThreshold(contract.outcome[field])) error(`outcome.${field}`, '必须包含可测数值、单位或明确阈值', 'OUTCOME_NOT_QUANTIFIED');
    for (const [index, guardrail] of (Array.isArray(contract.outcome.guardrails) ? contract.outcome.guardrails : []).entries()) if (nonEmptyString(guardrail) && !hasNumericThreshold(guardrail)) error(`outcome.guardrails[${index}]`, 'guardrail 必须包含数值、单位或明确阈值', 'OUTCOME_NOT_QUANTIFIED');
  }

  if (!Array.isArray(contract.stakeholders) || !contract.stakeholders.length || contract.stakeholders.some((item) => !nonEmptyString(item))) error('stakeholders', '至少定义一个非空 stakeholder', 'REQUIRED');
  if (!Array.isArray(contract.approvers) || !contract.approvers.length || contract.approvers.some((item) => !nonEmptyString(item))) error('approvers', '至少定义一个非空 approver', 'REQUIRED');
  if (!nonEmptyString(contract.operational_owner)) error('operational_owner', '必须定义 operational owner', 'REQUIRED');
  if (!isPlainObject(contract.glossary) || !Object.keys(contract.glossary).length) error('glossary', '必须定义共享术语表', 'REQUIRED');
  if (!isPlainObject(contract.organization)) error('organization', '必须定义 DRI、决策、评审、依赖和升级边界', 'REQUIRED');
  else for (const field of ['dri', 'decision_owner', 'reviewers', 'dependency_owners', 'escalation_path']) {
    const value = contract.organization[field];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && (!value.length || value.some((item) => !nonEmptyString(item))))) error(`organization.${field}`, '必须显式定义；数组项不得为空，不适用时写带理由的对象或字符串', 'REQUIRED');
  }
  const assumptionIds = new Set();
  if (!Array.isArray(contract.assumptions)) error('assumptions', '必须显式定义数组', 'REQUIRED');
  else contract.assumptions.forEach((item, index) => {
    const base = `assumptions[${index}]`;
    if (!isPlainObject(item) || !/^ASM-\d{3,}$/.test(String(item.id || '')) || !nonEmptyString(item.statement)) error(base, '必须包含 ASM-001 形式 id 与 statement', 'ASSUMPTION_INVALID');
    else if (assumptionIds.has(item.id)) error(`${base}.id`, `重复 ID ${item.id}`, 'DUPLICATE');
    else assumptionIds.add(item.id);
    for (const field of ['owner', 'validation_method', 'evidence', 'expires_at', 'status']) if (!nonEmptyString(item && item[field])) error(`${base}.${field}`, '必须为非空字符串', 'ASSUMPTION_LIFECYCLE');
    if (!['low', 'medium', 'high'].includes(item && item.confidence)) error(`${base}.confidence`, '必须是 low/medium/high', 'ASSUMPTION_INVALID');
    const expires = Date.parse(item && item.expires_at);
    if (!Number.isFinite(expires)) error(`${base}.expires_at`, '必须是有效 ISO 时间', 'ASSUMPTION_INVALID');
    else if (item.status === 'open' && expires <= Date.now()) error(`${base}.expires_at`, 'open assumption 已过期', 'ASSUMPTION_EXPIRED');
    if (!['open', 'validated', 'invalidated'].includes(item && item.status)) error(`${base}.status`, '必须是 open/validated/invalidated', 'ASSUMPTION_INVALID');
  });
  const decisionIds = new Set();
  if (!Array.isArray(contract.decisions)) error('decisions', '必须显式定义数组', 'REQUIRED');
  else contract.decisions.forEach((item, index) => {
    const base = `decisions[${index}]`;
    if (!isPlainObject(item) || !/^DEC-\d{3,}$/.test(String(item.id || ''))) error(`${base}.id`, '必须使用 DEC-001 形式', 'DECISION_INVALID');
    else if (decisionIds.has(item.id)) error(`${base}.id`, `重复 ID ${item.id}`, 'DUPLICATE');
    else decisionIds.add(item.id);
    for (const field of ['decision', 'owner', 'rationale', 'decided_at']) if (!nonEmptyString(item && item[field])) error(`${base}.${field}`, '必须为非空字符串', 'DECISION_INVALID');
    if (!Number.isFinite(Date.parse(item && item.decided_at))) error(`${base}.decided_at`, '必须是有效 ISO 时间', 'DECISION_INVALID');
  });

  const requirementIds = new Set();
  if (!Array.isArray(contract.requirements) || !contract.requirements.length) error('requirements', '至少定义一条带稳定 ID 的 requirement', 'REQUIRED');
  else contract.requirements.forEach((item, index) => {
    if (!isPlainObject(item) || !/^REQ-\d{3,}$/.test(String(item.id || ''))) error(`requirements[${index}].id`, '必须使用 REQ-001 形式', 'REQ_ID');
    else if (requirementIds.has(item.id)) error(`requirements[${index}].id`, `重复 ID ${item.id}`, 'DUPLICATE');
    else requirementIds.add(item.id);
    if (!nonEmptyString(item && item.statement)) error(`requirements[${index}].statement`, '必须为非空字符串', 'REQUIRED');
    if (!['P0', 'P1', 'P2', 'P3'].includes(item && item.priority)) error(`requirements[${index}].priority`, '必须是 P0/P1/P2/P3', 'PRIORITY');
  });
  const riskIds = new Set();
  if (!Array.isArray(contract.risks)) error('risks', '必须显式定义数组', 'REQUIRED');
  else contract.risks.forEach((item, index) => {
    const base = `risks[${index}]`;
    if (!isPlainObject(item) || !/^RISK-\d{3,}$/.test(String(item.id || ''))) error(`risks[${index}].id`, '必须使用 RISK-001 形式', 'RISK_ID');
    else if (riskIds.has(item.id)) error(`risks[${index}].id`, `重复 ID ${item.id}`, 'DUPLICATE');
    else riskIds.add(item.id);
    for (const field of ['title', 'owner', 'impact', 'mitigation']) if (!nonEmptyString(item && item[field])) error(`${base}.${field}`, '必须为非空字符串', 'RISK_INVALID');
    if (!['P0', 'P1', 'P2', 'P3'].includes(item && item.priority)) error(`${base}.priority`, '必须是 P0/P1/P2/P3', 'RISK_INVALID');
    if (!['low', 'medium', 'high'].includes(item && item.likelihood)) error(`${base}.likelihood`, '必须是 low/medium/high', 'RISK_INVALID');
    if (!['open', 'mitigated', 'accepted', 'closed'].includes(item && item.status)) error(`${base}.status`, '必须是 open/mitigated/accepted/closed', 'RISK_INVALID');
    if (!Array.isArray(item && item.acceptance_refs) || !item.acceptance_refs.length || item.acceptance_refs.some((ref) => !/^AC-\d{3,}$/.test(String(ref)))) error(`${base}.acceptance_refs`, '必须至少关联一个 AC-###', 'RISK_INVALID');
  });

  if (!isPlainObject(contract.scope)) error('scope', '必须是 object', 'REQUIRED');
  else {
    for (const field of ['allowed_paths', 'forbidden_paths', 'preserved_invariants', 'invariant_acceptance_refs']) {
      if (!Array.isArray(contract.scope[field])) error(`scope.${field}`, '必须显式定义数组', 'REQUIRED');
    }
    if (!Array.isArray(contract.scope.source_paths) || !contract.scope.source_paths.length) error('scope.source_paths', '至少定义一个用于 source fingerprint 的相对路径', 'REQUIRED');
    for (const field of ['source_paths', 'allowed_paths', 'forbidden_paths', 'fingerprint_excludes']) {
      if (contract.scope[field] !== undefined && (!Array.isArray(contract.scope[field]) || contract.scope[field].some((item) => !isSafeRelativePattern(item)))) {
        error(`scope.${field}`, '只能包含工作区内的安全相对路径或 glob，不得含绝对路径、NUL、换行或 ..', 'SCOPE_PATH');
      }
    }
    if (Array.isArray(contract.scope.fingerprint_excludes) && contract.scope.fingerprint_excludes.length) error('scope.fingerprint_excludes', 'v1 禁止自定义 source fingerprint 排除项；请缩小 source_paths，reserved runtime 由内核精确排除', 'FINGERPRINT_EXCLUDE_FORBIDDEN');
  }

  if (!isPlainObject(contract.domain)) error('domain', '必须是 object', 'REQUIRED');
  else {
    for (const field of ['entities', 'data_flows', 'state_machines', 'sources_of_truth']) {
      if (!Array.isArray(contract.domain[field])) error(`domain.${field}`, '必须显式定义数组', 'REQUIRED');
    }
  }

  if (!isPlainObject(contract.quality_budgets)) error('quality_budgets', '必须是 object', 'REQUIRED');
  else {
    const budgetGroups = {
      business: ['business'],
      ux: ['ux', 'accessibility'],
      performance_cost: ['performance_cost', 'performance'],
      reliability_resilience: ['reliability_resilience', 'reliability'],
      security_privacy: ['security_privacy', 'security'],
      observability_operations: ['observability_operations', 'observability'],
      reversibility_evolution: ['reversibility_evolution', 'reversibility'],
      ai_quality: ['ai_quality', 'ai']
    };
    for (const [canonical, alternatives] of Object.entries(budgetGroups)) {
      const selected = alternatives.find((key) => isPlainObject(contract.quality_budgets[key]) && Object.keys(contract.quality_budgets[key]).length);
      if (!selected) error(`quality_budgets.${canonical}`, `必须显式定义非空 object；不适用时写 reason`, 'REQUIRED');
      else if (selected !== canonical) warning(`quality_budgets.${selected}`, `建议迁移到 canonical 字段 ${canonical}`, 'LEGACY_BUDGET_KEY');
    }
    for (const field of ['business', 'performance_cost', 'reliability_resilience']) {
      const value = contract.quality_budgets[field];
      if (isPlainObject(value) && !isAuditNaValue(value) && !hasNumericThreshold(canonicalStringify(value))) error(`quality_budgets.${field}`, '必须包含可测数值、单位或明确阈值；不适用时写 N/A: reason', 'QUALITY_BUDGET_NOT_QUANTIFIED');
    }
  }

  if (!Array.isArray(contract.unknowns)) error('unknowns', '必须显式定义数组', 'REQUIRED');
  else contract.unknowns.forEach((item, index) => {
    if (!isPlainObject(item) || !nonEmptyString(item.id) || !nonEmptyString(item.question)) error(`unknowns[${index}]`, '必须包含 id 与 question', 'UNKNOWN_INVALID');
    if (item && item.blocking === true) {
      if (!nonEmptyString(item.owner)) error(`unknowns[${index}].owner`, 'blocking unknown 必须有 owner', 'BLOCKING_UNKNOWN');
      if (!nonEmptyString(item.validation_method)) error(`unknowns[${index}].validation_method`, 'blocking unknown 必须有 validation_method', 'BLOCKING_UNKNOWN');
      if (!nonEmptyString(item.deadline)) warning(`unknowns[${index}].deadline`, '建议为 blocking unknown 定义 deadline', 'UNKNOWN_DEADLINE');
    }
  });

  if (!isPlainObject(contract.release)) error('release', '必须定义 release object', 'REQUIRED');
  else for (const field of ['rollout', 'kill_switch', 'rollback', 'observation']) {
    if (!isPlainObject(contract.release[field]) || !Object.keys(contract.release[field]).length) error(`release.${field}`, '必须显式定义且不得为空', 'REQUIRED');
  }

  if (!isPlainObject(contract.governance)) error('governance', '必须定义冻结、变更、证据失效、waiver 与 anti-cheating 规则', 'REQUIRED');
  else {
    for (const field of ['status', 'change_approval', 'evidence_invalidation', 'waiver_policy', 'anti_cheating', 'evidence_attestation', 'findings_registry', 'ledger_anchor', 'execution_authorization']) {
      if (contract.governance[field] === undefined || contract.governance[field] === null) error(`governance.${field}`, '必须显式定义', 'REQUIRED');
    }
    const findingsRegistry = contract.governance.findings_registry;
    if (!isPlainObject(findingsRegistry) || findingsRegistry.required_for_completion !== true || !nonEmptyString(findingsRegistry.owner) || !nonEmptyString(findingsRegistry.source) || !Number.isFinite(findingsRegistry.max_age_minutes) || findingsRegistry.max_age_minutes <= 0) {
      error('governance.findings_registry', '必须要求显式 findings snapshot，并定义 owner、source 与 freshness', 'FINDINGS_REGISTRY_POLICY');
    }
    if (!['draft', 'frozen'].includes(contract.governance.status)) error('governance.status', '必须是 draft 或 frozen', 'GOVERNANCE_STATUS');
    else if (contract.governance.status !== 'frozen') warning('governance.status', 'draft contract 可 lint，但不得进入自主交付', 'CONTRACT_NOT_FROZEN');
    const attestation = contract.governance.evidence_attestation;
    if (isPlainObject(attestation)) {
      if (attestation.required_for_success !== true) error('governance.evidence_attestation.required_for_success', '必须为 true，防止无信任根 PASS', 'ATTESTATION_POLICY');
      const keySets = {};
      for (const field of ['automation_key_ids', 'human_key_ids', 'waiver_key_ids']) {
        if (!Array.isArray(attestation[field]) || !attestation[field].length || attestation[field].some((item) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(item || '')))) {
          error(`governance.evidence_attestation.${field}`, '必须是非空 key ID 数组', 'ATTESTATION_POLICY');
        }
        keySets[field] = new Set(Array.isArray(attestation[field]) ? attestation[field] : []);
        if (keySets[field].size !== (attestation[field] || []).length) error(`governance.evidence_attestation.${field}`, 'key ID 不得重复', 'ATTESTATION_POLICY');
      }
      for (const keyId of keySets.automation_key_ids || []) {
        if ((keySets.human_key_ids || new Set()).has(keyId) || (keySets.waiver_key_ids || new Set()).has(keyId)) error('governance.evidence_attestation', `automation key ${keyId} 不得兼任 human/waiver`, 'ATTESTATION_ROLE_OVERLAP');
      }
      for (const keyId of keySets.waiver_key_ids || []) if (!(keySets.human_key_ids || new Set()).has(keyId)) error('governance.evidence_attestation.waiver_key_ids', `waiver key ${keyId} 必须同时是 human key`, 'ATTESTATION_ROLE');
      const principals = attestation.key_principals;
      if (!isPlainObject(principals)) error('governance.evidence_attestation.key_principals', '必须映射每个 key ID 到 role 与 principal', 'ATTESTATION_PRINCIPAL');
      else {
        const allKeys = new Set([...(keySets.automation_key_ids || []), ...(keySets.human_key_ids || []), ...(keySets.waiver_key_ids || [])]);
        for (const keyId of allKeys) {
          const mapping = principals[keyId];
          const expectedRole = (keySets.automation_key_ids || new Set()).has(keyId) ? 'automation' : 'human';
          if (!isPlainObject(mapping) || mapping.role !== expectedRole || !nonEmptyString(mapping.principal)) error(`governance.evidence_attestation.key_principals.${keyId}`, `必须映射为 role=${expectedRole} 且 principal 非空`, 'ATTESTATION_PRINCIPAL');
        }
        for (const keyId of Object.keys(principals)) if (!allKeys.has(keyId)) error(`governance.evidence_attestation.key_principals.${keyId}`, '不得声明未使用的 key principal', 'ATTESTATION_PRINCIPAL');
      }
    }
    const ledgerAnchor = contract.governance.ledger_anchor;
    if (!isPlainObject(ledgerAnchor) || ledgerAnchor.required_for_acceptance !== true || !nonEmptyString(ledgerAnchor.external_anchor_owner) || !nonEmptyString(ledgerAnchor.storage) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(ledgerAnchor.key_id || '')) || !/^sha256:[a-f0-9]{64}$/.test(String(ledgerAnchor.trusted_public_key_sha256 || '')) || !Number.isFinite(ledgerAnchor.max_age_minutes) || ledgerAnchor.max_age_minutes <= 0) {
      error('governance.ledger_anchor', '必须要求 ACCEPTED 使用 Agent 工作区之外的 Owner Ed25519-signed head/count 锚，并定义 key fingerprint、owner、storage 与 freshness', 'LEDGER_ANCHOR_POLICY');
    }
    const executionAuthorization = contract.governance.execution_authorization;
    if (!isPlainObject(executionAuthorization) || executionAuthorization.permit_required !== true || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(executionAuthorization.key_id || '')) || !/^sha256:[a-f0-9]{64}$/.test(String(executionAuthorization.trusted_public_key_sha256 || '')) || !Number.isFinite(executionAuthorization.max_validity_minutes) || executionAuthorization.max_validity_minutes <= 0 || executionAuthorization.max_validity_minutes > 10080) {
      error('governance.execution_authorization', '必须要求 Owner Ed25519 permit、固定 key fingerprint，并把有效期限制在 1..10080 分钟', 'EXECUTION_AUTHORIZATION_POLICY');
    }
  }
  if (contract.feature && contract.governance && ['draft', 'frozen'].includes(contract.feature.status) && ['draft', 'frozen'].includes(contract.governance.status) && contract.feature.status !== contract.governance.status) {
    error('governance.status', '必须与 feature.status 一致；禁止部分冻结', 'FREEZE_STATUS_MISMATCH');
  }

  if (!Array.isArray(contract.acceptance) || !contract.acceptance.length) error('acceptance', '至少定义一条 acceptance criterion', 'REQUIRED');
  const ids = new Set();
  for (const [index, criterion] of (Array.isArray(contract.acceptance) ? contract.acceptance : []).entries()) {
    const base = `acceptance[${index}]`;
    if (!isPlainObject(criterion)) {
      error(base, '必须是 object', 'TYPE');
      continue;
    }
    if (!/^AC-\d{3,}$/.test(String(criterion.id || ''))) error(`${base}.id`, '必须使用 AC-001 形式的稳定 ID', 'AC_ID');
    else if (ids.has(criterion.id)) error(`${base}.id`, `重复 ID ${criterion.id}`, 'DUPLICATE');
    else ids.add(criterion.id);
    if (!['P0', 'P1', 'P2', 'P3'].includes(criterion.priority)) error(`${base}.priority`, '必须是 P0/P1/P2/P3', 'PRIORITY');
    if (typeof criterion.blocking !== 'boolean') error(`${base}.blocking`, '必须为 boolean', 'TYPE');
    if (typeof criterion.human_gate !== 'boolean') error(`${base}.human_gate`, '必须为 boolean', 'TYPE');
    if (!Array.isArray(criterion.dimensions) || !criterion.dimensions.length || criterion.dimensions.some((item) => !nonEmptyString(item))) error(`${base}.dimensions`, '必须声明非空 policy pack 验收维度', 'DIMENSION_REQUIRED');
    if (!Array.isArray(criterion.requirement_refs) || !criterion.requirement_refs.length || criterion.requirement_refs.some((item) => !nonEmptyString(item))) error(`${base}.requirement_refs`, '必须至少关联一个非空 REQ', 'TRACEABILITY');
    else for (const ref of criterion.requirement_refs) if (!requirementIds.has(ref)) error(`${base}.requirement_refs`, `引用不存在的 requirement: ${ref}`, 'ORPHAN_REFERENCE');
    if (!Array.isArray(criterion.risk_refs) || criterion.risk_refs.some((item) => !nonEmptyString(item))) error(`${base}.risk_refs`, '必须显式定义非空字符串数组', 'TRACEABILITY');
    else for (const ref of criterion.risk_refs) if (!riskIds.has(ref)) error(`${base}.risk_refs`, `引用不存在的 risk: ${ref}`, 'ORPHAN_REFERENCE');
    for (const field of ['given', 'when', 'then']) if (!nonEmptyString(criterion[field])) error(`${base}.${field}`, '必须为非空字符串', 'REQUIRED');
    if (!nonEmptyString(criterion.threshold)) error(`${base}.threshold`, 'blocking AC 必须定义阈值/判定边界', 'THRESHOLD_REQUIRED');
    if (!(nonEmptyString(criterion.environment) || (isPlainObject(criterion.environment) && Object.keys(criterion.environment).length))) error(`${base}.environment`, '必须定义环境或审计级 N/A 原因', 'ENVIRONMENT_REQUIRED');
    if (!(nonEmptyString(criterion.fixture) || (isPlainObject(criterion.fixture) && Object.keys(criterion.fixture).length))) error(`${base}.fixture`, '必须定义 fixture/dataset 或审计级 N/A 原因', 'FIXTURE_REQUIRED');
    if (!isPlainObject(criterion.freshness) || !Number.isFinite(criterion.freshness.max_age_minutes) || criterion.freshness.max_age_minutes <= 0) error(`${base}.freshness`, '必须定义 freshness.max_age_minutes 正数', 'FRESHNESS_REQUIRED');
    const combinedText = [criterion.given, criterion.when, criterion.then].filter(Boolean).join(' ');
    const ambiguous = findAmbiguousTerms(combinedText);
    if (ambiguous.length && !hasNumericThreshold(combinedText) && !(criterion.oracle && criterion.oracle.type === 'manual' && Array.isArray(criterion.oracle.rubric) && criterion.oracle.rubric.length)) {
      error(base, `包含模糊词但没有量化阈值或 manual rubric: ${ambiguous.join(', ')}`, 'AMBIGUOUS_WITHOUT_ORACLE');
    }
    if (['P0', 'P1'].includes(criterion.priority) && (!Array.isArray(criterion.evidence_required) || !criterion.evidence_required.length || criterion.evidence_required.some((item) => !nonEmptyString(item)))) {
      error(`${base}.evidence_required`, 'P0/P1 必须定义非空 evidence_required', 'EVIDENCE_REQUIRED');
    }
    if (!isPlainObject(criterion.oracle)) error(`${base}.oracle`, '必须定义 oracle', 'ORACLE_REQUIRED');
    else {
      const oracle = criterion.oracle;
      if (![...AUTOMATABLE_ORACLE_TYPES, ...HUMAN_ORACLE_TYPES].includes(oracle.type)) error(`${base}.oracle.type`, '必须是 command/file/api/browser/metric/manual', 'ORACLE_TYPE');
      if (criterion.human_gate === true && oracle.type !== 'manual') error(`${base}.oracle.type`, 'human_gate 必须使用 manual oracle', 'HUMAN_ORACLE');
      if (oracle.type === 'manual' && criterion.human_gate !== true) error(`${base}.human_gate`, 'manual oracle 必须声明 human_gate: true', 'HUMAN_ORACLE');
      if (oracle.type === 'manual') {
        if (!Array.isArray(oracle.rubric) || !oracle.rubric.length || oracle.rubric.some((item) => !nonEmptyString(item))) {
          error(`${base}.oracle.rubric`, 'manual oracle 必须包含可逐项签收的非空 rubric', 'MANUAL_RUBRIC');
        }
      }
      if (oracle.type === 'command') collectCommandSpecIssues(oracle, `${base}.oracle`, error);
      if (oracle.type === 'file') collectFileSpecIssues(oracle, `${base}.oracle`, error);
    }
    if (criterion.waiver && criterion.waiver.allowed === true) {
      if (!Array.isArray(criterion.waiver.approvers) || !criterion.waiver.approvers.length) error(`${base}.waiver.approvers`, '允许 waiver 时必须指定 approvers', 'WAIVER_POLICY');
      if (!Array.isArray(criterion.waiver.scopes) || !criterion.waiver.scopes.length) error(`${base}.waiver.scopes`, '允许 waiver 时必须指定 scopes', 'WAIVER_POLICY');
      if (!Number.isInteger(criterion.waiver.max_expiry_days) || criterion.waiver.max_expiry_days < 1) error(`${base}.waiver.max_expiry_days`, '允许 waiver 时必须限制最大有效天数', 'WAIVER_POLICY');
    }
  }
  if (Array.isArray(contract.acceptance) && !contract.acceptance.some((item) => item && item.blocking === true && item.human_gate === true && item.oracle && item.oracle.type === 'manual')) {
    error('acceptance', '至少需要一个 blocking manual human gate；自主 runner 只能进入 READY_FOR_HUMAN_ACCEPTANCE', 'HUMAN_GATE_REQUIRED');
  }

  if (isPlainObject(contract.scope) && Array.isArray(contract.scope.preserved_invariants)) {
    const mappings = Array.isArray(contract.scope.invariant_acceptance_refs) ? contract.scope.invariant_acceptance_refs : [];
    for (const [index, invariant] of contract.scope.preserved_invariants.entries()) {
      const mapping = mappings.find((item) => isPlainObject(item) && item.invariant === invariant);
      if (!mapping || !Array.isArray(mapping.acceptance_refs) || !mapping.acceptance_refs.length) {
        error(`scope.preserved_invariants[${index}]`, '每条 invariant 必须在 invariant_acceptance_refs 中映射到至少一个 AC', 'INVARIANT_TRACEABILITY');
      } else {
        for (const ref of mapping.acceptance_refs) if (!ids.has(ref)) error('scope.invariant_acceptance_refs', `引用不存在的 acceptance criterion: ${ref}`, 'ORPHAN_REFERENCE');
      }
    }
    for (const [index, mapping] of mappings.entries()) {
      if (!isPlainObject(mapping) || !contract.scope.preserved_invariants.includes(mapping.invariant)) error(`scope.invariant_acceptance_refs[${index}]`, '必须引用 preserved_invariants 中的精确文本', 'INVARIANT_TRACEABILITY');
    }
  }

  if (Array.isArray(contract.requirements)) {
    const covered = new Set((contract.acceptance || []).flatMap((item) => Array.isArray(item.requirement_refs) ? item.requirement_refs : []));
    for (const item of contract.requirements) if (item && ['P0', 'P1'].includes(item.priority) && !covered.has(item.id)) error('requirements', `${item.id} 没有任何 acceptance criterion 覆盖`, 'ORPHAN_REQUIREMENT');
  }
  if (Array.isArray(contract.risks)) {
    const coveredRisks = new Set((contract.acceptance || []).flatMap((item) => Array.isArray(item.risk_refs) ? item.risk_refs : []));
    for (const [index, risk] of contract.risks.entries()) {
      for (const ref of risk && Array.isArray(risk.acceptance_refs) ? risk.acceptance_refs : []) if (!ids.has(ref)) error(`risks[${index}].acceptance_refs`, `引用不存在的 acceptance criterion: ${ref}`, 'ORPHAN_REFERENCE');
      if (risk && ['P0', 'P1'].includes(risk.priority) && !coveredRisks.has(risk.id)) error('risks', `${risk.id} 没有被任何 acceptance criterion 的 risk_refs 覆盖`, 'ORPHAN_RISK');
    }
  }

  if (!isPlainObject(contract.autonomy)) error('autonomy', '必须定义 autonomy object', 'REQUIRED');
  else {
    for (const field of ['max_elapsed_minutes', 'max_cost_units', 'cost_per_execution']) {
      if (!Number.isFinite(contract.autonomy[field]) || contract.autonomy[field] <= 0) error(`autonomy.${field}`, '必须为正数', 'BUDGET');
    }
    for (const field of ['max_iterations', 'max_command_executions', 'max_same_failure', 'max_no_progress']) {
      if (!Number.isInteger(contract.autonomy[field]) || contract.autonomy[field] <= 0) error(`autonomy.${field}`, '必须为正整数', 'BUDGET');
    }
    if (contract.autonomy.max_diff_lines !== undefined && (!Number.isInteger(contract.autonomy.max_diff_lines) || contract.autonomy.max_diff_lines < 0)) error('autonomy.max_diff_lines', '必须为非负整数', 'BUDGET');
    for (const field of ['allowed_actions', 'forbidden_actions', 'ask_before']) {
      if (!Array.isArray(contract.autonomy[field]) || contract.autonomy[field].some((item) => !nonEmptyString(item))) error(`autonomy.${field}`, '必须显式定义非空字符串数组', 'AUTONOMY_POLICY');
    }
    const allowedActions = new Set(Array.isArray(contract.autonomy.allowed_actions) ? contract.autonomy.allowed_actions : []);
    const forbiddenActions = new Set(Array.isArray(contract.autonomy.forbidden_actions) ? contract.autonomy.forbidden_actions : []);
    const askActions = new Set(Array.isArray(contract.autonomy.ask_before) ? contract.autonomy.ask_before : []);
    for (const action of allowedActions) if (forbiddenActions.has(action) || askActions.has(action)) error('autonomy', `action ${action} 同时出现在 allowed 与 forbidden/ask_before`, 'AUTONOMY_CONFLICT');
    for (const criterion of contract.acceptance || []) {
      if (criterion && !criterion.human_gate && criterion.oracle && !allowedActions.has(`oracle:${criterion.oracle.type}`)) error('autonomy.allowed_actions', `缺少 oracle:${criterion.oracle.type}，runner 不得执行 ${criterion.id}`, 'AUTONOMY_ACTION_MISSING');
    }
    if (contract.autonomy.iteration_command !== undefined && !allowedActions.has('remediation:command')) error('autonomy.allowed_actions', 'iteration_command 需要 remediation:command', 'AUTONOMY_ACTION_MISSING');
    if (!Array.isArray(contract.autonomy.oracle_env_allowlist) || contract.autonomy.oracle_env_allowlist.some((item) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(item || '')) || FORBIDDEN_ORACLE_ENV_NAMES.has(item) || /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|API_KEY)/i.test(item))) {
      error('autonomy.oracle_env_allowlist', '只能列出安全环境变量名，禁止 secret、credential 与 loader 注入变量', 'ORACLE_ENV_POLICY');
    }
    if (!nonEmptyString(contract.autonomy.cost_unit)) error('autonomy.cost_unit', '必须定义 cost unit', 'BUDGET');
    for (const field of ['flaky_policy', 'retry_policy', 'checkpoint']) if (!isPlainObject(contract.autonomy[field]) || !Object.keys(contract.autonomy[field]).length) error(`autonomy.${field}`, '必须显式定义非空 object', 'AUTONOMY_POLICY');
    if (!isPlainObject(contract.autonomy.flaky_policy) || contract.autonomy.flaky_policy.same_snapshot_conflict !== 'BLOCK' || contract.autonomy.flaky_policy.max_rechecks !== 0) error('autonomy.flaky_policy', 'v1 必须对同快照冲突 BLOCK 且 max_rechecks=0', 'FLAKY_POLICY');
    if (!isPlainObject(contract.autonomy.retry_policy) || contract.autonomy.retry_policy.max_attempts !== 1 || !Array.isArray(contract.autonomy.retry_policy.retryable_reasons) || contract.autonomy.retry_policy.retryable_reasons.length !== 0) error('autonomy.retry_policy', 'v1 runner 不自动重试：max_attempts=1 且 retryable_reasons=[]', 'RETRY_POLICY');
    if (!isPlainObject(contract.autonomy.checkpoint) || contract.autonomy.checkpoint.integrity_required !== true || contract.autonomy.checkpoint.ledger_head_required !== true) error('autonomy.checkpoint', '必须要求 checkpoint HMAC integrity 与 ledger head/count 绑定', 'CHECKPOINT_POLICY');
    const stopCodes = new Set(Array.isArray(contract.autonomy.stop_condition_codes) ? contract.autonomy.stop_condition_codes : []);
    for (const code of REQUIRED_STOP_CONDITIONS) if (!stopCodes.has(code)) error('autonomy.stop_condition_codes', `缺少必需停止条件 ${code}`, 'STOP_CONDITION');
    if (!Array.isArray(contract.autonomy.stop_conditions) || !contract.autonomy.stop_conditions.length || contract.autonomy.stop_conditions.some((item) => !nonEmptyString(item))) error('autonomy.stop_conditions', '至少定义一个非空停止条件', 'STOP_CONDITION');
    if (contract.autonomy.iteration_command !== undefined) collectCommandSpecIssues(contract.autonomy.iteration_command, 'autonomy.iteration_command', error);
  }
  collectPlaceholderIssues(contract, '', error);
  issues.push(...collectPolicyPackIssues(contract));
  return issues;
}

function collectCommandSpecIssues(spec, base, addError) {
  if (!isPlainObject(spec)) {
    addError(base, 'command spec 必须是 object', 'COMMAND_SPEC');
    return;
  }
  if (!nonEmptyString(spec.command) || /[\u0000\r\n]/.test(String(spec.command || ''))) addError(`${base}.command`, '必须是单一 executable 字符串', 'COMMAND_SPEC');
  if (!Array.isArray(spec.args) || spec.args.some((item) => typeof item !== 'string' || /[\u0000\r\n]/.test(item))) addError(`${base}.args`, '必须是无 NUL/换行的字符串数组', 'COMMAND_SPEC');
  if (spec.cwd !== undefined && (!nonEmptyString(spec.cwd) || /[\u0000\r\n*?]/.test(String(spec.cwd)) || path.isAbsolute(spec.cwd) || String(spec.cwd).split(/[\\/]+/).includes('..'))) {
    addError(`${base}.cwd`, '必须是工作区内不含通配符、换行或 .. 的相对目录', 'COMMAND_SPEC');
  }
  if (Object.hasOwn(spec, 'shell')) addError(`${base}.shell`, '禁止 shell 字段；runner 固定 shell:false', 'SHELL_FORBIDDEN');
  const basename = path.basename(String(spec.command || '')).toLowerCase();
  if (FORBIDDEN_SHELL_COMMANDS.has(basename)) addError(`${base}.command`, '禁止以 shell 解释器作为 oracle command', 'SHELL_FORBIDDEN');
  if (spec.timeout_ms !== undefined && (!Number.isInteger(spec.timeout_ms) || spec.timeout_ms < 1 || spec.timeout_ms > 3600000)) addError(`${base}.timeout_ms`, '必须是 1..3600000 的整数', 'COMMAND_SPEC');
  if (spec.expected_exit_code !== undefined && !Number.isInteger(spec.expected_exit_code)) addError(`${base}.expected_exit_code`, '必须是整数', 'COMMAND_SPEC');
  for (const field of ['stdout_contains', 'stderr_contains']) {
    if (spec[field] !== undefined && (!Array.isArray(spec[field]) || spec[field].some((item) => typeof item !== 'string' || !item.length))) addError(`${base}.${field}`, '必须是非空字符串数组', 'COMMAND_SPEC');
  }
  if (!Array.isArray(spec.integrity_paths) || !spec.integrity_paths.length || spec.integrity_paths.some((item) => !nonEmptyString(item) || path.isAbsolute(item) || String(item).split(/[\\/]+/).includes('..'))) {
    addError(`${base}.integrity_paths`, '必须定义工作区内受保护的 oracle/test 路径', 'ORACLE_INTEGRITY');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(String(spec.integrity_fingerprint || ''))) addError(`${base}.integrity_fingerprint`, '必须是 integrity_paths 的 sha256 fingerprint', 'ORACLE_INTEGRITY');
  const safetyReason = commandSafetyViolation(spec);
  if (safetyReason) addError(base, `自主 oracle 禁止此命令: ${safetyReason}`, 'UNSAFE_COMMAND');
}

function commandSafetyViolation(spec) {
  const executableName = path.basename(String(spec && spec.command || '')).toLowerCase();
  const executable = executableName.replace(/\.(?:exe|cmd|bat)$/i, '');
  const args = Array.isArray(spec && spec.args) ? spec.args : [];
  for (const arg of args) {
    const candidate = String(arg).startsWith('--') && String(arg).includes('=') ? String(arg).slice(String(arg).indexOf('=') + 1) : String(arg);
    if (path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate)) return 'absolute path argument';
    if (candidate.replace(/\\/g, '/').split('/').includes('..')) return 'parent traversal argument';
  }
  if (FORBIDDEN_SHELL_COMMANDS.has(executable)) return 'shell interpreter';
  if (HARD_BLOCKED_EXECUTABLES.has(executable)) return `blocked executable ${executable}`;
  if (['node', 'nodejs', 'deno', 'python', 'python3', 'ruby', 'perl', 'php'].includes(executable)) {
    if (args.some((arg) => ['-e', '--eval', '-p', '--print', '-c', '--command', '-'].includes(arg))) return 'inline code or stdin execution';
  }
  if (executable === 'git') {
    const subcommand = args.find((arg) => !arg.startsWith('-'));
    if (!subcommand || !READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) return `git ${subcommand || '<missing>'} is not read-only`;
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(executable)) {
    const subcommand = args.find((arg) => !arg.startsWith('-')) || '';
    if (['install', 'i', 'add', 'remove', 'uninstall', 'publish', 'unpublish', 'login', 'logout', 'token', 'config', 'exec', 'dlx'].includes(subcommand)) return `${executable} ${subcommand} may mutate or reach remote systems`;
  }
  return null;
}

function commandSpecHash(spec) {
  return hashCanonical(spec);
}

function resolveExecutableIdentity(command, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const environment = options.env || process.env;
  const platform = options.platform || process.platform;
  const requested = String(command || '');
  const basename = path.basename(requested).toLowerCase();
  if (platform === 'win32' && ['npm', 'npm.cmd'].includes(basename)) return resolveWindowsNpmIdentity(environment);
  let candidate = null;
  if (!requested.includes('/') && !requested.includes('\\') && ['node', 'nodejs'].includes(basename)) candidate = process.execPath;
  else if (path.isAbsolute(requested)) candidate = requested;
  else if (requested.includes('/') || requested.includes('\\')) candidate = path.resolve(cwd, requested);
  else {
    const platformExtensions = platform === 'win32' ? String(environment.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean) : [''];
    const requestedExtension = path.extname(requested).toUpperCase();
    const extensions = platform === 'win32' && platformExtensions.map((item) => item.toUpperCase()).includes(requestedExtension) ? [''] : platformExtensions;
    for (const directory of String(environment.PATH || '').split(path.delimiter).filter(Boolean)) {
      for (const extension of extensions) {
        const possible = path.join(directory, platform === 'win32' ? `${requested}${extension}` : requested);
        try { if (fs.statSync(possible).isFile()) { candidate = possible; break; } } catch { /* continue */ }
      }
      if (candidate) break;
    }
  }
  if (!candidate) throw new Error(`找不到 executable: ${requested}`);
  const resolved = fs.realpathSync(candidate);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`executable 不是 regular file: ${requested}`);
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(resolved)) throw new Error(`禁止直接执行 Windows command shim: ${requested}`);
  return { fingerprint: sha256(fs.readFileSync(resolved)), path: resolved, path_hash: sha256(resolved), prefix_args: [] };
}

function resolveWindowsNpmIdentity(environment) {
  const candidates = [
    environment && environment.npm_execpath,
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ...String(environment && environment.PATH || process.env.PATH || '').split(path.delimiter).filter(Boolean).flatMap((directory) => [
      path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(directory, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(directory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    ])
  ].filter(Boolean);
  const npmCli = candidates.find((candidate) => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  });
  if (!npmCli) throw new Error('Windows 上找不到 npm-cli.js；请通过 npm run 启动或使用显式 node Oracle');
  const nodePath = fs.realpathSync(process.execPath);
  const cliPath = fs.realpathSync(npmCli);
  const nodeHash = sha256(fs.readFileSync(nodePath));
  const cliHash = sha256(fs.readFileSync(cliPath));
  return {
    fingerprint: hashCanonical({ launcher: nodeHash, script: cliHash }),
    path: nodePath,
    path_hash: hashCanonical({ launcher_path: sha256(nodePath), script_path: sha256(cliPath) }),
    prefix_args: [cliPath]
  };
}

function collectFileSpecIssues(spec, base, addError) {
  if (!isPlainObject(spec)) {
    addError(base, 'file spec 必须是 object', 'FILE_SPEC');
    return;
  }
  if (!nonEmptyString(spec.path) || path.isAbsolute(spec.path) || String(spec.path).split(/[\\/]+/).includes('..')) addError(`${base}.path`, '必须是工作区内不含 .. 的相对路径', 'FILE_SPEC');
  if (spec.exists !== undefined && typeof spec.exists !== 'boolean') addError(`${base}.exists`, '必须是 boolean', 'FILE_SPEC');
  const assertions = ['exists', 'sha256', 'text_contains', 'max_bytes'].filter((field) => spec[field] !== undefined);
  if (!assertions.length) addError(base, 'file oracle 至少定义 exists/sha256/text_contains/max_bytes 之一', 'FILE_SPEC');
  if (spec.sha256 !== undefined && !/^sha256:[a-f0-9]{64}$/.test(String(spec.sha256))) addError(`${base}.sha256`, '必须是 sha256 fingerprint', 'FILE_SPEC');
  if (spec.text_contains !== undefined && (!Array.isArray(spec.text_contains) || spec.text_contains.some((item) => typeof item !== 'string'))) addError(`${base}.text_contains`, '必须是字符串数组', 'FILE_SPEC');
  if (spec.max_bytes !== undefined && (!Number.isInteger(spec.max_bytes) || spec.max_bytes < 0)) addError(`${base}.max_bytes`, '必须是非负整数', 'FILE_SPEC');
}

function validateCompletionContract(contract) {
  const issues = collectContractIssues(contract);
  const errors = issues.filter((item) => item.severity === 'error');
  if (errors.length) {
    const validationError = new Error(`Completion Contract 校验失败:\n- ${errors.map((item) => `${item.path}: ${item.message}`).join('\n- ')}`);
    validationError.issues = issues;
    throw validationError;
  }
  return { contract, issues, contract_hash: hashCanonical(contract) };
}

function validateEvidencePayload(payload) {
  if (!isPlainObject(payload)) throw new Error('evidence 必须是 object');
  assertOnlyKeys(payload, EVIDENCE_ROOT_FIELDS, 'evidence');
  if (payload.schema_version !== undefined && payload.schema_version !== '1.0') throw new Error('evidence.schema_version 必须为 1.0');
  if (!/^AC-\d{3,}$/.test(String(payload.criterion_id || ''))) throw new Error('evidence.criterion_id 必须使用 AC-001 形式');
  if (!EVIDENCE_STATUSES.includes(payload.status)) throw new Error(`evidence.status 必须是 ${EVIDENCE_STATUSES.join('/')}`);
  for (const field of ['contract_hash', 'source_fingerprint', 'environment_fingerprint']) {
    if (!/^sha256:[a-f0-9]{64}$/.test(String(payload[field] || ''))) throw new Error(`evidence.${field} 必须是 sha256 fingerprint`);
  }
  if (!isPlainObject(payload.executor) || !nonEmptyString(payload.executor.type)) throw new Error('evidence.executor.type 必须为非空字符串');
  assertOnlyKeys(payload.executor, ['type', 'oracle_hash', 'principal', 'signed_by', 'record_hash'], 'evidence.executor');
  if (payload.observed_at !== undefined) {
    const observed = Date.parse(payload.observed_at);
    if (!Number.isFinite(observed)) throw new Error('evidence.observed_at 必须是有效时间');
    if (observed > Date.now() + 5 * 60000) throw new Error('evidence.observed_at 不得超过当前时间 5 分钟');
  }
  if (payload.artifacts !== undefined) {
    if (!Array.isArray(payload.artifacts)) throw new Error('evidence.artifacts 必须是数组');
    for (const [index, artifact] of payload.artifacts.entries()) {
      if (!isPlainObject(artifact) || !nonEmptyString(artifact.path) || path.isAbsolute(artifact.path) || String(artifact.path).split(/[\\/]+/).includes('..')) throw new Error(`evidence.artifacts[${index}].path 必须是安全相对路径`);
      assertOnlyKeys(artifact, ['path', 'sha256'], `evidence.artifacts[${index}]`);
      if (!/^sha256:[a-f0-9]{64}$/.test(String(artifact.sha256 || ''))) throw new Error(`evidence.artifacts[${index}].sha256 必须是 sha256 fingerprint`);
    }
  }
  if (payload.evidence_manifest !== undefined && (!Array.isArray(payload.evidence_manifest) || payload.evidence_manifest.some((item) => !nonEmptyString(item)))) {
    throw new Error('evidence.evidence_manifest 必须是非空字符串数组');
  }
  if (['PASS', 'WAIVED'].includes(payload.status) && (!Array.isArray(payload.evidence_manifest) || !payload.evidence_manifest.length)) {
    throw new Error(`${payload.status} evidence 必须包含 evidence_manifest`);
  }
  if (payload.status === 'WAIVED') {
    if (!isPlainObject(payload.waiver) || !nonEmptyString(payload.waiver.approved_by) || !nonEmptyString(payload.waiver.scope) || !nonEmptyString(payload.waiver.reason) || !nonEmptyString(payload.waiver.compensation) || !nonEmptyString(payload.waiver.expires_at)) {
      throw new Error('WAIVED evidence 必须包含 waiver.approved_by/scope/reason/compensation/expires_at');
    }
    if (!Number.isFinite(Date.parse(payload.waiver.expires_at))) throw new Error('waiver.expires_at 必须是有效时间');
    assertOnlyKeys(payload.waiver, ['approved_by', 'scope', 'reason', 'compensation', 'expires_at'], 'evidence.waiver');
  }
  if (payload.attestation !== undefined) {
    const attestation = payload.attestation;
    if (!isPlainObject(attestation) || attestation.algorithm !== 'hmac-sha256' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(attestation.key_id || '')) || !/^hmac-sha256:[a-f0-9]{64}$/.test(String(attestation.signature || ''))) {
      throw new Error('evidence.attestation 必须包含 hmac-sha256 algorithm/key_id/signature');
    }
    assertOnlyKeys(attestation, ['algorithm', 'key_id', 'signature'], 'evidence.attestation');
  }
  return payload;
}

function readLedger(file, options = {}) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return [];
  const text = fs.readFileSync(resolved, 'utf8');
  const entries = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { throw new Error(`${resolved}:${index + 1} 不是有效 JSONL`); }
    entries.push(entry);
  }
  if (options.verify !== false) verifyLedgerEntries(entries);
  return entries;
}

function evidenceHashBody(entry) {
  const copy = { ...entry };
  delete copy.entry_hash;
  return copy;
}

function verifyLedgerEntries(entries) {
  let previous = 'GENESIS';
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.sequence !== index + 1) throw new Error(`ledger sequence 断裂: 期望 ${index + 1}，实际 ${entry.sequence}`);
    if (entry.previous_hash !== previous) throw new Error(`ledger previous_hash 断裂: sequence ${entry.sequence}`);
    validateEvidencePayload(entry);
    const expected = hashCanonical(evidenceHashBody(entry));
    if (entry.entry_hash !== expected) throw new Error(`ledger entry_hash 无效: sequence ${entry.sequence}`);
    previous = entry.entry_hash;
  }
  return { valid: true, count: entries.length, head_hash: previous };
}

function appendEvidence(file, payload, options = {}) {
  validateEvidencePayload(payload);
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const lockFile = `${resolved}.lock`;
  const lockToken = crypto.randomBytes(16).toString('hex');
  let lock;
  try {
    lock = fs.openSync(lockFile, 'wx', 0o600);
    fs.writeFileSync(lock, JSON.stringify({
      schema_version: '1.0',
      token: lockToken,
      pid: process.pid,
      host: os.hostname(),
      acquired_at: new Date().toISOString(),
      process_start_at: new Date(Date.now() - process.uptime() * 1000).toISOString()
    }) + '\n');
    fs.fsyncSync(lock);
  } catch (error) {
    if (lock !== undefined) {
      try { fs.closeSync(lock); } catch { /* preserve original error */ }
      lock = undefined;
      try { fs.unlinkSync(lockFile); } catch { /* preserve original error */ }
    }
    if (error.code === 'EEXIST') {
      let detail = '';
      try {
        const record = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        if (record && record.token) detail = ` token=${record.token} acquired_at=${record.acquired_at || '<unknown>'} host=${record.host || '<unknown>'}`;
      } catch { /* malformed lock still blocks; recovery will refuse it */ }
      throw new Error(`Evidence Ledger 正被另一个 writer 持有，拒绝无锁 append: ${lockFile}${detail}`);
    }
    throw error;
  }
  try {
    const entries = readLedger(resolved);
    const previous = entries.length ? entries[entries.length - 1].entry_hash : 'GENESIS';
    const entry = {
      ...payload,
      schema_version: '1.0',
      sequence: entries.length + 1,
      previous_hash: previous,
      observed_at: payload.observed_at || new Date().toISOString()
    };
    delete entry.entry_hash;
    if (options.attestationKey !== undefined) {
      entry.attestation = signEvidenceEntry(entry, options.attestationKey, options.attestationKeyId);
    }
    validateEvidencePayload(entry);
    entry.entry_hash = hashCanonical(evidenceHashBody(entry));
    const descriptor = fs.openSync(resolved, 'a', 0o600);
    try {
      fs.writeSync(descriptor, JSON.stringify(entry) + '\n');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (options.verifyAfterAppend !== false) verifyLedgerEntries(readLedger(resolved, { verify: false }));
    return entry;
  } finally {
    if (lock !== undefined) fs.closeSync(lock);
    try {
      const current = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (current.token !== lockToken) throw new Error(`Evidence Ledger lock ownership 已变化，拒绝删除非本 writer 的 lock: ${lockFile}`);
      fs.unlinkSync(lockFile);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function recoverEvidenceLedgerLock(file, options = {}) {
  const resolved = path.resolve(file);
  const lockFile = `${resolved}.lock`;
  const expectedToken = String(options.lockToken || '');
  if (!/^[a-f0-9]{32}$/.test(expectedToken)) throw new Error('stale lock 恢复必须提供 lock 输出中精确的 32 位十六进制 token');
  const minAgeMs = options.minAgeMs === undefined ? 60000 : Number(options.minAgeMs);
  if (!Number.isInteger(minAgeMs) || minAgeMs < 60000) throw new Error('minAgeMs 必须是至少 60000 的整数');
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const stat = fs.lstatSync(lockFile);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Evidence Ledger lock 必须是非符号链接 regular file: ${lockFile}`);
  const original = fs.readFileSync(lockFile, 'utf8');
  let record;
  try { record = JSON.parse(original); } catch { throw new Error(`Evidence Ledger lock 不是有效 JSON，必须人工隔离检查: ${lockFile}`); }
  assertOnlyKeys(record, ['schema_version', 'token', 'pid', 'host', 'acquired_at', 'process_start_at'], 'Evidence Ledger lock');
  if (record.schema_version !== '1.0' || record.token !== expectedToken) throw new Error('Evidence Ledger lock token 或 schema 不匹配；拒绝恢复可能已换主的 lock');
  if (record.host !== os.hostname()) throw new Error(`Evidence Ledger lock 来自其他 host (${record.host || '<missing>'})，拒绝本机自动恢复`);
  const acquiredAt = Date.parse(record.acquired_at);
  if (!Number.isFinite(acquiredAt) || acquiredAt > nowMs || nowMs - acquiredAt < minAgeMs) throw new Error(`Evidence Ledger lock 尚未达到 stale 最小年龄 ${minAgeMs}ms`);
  if (!Number.isInteger(record.pid) || record.pid < 1) throw new Error('Evidence Ledger lock pid 无效，必须人工隔离检查');
  if (processIsAlive(record.pid)) throw new Error(`Evidence Ledger writer pid ${record.pid} 仍存活，拒绝恢复 lock`);
  if (fs.readFileSync(lockFile, 'utf8') !== original) throw new Error('Evidence Ledger lock 在检查期间发生变化，拒绝恢复');
  const quarantine = `${lockFile}.stale-${expectedToken}-${nowMs}`;
  fs.renameSync(lockFile, quarantine);
  return { recovered: true, ledger: resolved, lock: lockFile, quarantine, record };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    return true;
  }
}

function validateCurrentArtifacts(entry, artifactRoot, options = {}) {
  if (!entry.artifacts || !entry.artifacts.length) return null;
  if (!artifactRoot) return { status: 'BLOCKED', reason: 'ARTIFACT_ROOT_REQUIRED', evidence_status: entry.status };
  for (const artifact of entry.artifacts) {
    let file;
    try { file = ensureWithin(artifactRoot, artifact.path, 'artifact path'); } catch {
      return { status: 'BLOCKED', reason: 'ARTIFACT_PATH_INVALID', evidence_status: entry.status };
    }
    let stat;
    try { stat = fs.lstatSync(file); } catch {
      return { status: 'STALE', reason: 'ARTIFACT_MISSING', evidence_status: entry.status };
    }
    if (!stat.isFile() || stat.isSymbolicLink()) return { status: 'STALE', reason: 'ARTIFACT_TYPE_CHANGED', evidence_status: entry.status };
    try { resolveExistingWithin(artifactRoot, artifact.path, 'artifact path'); }
    catch { return { status: 'BLOCKED', reason: 'ARTIFACT_REALPATH_UNSAFE', evidence_status: entry.status }; }
    const hardMaxBytes = Number(options.maxArtifactBytes || 16 * 1024 * 1024);
    if (stat.size > hardMaxBytes) return { status: 'BLOCKED', reason: 'ARTIFACT_HARD_SIZE_LIMIT', evidence_status: entry.status };
    if (sha256(fs.readFileSync(file)) !== artifact.sha256) return { status: 'STALE', reason: 'ARTIFACT_HASH_MISMATCH', evidence_status: entry.status };
  }
  return null;
}

function validateEvidenceProvenance(entry, criterion, contract, options = {}) {
  if (!['PASS', 'WAIVED'].includes(entry.status)) return null;
  const policy = contract.governance && contract.governance.evidence_attestation;
  if (!isPlainObject(policy) || policy.required_for_success !== true) return { status: 'BLOCKED', reason: 'ATTESTATION_POLICY_MISSING', evidence_status: entry.status };
  const attestation = verifyEvidenceAttestation(entry, options.attestationKeys);
  if (!attestation.valid) return { status: 'BLOCKED', reason: attestation.reason, evidence_status: entry.status };
  const keyPrincipal = policy.key_principals && policy.key_principals[attestation.key_id];
  if (!isPlainObject(keyPrincipal) || !nonEmptyString(keyPrincipal.principal)) return { status: 'BLOCKED', reason: 'ATTESTATION_PRINCIPAL_MISSING', evidence_status: entry.status };

  const requiredManifest = Array.isArray(criterion.evidence_required) ? criterion.evidence_required : [];
  const actualManifest = new Set(entry.evidence_manifest || []);
  if (requiredManifest.some((item) => !actualManifest.has(item))) return { status: 'BLOCKED', reason: 'EVIDENCE_MANIFEST_INCOMPLETE', evidence_status: entry.status };

  if (entry.status === 'WAIVED') {
    if (!(policy.waiver_key_ids || []).includes(attestation.key_id)) return { status: 'BLOCKED', reason: 'WAIVER_ATTESTATION_KEY_NOT_ALLOWED', evidence_status: entry.status };
    if (keyPrincipal.role !== 'human' || !isPlainObject(entry.executor) || entry.executor.type !== 'authorized-human' || entry.executor.signed_by !== entry.waiver.approved_by || keyPrincipal.principal !== entry.executor.signed_by) {
      return { status: 'BLOCKED', reason: 'WAIVER_SIGNER_MISMATCH', evidence_status: entry.status };
    }
    return null;
  }

  if (criterion.human_gate) {
    if (!(policy.human_key_ids || []).includes(attestation.key_id)) return { status: 'BLOCKED', reason: 'HUMAN_ATTESTATION_KEY_NOT_ALLOWED', evidence_status: entry.status };
    const allowedApprovers = new Set([...(contract.approvers || []), ...((criterion.oracle && criterion.oracle.approvers) || [])]);
    if (keyPrincipal.role !== 'human' || !isPlainObject(entry.executor) || entry.executor.type !== 'authorized-human' || !nonEmptyString(entry.executor.signed_by) || !allowedApprovers.has(entry.executor.signed_by) || keyPrincipal.principal !== entry.executor.signed_by) {
      return { status: 'BLOCKED', reason: 'HUMAN_SIGNER_NOT_ALLOWED', evidence_status: entry.status };
    }
    const result = entry.result;
    const rubric = criterion.oracle && Array.isArray(criterion.oracle.rubric) ? criterion.oracle.rubric : [];
    if (!isPlainObject(result) || result.rubric_hash !== hashCanonical(rubric) || !Array.isArray(result.rubric_results) || result.rubric_results.length !== rubric.length) {
      return { status: 'BLOCKED', reason: 'HUMAN_RUBRIC_EVIDENCE_INVALID', evidence_status: entry.status };
    }
    for (let index = 0; index < rubric.length; index++) {
      const item = result.rubric_results[index];
      if (!isPlainObject(item) || item.index !== index || item.passed !== true) return { status: 'BLOCKED', reason: 'HUMAN_RUBRIC_NOT_FULLY_PASSED', evidence_status: entry.status };
    }
    return null;
  }

  if (!(policy.automation_key_ids || []).includes(attestation.key_id)) return { status: 'BLOCKED', reason: 'AUTOMATION_ATTESTATION_KEY_NOT_ALLOWED', evidence_status: entry.status };
  if (keyPrincipal.role !== 'automation' || !isPlainObject(entry.executor) || entry.executor.type !== criterion.oracle.type || entry.executor.oracle_hash !== hashCanonical(criterion.oracle) || entry.executor.principal !== keyPrincipal.principal) {
    return { status: 'BLOCKED', reason: 'ORACLE_PROVENANCE_MISMATCH', evidence_status: entry.status };
  }
  const result = entry.result;
  if (!isPlainObject(result) || result.status !== 'PASS' || !Array.isArray(result.assertions) || !result.assertions.length || result.assertions.some((item) => !item || item.passed !== true)) {
    return { status: 'BLOCKED', reason: 'ORACLE_RESULT_NOT_PROVEN', evidence_status: entry.status };
  }
  return null;
}

function effectiveEvidenceStatus(entry, current, criterion, options = {}) {
  if (!entry) return { status: 'NOT_RUN', reason: 'NO_EVIDENCE' };
  if (entry.contract_hash !== current.contract_hash) return { status: 'STALE', reason: 'CONTRACT_CHANGED', evidence_status: entry.status };
  if (current.source_fingerprint && entry.source_fingerprint !== current.source_fingerprint) return { status: 'STALE', reason: 'SOURCE_CHANGED', evidence_status: entry.status };
  if (current.environment_fingerprint && entry.environment_fingerprint !== current.environment_fingerprint) return { status: 'STALE', reason: 'ENVIRONMENT_CHANGED', evidence_status: entry.status };
  const now = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const observedAt = Date.parse(entry.observed_at);
  if (observedAt > now + 5 * 60000) return { status: 'BLOCKED', reason: 'EVIDENCE_FROM_FUTURE', evidence_status: entry.status };
  if (criterion.freshness && Number.isFinite(criterion.freshness.max_age_minutes) && now - observedAt > criterion.freshness.max_age_minutes * 60000) return { status: 'STALE', reason: 'EVIDENCE_EXPIRED', evidence_status: entry.status };
  const artifactStatus = validateCurrentArtifacts(entry, options.artifactRoot, options);
  if (artifactStatus) return artifactStatus;
  const provenanceStatus = validateEvidenceProvenance(entry, criterion, options.contract, options);
  if (provenanceStatus) return provenanceStatus;
  if (entry.status === 'WAIVED') {
    if (!criterion.waiver || criterion.waiver.allowed !== true) return { status: 'BLOCKED', reason: 'WAIVER_NOT_ALLOWED', evidence_status: 'WAIVED' };
    if (!Array.isArray(criterion.waiver.approvers) || !criterion.waiver.approvers.includes(entry.waiver.approved_by)) return { status: 'BLOCKED', reason: 'WAIVER_APPROVER_NOT_ALLOWED', evidence_status: 'WAIVED' };
    if (!Array.isArray(criterion.waiver.scopes) || !criterion.waiver.scopes.includes(entry.waiver.scope)) return { status: 'BLOCKED', reason: 'WAIVER_SCOPE_NOT_ALLOWED', evidence_status: 'WAIVED' };
    if (Date.parse(entry.waiver.expires_at) <= now) return { status: 'STALE', reason: 'WAIVER_EXPIRED', evidence_status: 'WAIVED' };
    if (criterion.waiver.max_expiry_days !== undefined) {
      const observed = Date.parse(entry.observed_at);
      const expires = Date.parse(entry.waiver.expires_at);
      if (expires - observed > criterion.waiver.max_expiry_days * 86400000) return { status: 'BLOCKED', reason: 'WAIVER_EXPIRY_EXCEEDS_POLICY', evidence_status: 'WAIVED' };
    }
  }
  return { status: entry.status, reason: entry.reason || null };
}

function evaluateDoD(contract, ledgerEntries, options = {}) {
  const validated = validateCompletionContract(contract);
  verifyLedgerEntries(ledgerEntries);
  const actualLedgerHead = ledgerEntries.length ? ledgerEntries[ledgerEntries.length - 1].entry_hash : 'GENESIS';
  const current = {
    contract_hash: validated.contract_hash,
    source_fingerprint: options.sourceFingerprint || options.source_fingerprint || null,
    environment_fingerprint: options.environmentFingerprint || options.environment_fingerprint || null
  };
  const latest = new Map();
  const history = new Map();
  for (const entry of ledgerEntries) {
    latest.set(entry.criterion_id, entry);
    if (!history.has(entry.criterion_id)) history.set(entry.criterion_id, []);
    history.get(entry.criterion_id).push(entry);
  }
  const criteria = contract.acceptance.map((criterion) => {
    const evidence = latest.get(criterion.id);
    let effective = effectiveEvidenceStatus(evidence, current, criterion, {
      artifactRoot: options.artifactRoot || options.cwd || null,
      attestationKeys: options.attestationKeys,
      nowMs: options.nowMs,
      contract
    });
    const sameSnapshotStatuses = new Set((history.get(criterion.id) || [])
      .filter((entry) => entry.contract_hash === current.contract_hash && entry.source_fingerprint === current.source_fingerprint && entry.environment_fingerprint === current.environment_fingerprint)
      .map((entry) => entry.status));
    if (sameSnapshotStatuses.has('PASS') && sameSnapshotStatuses.has('FAIL')) effective = { status: 'BLOCKED', reason: 'FLAKY_SAME_SNAPSHOT_CONFLICT' };
    return {
      id: criterion.id,
      title: criterion.title || criterion.then,
      priority: criterion.priority,
      blocking: criterion.blocking,
      human_gate: criterion.human_gate,
      oracle_type: criterion.oracle.type,
      status: effective.status,
      reason: effective.reason,
      evidence_sequence: evidence ? evidence.sequence : null,
      evidence_hash: evidence ? evidence.entry_hash : null,
      evidence_observed_at: evidence ? evidence.observed_at : null,
      waiver: evidence && evidence.status === 'WAIVED' ? {
        approved_by: evidence.waiver.approved_by,
        scope: evidence.waiver.scope,
        expires_at: evidence.waiver.expires_at
      } : null
    };
  });
  const blockingUnknowns = (contract.unknowns || []).filter((item) => item.blocking === true && item.resolved !== true);
  let findingsManifest = null;
  let findingsError = null;
  try {
    findingsManifest = validateFindingsManifest(options.findingsManifest, contract.governance.findings_registry, { nowMs: options.nowMs });
  } catch (error) { findingsError = error.message; }
  const findingsFingerprint = findingsManifest ? hashCanonical(findingsManifest) : null;
  const openFindings = findingsManifest ? findingsManifest.findings.filter((item) => ['P0', 'P1'].includes(item.priority) && item.status !== 'CLOSED') : [];
  const automationCriteria = criteria.filter((item) => item.blocking && !item.human_gate);
  const humanCriteria = criteria.filter((item) => item.blocking && item.human_gate);
  const satisfied = (item) => TERMINAL_SUCCESS_STATUSES.has(item.status);
  const contractFrozen = contract.feature.status === 'frozen' && contract.governance.status === 'frozen';
  const automationComplete = contractFrozen && Boolean(findingsManifest) && automationCriteria.every(satisfied) && blockingUnknowns.length === 0 && openFindings.length === 0;
  const humanComplete = humanCriteria.length > 0 && humanCriteria.every(satisfied);
  const anchorRequired = Boolean(contract.governance.ledger_anchor && contract.governance.ledger_anchor.required_for_acceptance === true);
  const anchorProvided = isPlainObject(options.ledgerAnchor) && nonEmptyString(options.ledgerAnchorPublicKey);
  let anchorVerification = null;
  let anchorError = null;
  if (anchorProvided) {
    try {
      anchorVerification = verifyLedgerAnchor(options.ledgerAnchor, options.ledgerAnchorPublicKey, {
        keyId: contract.governance.ledger_anchor.key_id,
        publicKeyFingerprint: contract.governance.ledger_anchor.trusted_public_key_sha256,
        maxAgeMinutes: contract.governance.ledger_anchor.max_age_minutes,
        contract_hash: current.contract_hash,
        source_fingerprint: current.source_fingerprint,
        environment_fingerprint: current.environment_fingerprint,
        findings_fingerprint: findingsFingerprint,
        ledger_head_hash: actualLedgerHead,
        ledger_entry_count: ledgerEntries.length,
        nowMs: options.nowMs
      });
    } catch (error) { anchorError = error.message; }
  }
  const anchorValid = !anchorRequired || Boolean(anchorVerification && anchorVerification.valid);
  const anchorReason = !anchorRequired || !humanComplete ? null : !anchorProvided ? 'EXTERNAL_LEDGER_ANCHOR_REQUIRED' : anchorValid ? null : 'EXTERNAL_LEDGER_ANCHOR_INVALID';
  const accepted = automationComplete && humanComplete && anchorValid;
  const counts = Object.fromEntries(EVIDENCE_STATUSES.map((status) => [status, criteria.filter((item) => item.status === status).length]));
  return {
    schema_version: '1.0',
    evaluated_at: new Date().toISOString(),
    contract_hash: current.contract_hash,
    source_fingerprint: current.source_fingerprint,
    environment_fingerprint: current.environment_fingerprint,
    findings_fingerprint: findingsFingerprint,
    findings_manifest: {
      valid: Boolean(findingsManifest),
      snapshot_at: findingsManifest && findingsManifest.snapshot_at || null,
      owner: findingsManifest && findingsManifest.owner || null,
      source: findingsManifest && findingsManifest.source || null,
      error: findingsError
    },
    ledger_head_hash: actualLedgerHead,
    ledger_entry_count: ledgerEntries.length,
    ledger_anchor: {
      required_for_acceptance: anchorRequired,
      provided: anchorProvided,
      valid: anchorValid,
      anchor_id: anchorVerification && anchorVerification.anchor_id || options.ledgerAnchor && options.ledgerAnchor.anchor_id || null,
      anchor_hash: anchorVerification && anchorVerification.anchor_hash || null,
      reason: anchorReason,
      detail: anchorError
    },
    automation_complete: automationComplete,
    accepted,
    state: accepted ? 'ACCEPTED' : automationComplete && humanComplete && anchorReason ? anchorReason : automationComplete ? 'READY_FOR_HUMAN_ACCEPTANCE' : 'INCOMPLETE',
    counts,
    criteria,
    blocking_unknowns: blockingUnknowns.map((item) => item.id),
    open_findings: openFindings.map((item) => item.id || item.title || 'unnamed'),
    blockers: [
      ...(!contractFrozen ? [{ id: 'CONTRACT', status: 'BLOCKED', reason: 'CONTRACT_NOT_FULLY_FROZEN' }] : []),
      ...(!findingsManifest ? [{ id: 'FINDINGS_REGISTRY', status: 'BLOCKED', reason: 'FINDINGS_MANIFEST_MISSING_OR_INVALID', detail: findingsError }] : []),
      ...openFindings.map((item) => ({ id: item.id, status: 'BLOCKED', reason: `OPEN_${item.priority}_FINDING`, title: item.title })),
      ...criteria.filter((item) => item.blocking && !item.human_gate && !satisfied(item)).map((item) => ({ id: item.id, status: item.status, reason: item.reason }))
    ],
    pending_human_gates: humanCriteria.filter((item) => !satisfied(item)).map((item) => ({ id: item.id, status: item.status, reason: item.reason })),
    acceptance_blockers: anchorReason ? [{ id: 'LEDGER_ANCHOR', status: 'BLOCKED', reason: anchorReason }] : []
  };
}

function resolveContractFingerprints(contract, options = {}) {
  const contractHash = hashCanonical(contract);
  const source = options.sourceFingerprint || options.source_fingerprint || fingerprintPaths(contract.scope.source_paths, {
    cwd: options.cwd || process.cwd(),
    excludes: contract.scope.fingerprint_excludes || []
  }).fingerprint;
  const computedEnvironment = fingerprintContractEnvironment(contract, options.environment || 'local');
  const suppliedEnvironment = options.environmentFingerprint || options.environment_fingerprint;
  if (suppliedEnvironment && suppliedEnvironment !== computedEnvironment) throw new Error('提供的 environment fingerprint 与 Contract/fixture/runtime descriptor 不匹配');
  const environment = computedEnvironment;
  return { contract_hash: contractHash, source_fingerprint: source, environment_fingerprint: environment };
}

function runCommandOracle(spec, options = {}) {
  const issues = [];
  collectCommandSpecIssues(spec, 'command', (field, message) => issues.push(`${field}: ${message}`));
  if (issues.length) return { status: 'BLOCKED', reason: 'INVALID_COMMAND_SPEC', assertions: issues.map((message) => ({ type: 'spec', passed: false, message })) };
  const specHash = commandSpecHash(spec);
  const exactAllowed = (options.allowSpecHashes || []).includes(specHash);
  if (!exactAllowed) {
    return { status: 'BLOCKED', reason: 'COMMAND_SPEC_NOT_ALLOWLISTED', spec_hash: specHash, assertions: [{ type: 'command_spec_allowlist', passed: false }] };
  }
  const cwdRoot = path.resolve(options.cwd || process.cwd());
  let commandCwd = cwdRoot;
  try { commandCwd = ensureWithin(cwdRoot, spec.cwd || '.', 'oracle cwd'); } catch (error) {
    return { status: 'BLOCKED', reason: 'CWD_OUTSIDE_WORKSPACE', assertions: [{ type: 'cwd', passed: false }] };
  }
  try {
    const cwdStat = fs.lstatSync(commandCwd);
    if (!cwdStat.isDirectory() || cwdStat.isSymbolicLink()) throw new Error('cwd type');
    resolveExistingWithin(cwdRoot, spec.cwd || '.', 'oracle cwd');
  } catch {
    return { status: 'BLOCKED', reason: 'CWD_REALPATH_UNSAFE', spec_hash: specHash, assertions: [{ type: 'cwd_realpath', passed: false }] };
  }
  let executableIdentity;
  try { executableIdentity = resolveExecutableIdentity(spec.command, { cwd: commandCwd, env: options.env }); }
  catch { return { status: 'BLOCKED', reason: 'EXECUTABLE_UNAVAILABLE', spec_hash: specHash, assertions: [{ type: 'executable', passed: false }] }; }
  const permittedExecutableFingerprint = options.executableFingerprints && options.executableFingerprints[specHash];
  if (!permittedExecutableFingerprint || permittedExecutableFingerprint !== executableIdentity.fingerprint) {
    return { status: 'BLOCKED', reason: 'EXECUTABLE_IDENTITY_NOT_PERMITTED', spec_hash: specHash, assertions: [{ type: 'executable_fingerprint', passed: false }] };
  }
  let integrity;
  try {
    const integrityResult = fingerprintOraclePaths(spec.integrity_paths, { cwd: commandCwd });
    if (integrityResult.records.some((item) => ['missing', 'symlink', 'symlink-file', 'other'].includes(item.type))) {
      return { status: 'BLOCKED', reason: 'ORACLE_INTEGRITY_UNSAFE_TYPE', spec_hash: specHash, assertions: [{ type: 'integrity_type', passed: false }] };
    }
    integrity = integrityResult.fingerprint;
  }
  catch { return { status: 'BLOCKED', reason: 'ORACLE_INTEGRITY_UNMEASURABLE', spec_hash: specHash, assertions: [{ type: 'integrity', passed: false }] }; }
  if (integrity !== spec.integrity_fingerprint) {
    return { status: 'BLOCKED', reason: 'ORACLE_INTEGRITY_MISMATCH', spec_hash: specHash, assertions: [{ type: 'integrity', passed: false, expected: spec.integrity_fingerprint, actual: integrity }] };
  }
  for (const arg of spec.args) {
    if (String(arg).startsWith('-')) continue;
    let candidate;
    try { candidate = ensureWithin(commandCwd, arg, 'command input'); } catch { continue; }
    if (!fs.existsSync(candidate)) continue;
    const relative = normalizeWorkspacePath(path.relative(commandCwd, candidate));
    if (!(spec.integrity_paths || []).some((protectedPath) => pathMatchesPattern(relative, protectedPath))) {
      return { status: 'BLOCKED', reason: 'UNPROTECTED_COMMAND_INPUT', spec_hash: specHash, assertions: [{ type: 'command_input_integrity', path: relative, passed: false }] };
    }
    try {
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink()) throw new Error('symlink');
      resolveExistingWithin(commandCwd, arg, 'command input');
    } catch {
      return { status: 'BLOCKED', reason: 'COMMAND_INPUT_REALPATH_UNSAFE', spec_hash: specHash, assertions: [{ type: 'command_input_realpath', path: relative, passed: false }] };
    }
  }
  const spawnImpl = options.spawnImpl || spawnSync;
  const started = Date.now();
  const requestedTimeout = spec.timeout_ms || 120000;
  const effectiveTimeout = options.timeoutCapMs === undefined ? requestedTimeout : Math.max(1, Math.min(requestedTimeout, Number(options.timeoutCapMs)));
  const result = spawnImpl(executableIdentity.path, [...(executableIdentity.prefix_args || []), ...spec.args], {
    cwd: commandCwd,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: false,
    timeout: effectiveTimeout,
    maxBuffer: options.maxBuffer || 1024 * 1024,
    windowsHide: true
  });
  const expectedExit = spec.expected_exit_code === undefined ? 0 : spec.expected_exit_code;
  const exitCode = Number.isInteger(result.status) ? result.status : null;
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const assertions = [{ type: 'exit_code', passed: exitCode === expectedExit, expected: expectedExit, actual: exitCode }];
  for (const [index, text] of (spec.stdout_contains || []).entries()) assertions.push({ type: 'stdout_contains', index, passed: stdout.includes(text) });
  for (const [index, text] of (spec.stderr_contains || []).entries()) assertions.push({ type: 'stderr_contains', index, passed: stderr.includes(text) });
  const passed = !result.error && !result.signal && assertions.every((item) => item.passed);
  return {
    status: passed ? 'PASS' : 'FAIL',
    reason: result.error ? (result.error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'SPAWN_ERROR') : result.signal ? 'SIGNAL' : passed ? null : 'ASSERTION_FAILED',
    duration_ms: Date.now() - started,
    timeout_ms: effectiveTimeout,
    exit_code: exitCode,
    signal: result.signal || null,
    spec_hash: specHash,
    executable_fingerprint: executableIdentity.fingerprint,
    executable_path_hash: executableIdentity.path_hash,
    stdout_hash: sha256(stdout),
    stderr_hash: sha256(stderr),
    assertions
  };
}

function runFileOracle(spec, options = {}) {
  const issues = [];
  collectFileSpecIssues(spec, 'file', (field, message) => issues.push(`${field}: ${message}`));
  if (issues.length) return { status: 'BLOCKED', reason: 'INVALID_FILE_SPEC', assertions: issues.map((message) => ({ type: 'spec', passed: false, message })) };
  const cwd = path.resolve(options.cwd || process.cwd());
  let file;
  try { file = ensureWithin(cwd, spec.path, 'file oracle path'); } catch {
    return { status: 'BLOCKED', reason: 'FILE_PATH_OUTSIDE_WORKSPACE', assertions: [{ type: 'path', passed: false }] };
  }
  const assertions = [];
  let stat;
    try { stat = fs.lstatSync(file); } catch (error) {
    if (error.code !== 'ENOENT') return { status: 'BLOCKED', reason: 'FILE_STAT_ERROR', assertions: [{ type: 'readable', passed: false }] };
    stat = null;
  }
  const exists = Boolean(stat);
  if (spec.exists !== undefined) assertions.push({ type: 'exists', expected: spec.exists, actual: exists, passed: exists === spec.exists });
  if (!exists) return { status: assertions.every((item) => item.passed) ? 'PASS' : 'FAIL', reason: assertions.every((item) => item.passed) ? null : 'FILE_MISSING', assertions };
  if (!stat.isFile() || stat.isSymbolicLink()) return { status: 'BLOCKED', reason: 'FILE_TYPE_NOT_REGULAR', assertions: [...assertions, { type: 'regular_file', passed: false }] };
  try { resolveExistingWithin(cwd, spec.path, 'file oracle path'); }
  catch { return { status: 'BLOCKED', reason: 'FILE_REALPATH_UNSAFE', assertions: [...assertions, { type: 'realpath', passed: false }] }; }
  const hardMaxBytes = Number(options.maxFileBytes || 16 * 1024 * 1024);
  if (stat.size > hardMaxBytes) return { status: 'BLOCKED', reason: 'FILE_HARD_SIZE_LIMIT', size_bytes: stat.size, assertions: [...assertions, { type: 'hard_max_bytes', expected: hardMaxBytes, actual: stat.size, passed: false }] };
  if (spec.max_bytes !== undefined && stat.size > spec.max_bytes) return { status: 'FAIL', reason: 'ASSERTION_FAILED', size_bytes: stat.size, assertions: [...assertions, { type: 'max_bytes', expected: spec.max_bytes, actual: stat.size, passed: false }] };
  const content = fs.readFileSync(file);
  const digest = sha256(content);
  if (spec.sha256 !== undefined) assertions.push({ type: 'sha256', passed: digest === spec.sha256 });
  if (spec.max_bytes !== undefined) assertions.push({ type: 'max_bytes', expected: spec.max_bytes, actual: content.length, passed: true });
  if (spec.text_contains !== undefined) {
    const text = content.toString('utf8');
    for (const [index, expected] of spec.text_contains.entries()) assertions.push({ type: 'text_contains', index, passed: text.includes(expected) });
  }
  const passed = assertions.length > 0 && assertions.every((item) => item.passed);
  return {
    status: passed ? 'PASS' : 'FAIL',
    reason: passed ? null : 'ASSERTION_FAILED',
    size_bytes: content.length,
    assertions,
    artifacts: [{ path: spec.path.split(path.sep).join('/'), sha256: digest }]
  };
}

function runOracle(spec, options = {}) {
  if (spec.type === 'command') return runCommandOracle(spec, options);
  if (spec.type === 'file') return runFileOracle(spec, options);
  if (spec.type === 'manual') return { status: 'BLOCKED', reason: 'HUMAN_GATE_REQUIRED', assertions: [] };
  return { status: 'BLOCKED', reason: `ORACLE_EXECUTOR_UNAVAILABLE_${String(spec.type || 'UNKNOWN').toUpperCase()}`, assertions: [] };
}

function resolveGitHead(cwd) {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: path.resolve(cwd), encoding: 'utf8', shell: false, timeout: 10000 });
  const value = String(result.stdout || '').trim();
  return result.status === 0 && /^[a-f0-9]{40,64}$/.test(value) ? value : null;
}

function validBaseCommit(value) {
  return typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value);
}

function listGitChangedPaths(cwd, baseCommit) {
  const root = path.resolve(cwd);
  if (!validBaseCommit(baseCommit)) return { measurable: false, paths: [], reason: 'GIT_BASE_UNAVAILABLE' };
  const tracked = spawnSync('git', ['diff', '--name-only', '-z', baseCommit, '--', '.'], { cwd: root, encoding: 'buffer', shell: false, timeout: 10000 });
  if (tracked.status !== 0) return { measurable: false, paths: [], reason: 'GIT_CHANGED_PATHS_UNAVAILABLE' };
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', '.'], { cwd: root, encoding: 'buffer', shell: false, timeout: 10000 });
  if (untracked.status !== 0) return { measurable: false, paths: [], reason: 'UNTRACKED_LIST_UNAVAILABLE' };
  const paths = new Set();
  for (const raw of [tracked.stdout, untracked.stdout]) {
    for (const item of raw.toString('utf8').split('\0').filter(Boolean)) {
      const relative = normalizeWorkspacePath(item);
      if (RUNTIME_SOURCE_PATTERNS.some((pattern) => pattern.test(relative))) continue;
      paths.add(relative);
    }
  }
  return { measurable: true, paths: [...paths].sort() };
}

function evaluateScopeChanges(contract, changedPaths) {
  const allowed = contract.scope.allowed_paths || [];
  const forbidden = contract.scope.forbidden_paths || [];
  const normalized = [...new Set((changedPaths || []).map(normalizeWorkspacePath))].sort();
  const forbiddenMatches = normalized.filter((item) => forbidden.some((pattern) => pathMatchesPattern(item, pattern)));
  const outsideAllowed = normalized.filter((item) => !allowed.some((pattern) => pathMatchesPattern(item, pattern)));
  if (forbiddenMatches.length || outsideAllowed.length) {
    return {
      ok: false,
      reason: 'SCOPE_VIOLATION',
      changed_paths: normalized.slice(0, 100),
      forbidden_paths: forbiddenMatches.slice(0, 100),
      outside_allowed_paths: outsideAllowed.slice(0, 100)
    };
  }
  return { ok: true, changed_paths: normalized };
}

function measureGitDiffLines(cwd, baseCommit = null) {
  const root = path.resolve(cwd);
  const baseline = baseCommit || resolveGitHead(root);
  if (!validBaseCommit(baseline)) return { measurable: false, lines: null, reason: 'GIT_BASE_UNAVAILABLE' };
  let lines = 0;
  function addNumstat(output) {
    for (const line of String(output || '').split(/\r?\n/)) {
      if (!line) continue;
      const [added, deleted] = line.split(/\s+/);
      if (added === '-' || deleted === '-') return false;
      if (!/^\d+$/.test(added) || !/^\d+$/.test(deleted)) return false;
      lines += Number(added) + Number(deleted);
    }
    return true;
  }
  const combined = spawnSync('git', ['diff', baseline, '--numstat', '--', '.'], { cwd: root, encoding: 'utf8', shell: false, timeout: 10000 });
  if (combined.status !== 0) return { measurable: false, lines: null, reason: 'GIT_DIFF_UNAVAILABLE' };
  if (!addNumstat(combined.stdout)) return { measurable: false, lines: null, reason: 'BINARY_TRACKED_DIFF' };
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', '.'], { cwd: root, encoding: 'buffer', shell: false, timeout: 10000 });
  if (untracked.status !== 0) return { measurable: false, lines: null, reason: 'UNTRACKED_LIST_UNAVAILABLE' };
  for (const rawName of untracked.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const relative = rawName.split(path.sep).join('/');
    if (shouldSkipSourcePath(relative, [])) continue;
    let file;
    try { file = ensureWithin(root, rawName, 'untracked path'); } catch { return { measurable: false, lines: null, reason: 'UNTRACKED_PATH_INVALID' }; }
    let stat;
    try { stat = fs.lstatSync(file); } catch { return { measurable: false, lines: null, reason: 'UNTRACKED_FILE_MISSING' }; }
    if (!stat.isFile() || stat.isSymbolicLink()) return { measurable: false, lines: null, reason: 'UNTRACKED_TYPE_UNMEASURABLE' };
    const content = fs.readFileSync(file);
    if (content.includes(0)) return { measurable: false, lines: null, reason: 'UNTRACKED_BINARY' };
    if (content.length) lines += content.toString('utf8').split('\n').length;
  }
  return { measurable: true, lines, base_commit: baseline, coverage: ['commits-since-base', 'tracked-staged', 'tracked-unstaged', 'untracked-text'] };
}

function checkpointAttestationBody(state) {
  const copy = { ...state };
  delete copy.checkpoint_attestation;
  return { domain: 'open-workflow-kit/checkpoint/v1', state: copy };
}

function signCheckpointState(state, key, keyId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(keyId || ''))) throw new Error('checkpoint key_id 必须为安全标识符');
  const output = { ...state };
  delete output.checkpoint_attestation;
  output.checkpoint_attestation = {
    algorithm: 'hmac-sha256',
    key_id: keyId,
    signature: hmacSha256(canonicalStringify(checkpointAttestationBody(output)), key)
  };
  return output;
}

function verifyCheckpointState(state, key, keyId) {
  assertOnlyKeys(state, CHECKPOINT_STATE_FIELDS, 'checkpoint');
  const attestation = state && state.checkpoint_attestation;
  if (!isPlainObject(attestation) || attestation.algorithm !== 'hmac-sha256' || attestation.key_id !== keyId || !/^hmac-sha256:[a-f0-9]{64}$/.test(String(attestation.signature || ''))) {
    throw new Error('checkpoint attestation 缺失或 key_id 不匹配');
  }
  assertOnlyKeys(attestation, ['algorithm', 'key_id', 'signature'], 'checkpoint attestation');
  const expected = hmacSha256(canonicalStringify(checkpointAttestationBody(state)), key);
  const actualBuffer = Buffer.from(attestation.signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) throw new Error('checkpoint attestation 无效；状态可能被篡改或回滚');
  return state;
}

function writeCheckpoint(file, state, options = {}) {
  const output = options.attestationKey === undefined ? state : signCheckpointState(state, options.attestationKey, options.attestationKeyId);
  atomicWrite(file, stringifyYaml(output) + '\n');
  return output;
}

function loadCheckpoint(file, options = {}) {
  if (!fs.existsSync(file)) return null;
  const state = loadData(file);
  assertOnlyKeys(state, CHECKPOINT_STATE_FIELDS, 'checkpoint');
  if (state.status !== 'NOT_STARTED' || state.checkpoint_attestation !== undefined) {
    if (options.attestationKey === undefined) throw new Error('读取 active checkpoint 必须提供 attestation key');
    verifyCheckpointState(state, options.attestationKey, options.attestationKeyId);
  }
  return state;
}

function buildDecisionPacket(reason, evaluation, context = {}) {
  return {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    outcome: reason === 'BUDGET_EXHAUSTED' ? 'BUDGET_EXHAUSTED' : 'BLOCKED_WITH_DECISION_PACKET',
    reason,
    contract_hash: evaluation.contract_hash,
    source_fingerprint: evaluation.source_fingerprint,
    environment_fingerprint: evaluation.environment_fingerprint,
    findings_fingerprint: evaluation.findings_fingerprint,
    findings_manifest: evaluation.findings_manifest,
    blockers: evaluation.blockers,
    pending_human_gates: evaluation.pending_human_gates,
    blocking_unknowns: evaluation.blocking_unknowns,
    open_findings: evaluation.open_findings,
    iteration: context.iteration || 0,
    command_executions: context.commandExecutions || 0,
    cost_units: context.costUnits || 0,
    elapsed_ms: context.elapsedMs || 0,
    base_commit: context.baseCommit || null,
    scope_violation: context.scopeViolation || null,
    required_decisions: context.requiredDecisions || ['解决 blocker 后使用同一 contract 重新执行；不得由 runner 静默降低验收标准。']
  };
}

async function runUntilDone(options) {
  const contract = options.contract;
  const clockNow = typeof options.now === 'function' ? options.now : Date.now;
  const validated = validateCompletionContract(contract);
  if (!contract.feature || contract.feature.status !== 'frozen' || !contract.governance || contract.governance.status !== 'frozen') throw new Error('只有 feature.status 与 governance.status 均为 frozen 的 Completion Contract 才能进入自主交付');
  const attestationKeyId = options.attestationKeyId;
  const attestationKey = options.attestationKey;
  normalizeAttestationKey(attestationKey);
  if (!(contract.governance.evidence_attestation.automation_key_ids || []).includes(attestationKeyId)) {
    throw new Error(`automation attestation key_id 未被 Completion Contract 允许: ${attestationKeyId || '<missing>'}`);
  }
  const automationPrincipal = contract.governance.evidence_attestation.key_principals && contract.governance.evidence_attestation.key_principals[attestationKeyId];
  if (!isPlainObject(automationPrincipal) || automationPrincipal.role !== 'automation' || !nonEmptyString(automationPrincipal.principal)) throw new Error(`automation attestation key_id 缺少有效 principal 映射: ${attestationKeyId}`);
  const attestationKeys = Object.create(null);
  for (const [keyId, keyValue] of Object.entries(options.attestationKeys || {})) attestationKeys[keyId] = keyValue;
  attestationKeys[attestationKeyId] = attestationKey;
  const oracleEnvironment = buildOracleEnvironment(options.env || process.env, contract.autonomy.oracle_env_allowlist, [attestationKey, ...Object.values(attestationKeys)]);
  const cwd = path.resolve(options.cwd || process.cwd());
  const findingsManifest = validateFindingsManifest(options.findingsManifest, contract.governance.findings_registry, { nowMs: options.nowMs });
  const findingsFingerprint = hashCanonical(findingsManifest);
  const ledgerPath = path.resolve(options.ledgerPath);
  const checkpointPath = path.resolve(options.checkpointPath);
  const decisionPacketPath = path.resolve(options.decisionPacketPath);
  const loadedCheckpoint = loadCheckpoint(checkpointPath, { attestationKey, attestationKeyId });
  if (options.resume === false && loadedCheckpoint && loadedCheckpoint.status !== 'NOT_STARTED') throw new Error('禁止用 --no-resume 绕过 active checkpoint；必须由 Owner 归档完整 ledger/checkpoint 后以新 Contract 运行');
  if (options.resume === false && readLedger(ledgerPath).length) throw new Error('禁止在已有 Evidence Ledger 上使用 --no-resume 重置预算');
  let checkpoint = options.resume === false ? null : loadedCheckpoint;
  if (checkpoint && checkpoint.status === 'NOT_STARTED' && Number(checkpoint.iteration || 0) === 0 && Number(checkpoint.command_executions || 0) === 0) checkpoint = null;
  if (checkpoint && checkpoint.contract_hash !== validated.contract_hash) throw new Error('checkpoint 对应旧 contract；请归档旧 run-state 后重新开始');
  validateEnvironmentManifest(options.environment);
  const computedEnvironmentFingerprint = fingerprintContractEnvironment(contract, options.environment);
  if (options.environmentFingerprint && options.environmentFingerprint !== computedEnvironmentFingerprint) throw new Error('environmentFingerprint 与当前 Contract/fixture/runtime descriptor 不匹配');
  const environmentFingerprint = computedEnvironmentFingerprint;
  if (checkpoint && checkpoint.environment_fingerprint !== environmentFingerprint) throw new Error('checkpoint environment fingerprint 不匹配');
  if (checkpoint && checkpoint.findings_fingerprint !== findingsFingerprint) throw new Error('checkpoint findings fingerprint 不匹配；review snapshot 已变化');
  if (checkpoint) {
    const currentLedger = readLedger(ledgerPath);
    const currentHead = currentLedger.length ? currentLedger[currentLedger.length - 1].entry_hash : 'GENESIS';
    if (Number(checkpoint.ledger_entry_count) !== currentLedger.length || checkpoint.ledger_head_hash !== currentHead) {
      throw new Error('checkpoint 与 Evidence Ledger head/count 不匹配；检测到截断、替换或未锚定追加');
    }
  }
  const now = clockNow();
  const checkpointStartedAt = checkpoint ? Date.parse(checkpoint.started_at) : NaN;
  if (checkpoint && (!Number.isFinite(checkpointStartedAt) || checkpointStartedAt > now + 5 * 60000)) throw new Error('checkpoint.started_at 无效或来自未来');
  const startedAt = checkpoint ? checkpointStartedAt : now;
  const positiveBudget = (value, fallback, name, integer = false) => {
    const selected = value === undefined ? Number(fallback) : Number(value);
    if (!Number.isFinite(selected) || selected <= 0 || (integer && !Number.isInteger(selected))) throw new Error(`${name} 必须是${integer ? '正整数' : '正数'}`);
    return selected;
  };
  const boundedBudget = (value, contractLimit, name, integer = false) => {
    const limit = positiveBudget(undefined, contractLimit, `${name} contract limit`, integer);
    const selected = positiveBudget(value, limit, name, integer);
    if (selected > limit) throw new Error(`${name} 只能收紧，不能超过冻结 Contract 上限 ${limit}`);
    return selected;
  };
  const budgets = {
    maxIterations: boundedBudget(options.maxIterations, contract.autonomy.max_iterations, 'maxIterations', true),
    maxElapsedMs: boundedBudget(options.maxElapsedMs, contract.autonomy.max_elapsed_minutes * 60000, 'maxElapsedMs'),
    maxCommandExecutions: boundedBudget(options.maxCommandExecutions, contract.autonomy.max_command_executions, 'maxCommandExecutions', true),
    maxCostUnits: boundedBudget(options.maxCostUnits, contract.autonomy.max_cost_units, 'maxCostUnits'),
    maxDiffLines: contract.autonomy.max_diff_lines === undefined ? null : Number(contract.autonomy.max_diff_lines),
    maxSameFailure: positiveBudget(undefined, contract.autonomy.max_same_failure, 'maxSameFailure', true),
    maxNoProgress: positiveBudget(undefined, contract.autonomy.max_no_progress, 'maxNoProgress', true)
  };
  if (budgets.maxDiffLines !== null && (!Number.isInteger(budgets.maxDiffLines) || budgets.maxDiffLines < 0)) throw new Error('maxDiffLines 必须是非负整数');
  const contractCostPerExecution = positiveBudget(undefined, contract.autonomy.cost_per_execution, 'costPerExecution contract floor');
  const costPerExecution = positiveBudget(options.costPerExecution, contractCostPerExecution, 'costPerExecution');
  if (costPerExecution < contractCostPerExecution) throw new Error(`costPerExecution 只能收紧，不能低于冻结 Contract 下限 ${contractCostPerExecution}`);
  let iteration = checkpoint ? Number(checkpoint.iteration || 0) : 0;
  let commandExecutions = checkpoint ? Number(checkpoint.command_executions || 0) : 0;
  let costUnits = checkpoint ? Number(checkpoint.cost_units || 0) : 0;
  if (![iteration, commandExecutions, costUnits].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('checkpoint 计数器无效');
  let previousFailureFingerprint = checkpoint ? checkpoint.failure_fingerprint || null : null;
  let sameFailureCount = checkpoint ? Number(checkpoint.same_failure_count || 0) : 0;
  let noProgressCount = checkpoint ? Number(checkpoint.no_progress_count || 0) : 0;
  let previousBlockerCount = checkpoint ? Number(checkpoint.blocker_count || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  const computeSourceFingerprint = options.fingerprintSource || (() => fingerprintPaths(contract.scope.source_paths, { cwd, excludes: contract.scope.fingerprint_excludes || [] }).fingerprint);
  const initialSourceFingerprint = computeSourceFingerprint();
  if (checkpoint && checkpoint.source_fingerprint !== initialSourceFingerprint) throw new Error('checkpoint source fingerprint 不匹配；检测到恢复点之外的源代码变化');
  const baselineSourceFingerprint = checkpoint ? checkpoint.baseline_source_fingerprint : initialSourceFingerprint;
  if (!/^sha256:[a-f0-9]{64}$/.test(String(baselineSourceFingerprint || ''))) throw new Error('checkpoint baseline_source_fingerprint 无效');
  const baseCommit = checkpoint ? (checkpoint.base_commit || null) : resolveGitHead(cwd);
  if (checkpoint && checkpoint.base_commit && !validBaseCommit(checkpoint.base_commit)) throw new Error('checkpoint base_commit 无效');
  const requiredCommandSpecs = [
    ...(contract.acceptance || []).filter((criterion) => criterion && !criterion.human_gate && criterion.oracle && criterion.oracle.type === 'command').map((criterion) => criterion.oracle),
    ...(contract.autonomy.iteration_command ? [contract.autonomy.iteration_command] : [])
  ];
  const requiredCommandSpecHashes = requiredCommandSpecs.map(commandSpecHash);
  const executableFingerprints = Object.fromEntries(requiredCommandSpecs.map((spec) => [commandSpecHash(spec), resolveExecutableIdentity(spec.command, { cwd: ensureWithin(cwd, spec.cwd || '.', 'oracle cwd'), env: oracleEnvironment }).fingerprint]));
  if (!options.executionPermit || !options.executionPublicKey) throw new Error('自主执行必须提供 Owner 签名的 execution permit 与受信 Ed25519 public key');
  const permitVerification = verifyExecutionPermit(options.executionPermit, options.executionPublicKey, {
    keyId: contract.governance.execution_authorization.key_id,
    publicKeyFingerprint: contract.governance.execution_authorization.trusted_public_key_sha256,
    maxValidityMinutes: contract.governance.execution_authorization.max_validity_minutes,
    contract_hash: validated.contract_hash,
    environment_fingerprint: environmentFingerprint,
    findings_fingerprint: findingsFingerprint,
    scope_hash: hashCanonical(contract.scope),
    base_commit: baseCommit,
    command_spec_hashes: requiredCommandSpecHashes,
    executable_fingerprints: executableFingerprints,
    budgets: {
      max_iterations: budgets.maxIterations,
      max_elapsed_ms: budgets.maxElapsedMs,
      max_command_executions: budgets.maxCommandExecutions,
      max_cost_units: budgets.maxCostUnits,
      cost_per_execution: costPerExecution,
      max_diff_lines: budgets.maxDiffLines
    },
    nowMs: clockNow()
  });
  const permitExpiresAt = Date.parse(options.executionPermit.expires_at);
  const permittedSpecHashes = permitVerification.command_spec_hashes;
  const permittedExecutableFingerprints = permitVerification.executable_fingerprints;
  const evaluationNow = () => Number.isFinite(options.nowMs) ? options.nowMs : clockNow();
  const evaluateCurrent = (sourceFingerprint) => evaluateDoD(contract, readLedger(ledgerPath), { sourceFingerprint, environmentFingerprint, findingsManifest, artifactRoot: cwd, attestationKeys, nowMs: evaluationNow() });
  const remainingPermitMs = () => permitExpiresAt - clockNow();
  const remainingRuntimeMs = () => Math.min(
    budgets.maxElapsedMs - (clockNow() - startedAt),
    remainingPermitMs()
  );

  function inspectScope(sourceFingerprint) {
    if (baseCommit || options.listChangedPaths) {
      const changed = (options.listChangedPaths || listGitChangedPaths)(cwd, baseCommit);
      if (!changed.measurable) return { ok: false, reason: 'SCOPE_CHANGESET_UNMEASURABLE', detail: changed };
      const evaluated = evaluateScopeChanges(contract, changed.paths);
      return evaluated.ok ? { ok: true, detail: evaluated } : { ok: false, reason: evaluated.reason, detail: evaluated };
    }
    if (sourceFingerprint === baselineSourceFingerprint) return { ok: true, detail: { changed_paths: [] } };
    if (!(contract.scope.allowed_paths || []).length) {
      return { ok: false, reason: 'SCOPE_VIOLATION', detail: { changed_paths: ['<unattributed-source-change>'], outside_allowed_paths: ['<unattributed-source-change>'] } };
    }
    return { ok: false, reason: 'SCOPE_CHANGESET_UNMEASURABLE', detail: { changed_paths: ['<unattributed-source-change>'] } };
  }

  function blockedEvaluation(evaluation, reason) {
    if (!evaluation || evaluation.blockers.some((item) => item.id === 'RUNNER')) return evaluation;
    return {
      ...evaluation,
      automation_complete: false,
      accepted: false,
      state: 'INCOMPLETE',
      counts: { ...evaluation.counts, BLOCKED: Number(evaluation.counts.BLOCKED || 0) + 1 },
      blockers: [...evaluation.blockers, { id: 'RUNNER', status: 'BLOCKED', reason }]
    };
  }

  function persist(status, sourceFingerprint, evaluation, failureFingerprint = null) {
    const currentLedger = readLedger(ledgerPath);
    const state = {
      schema_version: '1.0',
      contract_hash: validated.contract_hash,
      source_fingerprint: sourceFingerprint,
      environment_fingerprint: environmentFingerprint,
      findings_fingerprint: findingsFingerprint,
      iteration,
      command_executions: commandExecutions,
      cost_units: costUnits,
      ledger_entry_count: currentLedger.length,
      ledger_head_hash: currentLedger.length ? currentLedger[currentLedger.length - 1].entry_hash : 'GENESIS',
      execution_permit_id: options.executionPermit.permit_id,
      execution_permit_hash: permitVerification.permit_hash,
      status,
      automation_complete: Boolean(evaluation && evaluation.automation_complete),
      accepted: false,
      blocker_count: evaluation ? evaluation.blockers.length : previousBlockerCount,
      failure_fingerprint: failureFingerprint,
      same_failure_count: sameFailureCount,
      no_progress_count: noProgressCount,
      base_commit: baseCommit,
      baseline_source_fingerprint: baselineSourceFingerprint,
      elapsed_ms: clockNow() - startedAt,
      started_at: new Date(startedAt).toISOString(),
      updated_at: new Date(clockNow()).toISOString()
    };
    checkpoint = writeCheckpoint(checkpointPath, state, { attestationKey, attestationKeyId });
  }

  let sourceFingerprint = initialSourceFingerprint;
  let scopeStatus = inspectScope(sourceFingerprint);
  if (!scopeStatus.ok) return finishBlocked(scopeStatus.reason, null, null, scopeStatus.detail);
  if (remainingPermitMs() <= 0) return finishBlocked('EXECUTION_PERMIT_EXPIRED');
  let initialEvaluation = evaluateCurrent(sourceFingerprint);
  if (initialEvaluation.automation_complete) {
    const deliveryEvaluation = { ...initialEvaluation, accepted: false, state: 'READY_FOR_HUMAN_ACCEPTANCE' };
    persist('READY_FOR_HUMAN_ACCEPTANCE', sourceFingerprint, deliveryEvaluation);
    return { outcome: 'READY_FOR_HUMAN_ACCEPTANCE', evaluation: deliveryEvaluation, checkpoint };
  }

  while (iteration < budgets.maxIterations) {
    if (remainingPermitMs() <= 0) return finishBlocked('EXECUTION_PERMIT_EXPIRED', initialEvaluation, sourceFingerprint);
    const elapsed = clockNow() - startedAt;
    if (elapsed >= budgets.maxElapsedMs) return finishBudget('MAX_ELAPSED_TIME', initialEvaluation, sourceFingerprint);
    if (commandExecutions >= budgets.maxCommandExecutions) return finishBudget('MAX_COMMAND_EXECUTIONS', initialEvaluation, sourceFingerprint);
    if (costUnits + costPerExecution > budgets.maxCostUnits) return finishBudget('MAX_COST_UNITS', initialEvaluation, sourceFingerprint);
    iteration++;
    if (budgets.maxDiffLines !== null) {
      const diff = (options.measureDiff || measureGitDiffLines)(cwd, baseCommit);
      if (!diff.measurable) return finishBlocked('DIFF_BUDGET_NOT_MEASURABLE');
      if (diff.lines > budgets.maxDiffLines) return finishBudget('MAX_DIFF_LINES');
    }

    let entries = readLedger(ledgerPath);
    let evaluation = evaluateDoD(contract, entries, { sourceFingerprint, environmentFingerprint, findingsManifest, artifactRoot: cwd, attestationKeys, nowMs: evaluationNow() });
    if (evaluation.automation_complete) {
      const deliveryEvaluation = { ...evaluation, accepted: false, state: 'READY_FOR_HUMAN_ACCEPTANCE' };
      persist('READY_FOR_HUMAN_ACCEPTANCE', sourceFingerprint, deliveryEvaluation);
      return { outcome: 'READY_FOR_HUMAN_ACCEPTANCE', evaluation: deliveryEvaluation, checkpoint };
    }

    const runnable = contract.acceptance.filter((criterion) => !criterion.human_gate);
    if (!runnable.length) return finishBlocked('NO_AUTOMATED_ORACLE', evaluation, sourceFingerprint);
    for (const criterion of runnable) {
      if (remainingPermitMs() <= 0) return finishBlocked('EXECUTION_PERMIT_EXPIRED', evaluation, sourceFingerprint);
      if (criterion.oracle.type === 'command' && commandExecutions >= budgets.maxCommandExecutions) return finishBudget('MAX_COMMAND_EXECUTIONS', evaluation, sourceFingerprint);
      if (costUnits + costPerExecution > budgets.maxCostUnits) return finishBudget('MAX_COST_UNITS', evaluation, sourceFingerprint);
      const testedSourceFingerprint = sourceFingerprint;
      costUnits += costPerExecution;
      if (criterion.oracle.type === 'command') commandExecutions++;
      persist('RUNNING', sourceFingerprint, evaluation, previousFailureFingerprint);
      const action = authorizeAutonomyAction(contract.autonomy, `oracle:${criterion.oracle.type}`);
      const remainingElapsedMs = Math.max(1, remainingRuntimeMs());
      const result = action.allowed
        ? runOracle(criterion.oracle, { cwd, allowSpecHashes: permittedSpecHashes, executableFingerprints: permittedExecutableFingerprints, spawnImpl: options.spawnImpl, env: oracleEnvironment, timeoutCapMs: remainingElapsedMs })
        : { status: 'BLOCKED', reason: action.reason, assertions: [{ type: 'autonomy_action', action: `oracle:${criterion.oracle.type}`, passed: false }] };
      sourceFingerprint = computeSourceFingerprint();
      const sourceChangedDuringOracle = sourceFingerprint !== testedSourceFingerprint;
      scopeStatus = inspectScope(sourceFingerprint);
      appendEvidence(ledgerPath, {
        criterion_id: criterion.id,
        status: !scopeStatus.ok ? 'BLOCKED' : sourceChangedDuringOracle ? 'STALE' : result.status,
        reason: !scopeStatus.ok ? scopeStatus.reason : sourceChangedDuringOracle ? 'SOURCE_CHANGED_DURING_ORACLE' : result.reason,
        contract_hash: validated.contract_hash,
        source_fingerprint: testedSourceFingerprint,
        environment_fingerprint: environmentFingerprint,
        executor: { type: criterion.oracle.type, oracle_hash: hashCanonical(criterion.oracle), principal: automationPrincipal.principal },
        evidence_manifest: [...criterion.evidence_required],
        ...(result.artifacts ? { artifacts: result.artifacts } : {}),
        result: { ...result, source_changed_during_oracle: sourceChangedDuringOracle, scope: scopeStatus.detail }
      }, { attestationKey, attestationKeyId });
      if (!scopeStatus.ok) return finishBlocked(scopeStatus.reason, null, null, scopeStatus.detail);
      if (remainingPermitMs() <= 0) return finishBlocked('EXECUTION_PERMIT_EXPIRED', null, sourceFingerprint);
      persist('RUNNING', sourceFingerprint, evaluateCurrent(sourceFingerprint), previousFailureFingerprint);
    }
    entries = readLedger(ledgerPath);
    sourceFingerprint = computeSourceFingerprint();
    evaluation = evaluateDoD(contract, entries, { sourceFingerprint, environmentFingerprint, findingsManifest, artifactRoot: cwd, attestationKeys, nowMs: evaluationNow() });
    if (evaluation.automation_complete) {
      const deliveryEvaluation = { ...evaluation, accepted: false, state: 'READY_FOR_HUMAN_ACCEPTANCE' };
      persist('READY_FOR_HUMAN_ACCEPTANCE', sourceFingerprint, deliveryEvaluation);
      return { outcome: 'READY_FOR_HUMAN_ACCEPTANCE', evaluation: deliveryEvaluation, checkpoint };
    }

    const failureFingerprint = hashCanonical(evaluation.blockers.map((item) => ({ id: item.id, status: item.status, reason: item.reason })));
    sameFailureCount = failureFingerprint === previousFailureFingerprint ? sameFailureCount + 1 : 1;
    noProgressCount = evaluation.blockers.length >= previousBlockerCount ? noProgressCount + 1 : 0;
    previousFailureFingerprint = failureFingerprint;
    previousBlockerCount = evaluation.blockers.length;
    persist('RUNNING', sourceFingerprint, evaluation, failureFingerprint);
    if (commandExecutions >= budgets.maxCommandExecutions) return finishBudget('MAX_COMMAND_EXECUTIONS', evaluation, sourceFingerprint);
    if (costUnits + costPerExecution > budgets.maxCostUnits) return finishBudget('MAX_COST_UNITS', evaluation, sourceFingerprint);
    if (clockNow() - startedAt >= budgets.maxElapsedMs) return finishBudget('MAX_ELAPSED_TIME', evaluation, sourceFingerprint);
    if (remainingPermitMs() <= 0) return finishBlocked('EXECUTION_PERMIT_EXPIRED', evaluation, sourceFingerprint);
    if (sameFailureCount >= budgets.maxSameFailure) return finishBlocked('REPEATED_FAILURE', evaluation, sourceFingerprint);
    if (noProgressCount >= budgets.maxNoProgress) return finishBlocked('NO_PROGRESS', evaluation, sourceFingerprint);
    if (!contract.autonomy.iteration_command) return finishBlocked('REMEDIATION_COMMAND_REQUIRED', evaluation, sourceFingerprint);
    const remediationSpec = contract.autonomy.iteration_command;
    const remediationAction = authorizeAutonomyAction(contract.autonomy, 'remediation:command');
    if (!remediationAction.allowed) return finishBlocked(remediationAction.reason, evaluation, sourceFingerprint);
    if (remainingPermitMs() <= 0) return finishBlocked('EXECUTION_PERMIT_EXPIRED', evaluation, sourceFingerprint);
    commandExecutions++;
    costUnits += costPerExecution;
    persist('RUNNING', sourceFingerprint, evaluation, previousFailureFingerprint);
    const remediation = runCommandOracle(remediationSpec, { cwd, allowSpecHashes: permittedSpecHashes, executableFingerprints: permittedExecutableFingerprints, spawnImpl: options.spawnImpl, env: oracleEnvironment, timeoutCapMs: Math.max(1, remainingRuntimeMs()) });
    sourceFingerprint = computeSourceFingerprint();
    scopeStatus = inspectScope(sourceFingerprint);
    if (!scopeStatus.ok) return finishBlocked(scopeStatus.reason, evaluation, null, scopeStatus.detail);
    if (remainingPermitMs() <= 0) return finishBlocked('EXECUTION_PERMIT_EXPIRED', evaluation, sourceFingerprint);
    if (remediation.status !== 'PASS') return finishBlocked(`REMEDIATION_${remediation.reason || remediation.status}`, evaluation, sourceFingerprint);
    persist('RUNNING', sourceFingerprint, evaluateCurrent(sourceFingerprint), previousFailureFingerprint);
    initialEvaluation = evaluation;
  }
  return finishBudget('MAX_ITERATIONS');

  function finishBlocked(reason, existingEvaluation, existingSource, scopeViolation = null) {
    const sourceFingerprint = computeSourceFingerprint();
    const currentEvaluation = existingSource === sourceFingerprint && existingEvaluation ? existingEvaluation : evaluateCurrent(sourceFingerprint);
    const evaluation = blockedEvaluation(currentEvaluation, reason);
    const packet = buildDecisionPacket(reason, evaluation, { iteration, commandExecutions, costUnits, elapsedMs: clockNow() - startedAt, baseCommit, scopeViolation });
    atomicWrite(decisionPacketPath, JSON.stringify(packet, null, 2) + '\n');
    persist('BLOCKED_WITH_DECISION_PACKET', sourceFingerprint, evaluation, previousFailureFingerprint);
    return { outcome: 'BLOCKED_WITH_DECISION_PACKET', reason, evaluation, decision_packet: packet, checkpoint };
  }

  function finishBudget(reason, existingEvaluation, existingSource) {
    const sourceFingerprint = computeSourceFingerprint();
    const evaluation = existingSource === sourceFingerprint && existingEvaluation ? existingEvaluation : evaluateCurrent(sourceFingerprint);
    const packet = buildDecisionPacket('BUDGET_EXHAUSTED', evaluation, { iteration, commandExecutions, costUnits, elapsedMs: clockNow() - startedAt, baseCommit, requiredDecisions: [`预算停止原因: ${reason}`, '调整预算前先确认失败没有源自错误的完成定义。'] });
    packet.budget_reason = reason;
    atomicWrite(decisionPacketPath, JSON.stringify(packet, null, 2) + '\n');
    persist('BUDGET_EXHAUSTED', sourceFingerprint, evaluation, previousFailureFingerprint);
    return { outcome: 'BUDGET_EXHAUSTED', reason, evaluation, decision_packet: packet, checkpoint };
  }
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateDoneCockpit(contract, evaluation) {
  const icons = { PASS: '✓', FAIL: '✕', BLOCKED: '!', NOT_RUN: '○', STALE: '↻', WAIVED: '◇' };
  const safeStatus = (value) => EVIDENCE_STATUSES.includes(value) ? value : 'BLOCKED';
  const counts = evaluation.counts || Object.fromEntries(EVIDENCE_STATUSES.map((status) => [status, evaluation.criteria.filter((item) => item.status === status).length]));
  const summaryCards = EVIDENCE_STATUSES.map((status) => `<div class="metric status-card status-${status.toLowerCase()}"><span aria-hidden="true">${icons[status]}</span> ${status}<b>${escapeHtml(counts[status] || 0)}</b></div>`).join('');
  const rows = evaluation.criteria.map((item) => {
    const status = safeStatus(item.status);
    const waiver = item.waiver
      ? `${escapeHtml(item.waiver.approved_by)}<br><small>scope: ${escapeHtml(item.waiver.scope)}<br>expiry: ${escapeHtml(item.waiver.expires_at)}</small>`
      : '—';
    return `<tr><td><strong>${escapeHtml(item.id)}</strong><br><small>${escapeHtml(item.title || '')}</small></td><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(item.oracle_type)}</td><td><span class="status status-${status.toLowerCase()}"><span aria-hidden="true">${icons[status]}</span> ${escapeHtml(status)}</span></td><td>${escapeHtml(item.evidence_observed_at || '—')}</td><td>${escapeHtml(item.reason || '—')}</td><td>${waiver}</td></tr>`;
  }).join('\n');
  const blockers = evaluation.blockers.length ? `<ul>${evaluation.blockers.map((item) => `<li><strong>${escapeHtml(item.id)}</strong> · ${escapeHtml(item.status)} · ${escapeHtml(item.reason || '未提供原因')}</li>`).join('')}</ul>` : '<p>✓ 无自动化 blocker。</p>';
  const humanGates = evaluation.pending_human_gates && evaluation.pending_human_gates.length ? `<ul>${evaluation.pending_human_gates.map((item) => `<li><strong>${escapeHtml(item.id)}</strong> · ${escapeHtml(item.status)} · ${escapeHtml(item.reason || '等待有权角色签收')}</li>`).join('')}</ul>` : '<p>✓ 无待处理人工 gate。</p>';
  const acceptanceBlockers = evaluation.acceptance_blockers && evaluation.acceptance_blockers.length ? `<ul>${evaluation.acceptance_blockers.map((item) => `<li><strong>${escapeHtml(item.id)}</strong> · ${escapeHtml(item.reason)}</li>`).join('')}</ul>` : '<p>✓ 无验收层 blocker。</p>';
  const unknowns = (evaluation.blocking_unknowns || []).length ? `<p><strong>Blocking unknowns：</strong>${evaluation.blocking_unknowns.map(escapeHtml).join('、')}</p>` : '';
  const findings = (evaluation.open_findings || []).length ? `<p><strong>Open findings：</strong>${evaluation.open_findings.map(escapeHtml).join('、')}</p>` : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${escapeHtml(contract.feature.id)} · Done Cockpit</title>
<style>*{box-sizing:border-box}body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#f5f7fb;color:#182033;line-height:1.5}main{max-width:1180px;margin:32px auto;padding:0 20px}.hero,.panel{background:#fff;border:1px solid #dfe4ee;border-radius:14px;padding:22px;margin-bottom:18px}.hero h1{margin:0 0 8px}.state{display:inline-flex;align-items:center;border:2px solid #243b63;border-radius:999px;padding:6px 12px;font-weight:800}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin-bottom:18px}.metric{background:#fff;border:1px solid #dfe4ee;border-radius:10px;padding:14px}.metric b{display:block;font-size:24px;margin-top:6px}.snapshot{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.snapshot div{background:#f8fafc;padding:10px;border-radius:8px}.table-scroll{max-width:100%;overflow:auto;-webkit-overflow-scrolling:touch}table{border-collapse:collapse;width:100%;min-width:920px}th,td{text-align:left;border-bottom:1px solid #e6eaf1;padding:10px 8px;vertical-align:top}.status{font-weight:800;white-space:nowrap}.status-pass{color:#087a43}.status-fail{color:#b42318}.status-blocked{color:#6941c6}.status-not_run{color:#667085}.status-stale{color:#b54708}.status-waived{color:#175cd3}code{overflow-wrap:anywhere}small{color:#526079}.decisions{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:700px){main{margin:16px auto;padding:0 12px}.hero,.panel{padding:16px}.decisions{grid-template-columns:1fr}}@media(max-width:360px){main{padding:0 8px}.hero,.panel{padding:12px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:10px}.table-scroll{width:100%;overflow-x:auto}}</style></head>
<body><main><section class="hero"><div class="state">${escapeHtml(evaluation.state)}</div><h1>${escapeHtml(contract.feature.id)}</h1><p>${escapeHtml(contract.feature.objective)}</p><div class="snapshot"><div><strong>Contract</strong><br><code>${escapeHtml(evaluation.contract_hash)}</code></div><div><strong>Source</strong><br><code>${escapeHtml(evaluation.source_fingerprint)}</code></div><div><strong>Environment</strong><br><code>${escapeHtml(evaluation.environment_fingerprint)}</code></div><div><strong>Findings snapshot</strong><br>${escapeHtml(evaluation.findings_manifest && evaluation.findings_manifest.valid ? 'VALID' : 'INVALID')}<br><code>${escapeHtml(evaluation.findings_fingerprint || '—')}</code><br>${escapeHtml(evaluation.findings_manifest && evaluation.findings_manifest.owner || '—')} · ${escapeHtml(evaluation.findings_manifest && evaluation.findings_manifest.source || '—')}<br>${escapeHtml(evaluation.findings_manifest && evaluation.findings_manifest.snapshot_at || '—')}</div><div><strong>Ledger head / count</strong><br><code>${escapeHtml(evaluation.ledger_head_hash)}</code><br>${escapeHtml(evaluation.ledger_entry_count)}</div><div><strong>External anchor</strong><br>${escapeHtml(evaluation.ledger_anchor && evaluation.ledger_anchor.valid ? 'VALID' : evaluation.ledger_anchor && evaluation.ledger_anchor.reason || 'NOT YET REQUIRED')}</div><div><strong>Evaluated at</strong><br>${escapeHtml(evaluation.evaluated_at)}</div></div></section>
<section class="grid">${summaryCards}</section>
<section class="panel"><h2>验收证据</h2><div class="table-scroll" role="region" aria-label="验收证据表格" tabindex="0"><table><thead><tr><th>ID / 标题</th><th>优先级</th><th>Oracle</th><th>状态</th><th>证据时间</th><th>阻塞原因</th><th>Waiver</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section class="panel"><h2>决策与人工 Gate</h2><div class="decisions"><div><h3>自动化阻塞</h3>${blockers}</div><div><h3>等待人工签收</h3>${humanGates}</div><div><h3>验收锚阻塞</h3>${acceptanceBlockers}</div></div>${unknowns}${findings}</section>
</main></body></html>\n`;
}

function parseCliArgs(argv, allowedNames = null, maxPositionals = Infinity) {
  const result = { _: [] };
  const allowed = allowedNames ? new Set(allowedNames) : null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) result._.push(arg);
    else {
      const name = arg.slice(2);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || DANGEROUS_OBJECT_KEYS.has(name)) throw new Error(`非法参数名: --${name}`);
      if (allowed && !allowed.has(name)) throw new Error(`未知参数: --${name}`);
      if (['json', 'help', 'init', 'force', 'no-resume', 'print-required-specs', 'print-public-key-fingerprint', 'print-oracle-integrity'].includes(name)) result[name] = true;
      else {
        if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) throw new Error(`参数 --${name} 缺少值`);
        const value = argv[++index];
        if (Object.hasOwn(result, name)) result[name] = Array.isArray(result[name]) ? [...result[name], value] : [result[name], value];
        else result[name] = value;
      }
    }
  }
  if (result._.length > maxPositionals) throw new Error(`位置参数过多：最多 ${maxPositionals} 个`);
  return result;
}

module.exports = {
  EVIDENCE_STATUSES,
  parseData,
  loadData,
  parseYamlSubset,
  stringifyYaml,
  canonicalize,
  assertSafeDataKeys,
  canonicalStringify,
  hashCanonical,
  sha256,
  hmacSha256,
  sanitizeEnvironmentSecrets,
  buildOracleEnvironment,
  atomicWrite,
  ensureWithin,
  fingerprintPaths,
  fingerprintOraclePaths,
  computeSourceFingerprint: fingerprintPaths,
  fingerprintEnvironment,
  contractEnvironmentDescriptor,
  fingerprintContractEnvironment,
  validateEnvironmentManifest,
  validateFindingsManifest,
  collectContractIssues,
  validateCompletionContract,
  validateEvidencePayload,
  readLedger,
  verifyLedgerEntries,
  appendEvidence,
  recoverEvidenceLedgerLock,
  signEvidenceEntry,
  verifyEvidenceAttestation,
  publicKeyFingerprint,
  signExecutionPermit,
  verifyExecutionPermit,
  signLedgerAnchor,
  verifyLedgerAnchor,
  evaluateDoD,
  resolveContractFingerprints,
  runCommandOracle,
  commandSpecHash,
  commandSafetyViolation,
  resolveExecutableIdentity,
  runFileOracle,
  runOracle,
  pathMatchesPattern,
  resolveGitHead,
  listGitChangedPaths,
  evaluateScopeChanges,
  measureGitDiffLines,
  signCheckpointState,
  verifyCheckpointState,
  writeCheckpoint,
  loadCheckpoint,
  runUntilDone,
  buildDecisionPacket,
  escapeHtml,
  generateDoneCockpit,
  parseCliArgs
};
