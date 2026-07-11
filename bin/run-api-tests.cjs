#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (require.main === module) {
  main().catch((error) => {
    console.error(`API 测试执行失败: ${error.message}`);
    process.exit(1);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.plan) throw new Error('必须提供 --plan <file>');
  if (!args.environment) throw new Error('必须提供 --environment <name>');
  if (!args.allowHosts.length) throw new Error('必须提供 --allow-host <host[,host]>');

  const plan = JSON.parse(fs.readFileSync(path.resolve(args.plan), 'utf8'));
  const env = args.envFile ? loadEnvFile(path.resolve(args.envFile)) : {};
  const result = await executePlan(plan, {
    env,
    environment: args.environment,
    allowHosts: args.allowHosts,
    dryRun: args.dryRun,
    timeoutMs: args.timeoutMs,
    maxResponseBytes: args.maxResponseBytes
  });
  const output = JSON.stringify(result, null, 2) + '\n';
  if (args.output) fs.writeFileSync(path.resolve(args.output), output);
  else process.stdout.write(output);
  if (result.summary.failed > 0) process.exitCode = 1;
}

async function executePlan(plan, options = {}) {
  validatePlan(plan);
  const environment = String(options.environment || '');
  if (environment !== plan.environment.name) {
    throw new Error(`环境不匹配: CLI=${environment}, plan=${plan.environment.name}`);
  }
  if (isProductionEnvironment(environment)) {
    throw new Error('生产环境默认阻断；本 runner 不提供生产调用绕过参数');
  }

  const env = Object.assign({}, options.env || {});
  const baseUrlValue = env[plan.environment.base_url_env];
  if (!baseUrlValue) throw new Error(`缺少环境变量 ${plan.environment.base_url_env}`);
  let baseUrl;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    throw new Error(`环境变量 ${plan.environment.base_url_env} 不是有效 URL`);
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error(`不允许的协议: ${baseUrl.protocol}`);
  if (baseUrl.username || baseUrl.password) throw new Error('base URL 不得包含凭证');
  if (baseUrl.search || baseUrl.hash) throw new Error('base URL 不得包含 query 或 fragment');
  const allowHosts = new Set((options.allowHosts || []).map((host) => String(host).toLowerCase()));
  for (const host of allowHosts) {
    if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error('--allow-host 只允许不含协议、端口和路径的 hostname');
  }
  if (!allowHosts.has(baseUrl.hostname.toLowerCase())) {
    throw new Error('目标 host 不在 CLI allowlist');
  }

  if (options.dryRun) {
    return {
      schema_version: '1.0',
      environment,
      target_host_fingerprint: fingerprintTarget(baseUrl),
      dry_run: true,
      summary: { total: plan.cases.length, passed: 0, failed: 0, not_run: plan.cases.length },
      cases: plan.cases.map((item) => ({ id: item.id, status: 'not-run' }))
    };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Node.js 运行时不支持 fetch');
  const timeoutMs = normalizeInteger(options.timeoutMs, 15000, 1, 300000, 'timeoutMs');
  const maxResponseBytes = normalizeInteger(options.maxResponseBytes, 2 * 1024 * 1024, 1, 10 * 1024 * 1024, 'maxResponseBytes');
  const cases = [];
  const runtimeValues = Object.assign({}, env);
  for (const item of plan.cases) {
    const result = await executeCase(item, {
      baseUrl,
      fetchImpl,
      runtimeValues,
      timeoutMs,
      maxResponseBytes
    });
    cases.push(result);
  }

  const passed = cases.filter((item) => item.status === 'pass').length;
  return {
    schema_version: '1.0',
    environment,
    target_host_fingerprint: fingerprintTarget(baseUrl),
    dry_run: false,
    summary: { total: cases.length, passed, failed: cases.length - passed, not_run: 0 },
    cases
  };
}

async function executeCase(item, context) {
  const retry = normalizeRetry(item.retry);
  let latest;
  for (let attempt = 1; attempt <= retry.attempts; attempt++) {
    latest = await executeCaseAttempt(item, context, attempt);
    if (latest.status === 'pass' || attempt === retry.attempts) break;
    if (retry.delay_ms > 0) await delay(retry.delay_ms);
  }
  return Object.assign({}, latest, { attempts: latest.attempt > 1 ? latest.attempt : 1 });
}

async function executeCaseAttempt(item, context, attempt) {
  const started = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  let timeout;
  const timeoutError = () => new Error(`请求处理超过 ${context.timeoutMs}ms 超时上限`);
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError());
    }, context.timeoutMs);
  });
  const withinDeadline = (operation) => Promise.race([Promise.resolve(operation), deadline]);
  const assertWithinDeadline = () => {
    if (timedOut || Date.now() - started >= context.timeoutMs) throw timeoutError();
  };
  try {
    const resolvedPath = resolveTemplates(item.path, context.runtimeValues);
    const url = new URL(resolvedPath, context.baseUrl);
    if (url.origin.toLowerCase() !== context.baseUrl.origin.toLowerCase()) {
      throw new Error('用例 path 不得改变协议、host 或端口');
    }
    const headers = resolveTemplates(item.headers || {}, context.runtimeValues);
    const bodyValue = item.body === undefined ? undefined : resolveTemplates(item.body, context.runtimeValues);
    const response = await withinDeadline(context.fetchImpl(url, {
      method: item.method || 'GET',
      headers,
      body: bodyValue === undefined ? undefined : JSON.stringify(bodyValue),
      redirect: 'manual',
      signal: controller.signal
    }));
    const responseHeaders = normalizeHeaders(response.headers);
    const text = await withinDeadline(readResponseText(response, responseHeaders, context.maxResponseBytes));
    assertWithinDeadline();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    const durationMs = Date.now() - started;
    const expected = resolveTemplates(item.expect, context.runtimeValues);
    const assertions = runAssertions(expected, response.status, text, json, responseHeaders, durationMs);
    assertWithinDeadline();
    const failed = assertions.filter((assertion) => !assertion.passed);
    if (!failed.length) applyCaptures(item.capture, json, context.runtimeValues);
    assertWithinDeadline();
    return {
      id: item.id,
      status: failed.length ? 'fail' : 'pass',
      http_status: response.status,
      duration_ms: durationMs,
      attempt,
      assertions
    };
  } catch (error) {
    return {
      id: item.id,
      status: 'fail',
      duration_ms: Date.now() - started,
      attempt,
      error: sanitizeError(timedOut ? timeoutError().message : error.message, Object.values(context.runtimeValues))
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validatePlan(plan) {
  if (!plan || !['1.0', '1.1'].includes(plan.schema_version)) {
    throw new Error('plan.schema_version 必须为 1.0 或 1.1');
  }
  if (!plan.environment || !plan.environment.name || !plan.environment.base_url_env) {
    throw new Error('plan.environment 必须包含 name 和 base_url_env');
  }
  if (!Array.isArray(plan.cases) || !plan.cases.length) throw new Error('plan.cases 必须为非空数组');
  const ids = new Set();
  for (const item of plan.cases) {
    if (!item.id || !item.path) throw new Error('每个用例必须包含 id 和 path');
    if (ids.has(item.id)) throw new Error(`用例 ID 重复: ${item.id}`);
    ids.add(item.id);
    if (typeof item.path !== 'string' || !item.path.startsWith('/') || item.path.startsWith('//') || /[\u0000\r\n]/.test(item.path)) {
      throw new Error(`用例 ${item.id} path 必须是同 origin 的 / 开头相对路径`);
    }
    const method = String(item.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) throw new Error(`用例 ${item.id} method 非法`);
    item.method = method;
    if (!item.expect || typeof item.expect !== 'object' || Array.isArray(item.expect) || !Object.keys(item.expect).length) {
      throw new Error(`用例 ${item.id} 必须包含至少一个明确 expect 断言`);
    }
    validateExpect(item.expect, item.id);
    const retry = normalizeRetry(item.retry);
    if (retry.attempts > 1 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const headers = Object.fromEntries(Object.entries(item.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
      if (item.retry_safe !== true || !headers['idempotency-key']) {
        throw new Error(`用例 ${item.id} 对非幂等 method 重试时必须显式 retry_safe: true 且提供 Idempotency-Key`);
      }
    }
    if (item.capture !== undefined && (!item.capture || typeof item.capture !== 'object' || Array.isArray(item.capture))) {
      throw new Error(`用例 ${item.id} capture 必须为对象`);
    }
  }
}

function runAssertions(expect, status, text, json, headers = {}, durationMs = 0) {
  const results = [];
  if (expect.status !== undefined) {
    const allowed = Array.isArray(expect.status) ? expect.status : [expect.status];
    results.push({ type: 'status', expected: expect.status, actual: status, passed: allowed.includes(status) });
  }
  for (const [jsonPath, expected] of Object.entries(expect.json || {})) {
    const actual = getPath(json, jsonPath);
    results.push({ type: 'json', path: jsonPath, passed: deepEqual(actual, expected) });
  }
  for (const [index, expected] of (expect.text_contains || []).entries()) {
    results.push({ type: 'text_contains', index, passed: text.includes(expected) });
  }
  for (const [index, unexpected] of (expect.text_not_contains || []).entries()) {
    results.push({ type: 'text_not_contains', index, passed: !text.includes(unexpected) });
  }
  for (const jsonPath of expect.json_exists || []) {
    results.push({ type: 'json_exists', path: jsonPath, passed: getPath(json, jsonPath) !== undefined });
  }
  for (const jsonPath of expect.json_not_empty || []) {
    results.push({ type: 'json_not_empty', path: jsonPath, passed: !isEmpty(getPath(json, jsonPath)) });
  }
  for (const [jsonPath, range] of Object.entries(expect.json_ranges || {})) {
    const value = getPath(json, jsonPath);
    results.push({ type: 'json_range', path: jsonPath, passed: inNumericRange(value, range) });
  }
  if (expect.json_schema) {
    const schemaErrors = validateJsonSchema(json, expect.json_schema);
    results.push({ type: 'json_schema', error_count: schemaErrors.length, passed: schemaErrors.length === 0 });
  }
  for (const [name, expected] of Object.entries(expect.headers || {})) {
    const actual = headers[String(name).toLowerCase()];
    results.push({ type: 'header', name: String(name).toLowerCase(), passed: deepEqual(actual, expected) });
  }
  if (expect.duration_ms_lte !== undefined) {
    results.push({ type: 'duration_ms_lte', expected: expect.duration_ms_lte, passed: durationMs <= expect.duration_ms_lte });
  }
  if (expect.body_bytes_lte !== undefined) {
    results.push({
      type: 'body_bytes_lte',
      expected: expect.body_bytes_lte,
      passed: Buffer.byteLength(text, 'utf8') <= expect.body_bytes_lte
    });
  }
  return results;
}

function validateExpect(expect, caseId) {
  const known = new Set([
    'status', 'json', 'text_contains', 'text_not_contains', 'json_exists', 'json_not_empty',
    'json_ranges', 'json_schema', 'headers', 'duration_ms_lte', 'body_bytes_lte'
  ]);
  const unknown = Object.keys(expect).filter((key) => !known.has(key));
  if (unknown.length) throw new Error(`用例 ${caseId} 包含未支持 expect: ${unknown.join(', ')}`);
  const statusValues = expect.status === undefined ? [] : (Array.isArray(expect.status) ? expect.status : [expect.status]);
  if (expect.status !== undefined && (!statusValues.length || statusValues.some((value) => !Number.isInteger(value) || value < 100 || value > 599))) {
    throw new Error(`用例 ${caseId} expect.status 必须是 100..599 整数或非空数组`);
  }
  for (const field of ['json', 'json_ranges', 'json_schema', 'headers']) {
    if (expect[field] !== undefined && (!expect[field] || typeof expect[field] !== 'object' || Array.isArray(expect[field]))) {
      throw new Error(`用例 ${caseId} expect.${field} 必须是 object`);
    }
  }
  for (const field of ['json', 'json_ranges', 'json_schema', 'headers']) {
    if (expect[field] !== undefined && Object.keys(expect[field]).length === 0) {
      throw new Error(`用例 ${caseId} expect.${field} 不得为空 object`);
    }
  }
  if (expect.json_schema) validateSchemaDefinition(expect.json_schema, `用例 ${caseId} expect.json_schema`);
  for (const [jsonPath, range] of Object.entries(expect.json_ranges || {})) {
    if (!range || typeof range !== 'object' || Array.isArray(range) || !Object.keys(range).some((key) => ['gt', 'gte', 'lt', 'lte'].includes(key))) {
      throw new Error(`用例 ${caseId} expect.json_ranges.${jsonPath} 必须包含 gt/gte/lt/lte`);
    }
    for (const [key, value] of Object.entries(range)) {
      if (!['gt', 'gte', 'lt', 'lte'].includes(key) || !Number.isFinite(value)) throw new Error(`用例 ${caseId} expect.json_ranges.${jsonPath}.${key} 非法`);
    }
  }
  for (const field of ['text_contains', 'text_not_contains', 'json_exists', 'json_not_empty']) {
    if (expect[field] !== undefined && (!Array.isArray(expect[field]) || !expect[field].length || expect[field].some((value) => typeof value !== 'string'))) {
      throw new Error(`用例 ${caseId} expect.${field} 必须是非空字符串数组`);
    }
  }
  for (const field of ['duration_ms_lte', 'body_bytes_lte']) {
    if (expect[field] !== undefined && (!Number.isFinite(expect[field]) || expect[field] < 0)) {
      throw new Error(`用例 ${caseId} expect.${field} 必须是非负数`);
    }
  }
}

function validateSchemaDefinition(schema, location) {
  const allowed = new Set(['type', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern']);
  const unknown = Object.keys(schema).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${location} 包含未支持关键字: ${unknown.join(', ')}`);
  if (!Object.keys(schema).length) throw new Error(`${location} 不得为空`);
  if (schema.type !== undefined && !['null', 'array', 'object', 'integer', 'number', 'string', 'boolean'].includes(schema.type)) {
    throw new Error(`${location}.type 非法`);
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length)) throw new Error(`${location}.enum 必须为非空数组`);
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== 'string'))) {
    throw new Error(`${location}.required 必须为字符串数组`);
  }
  if (schema.properties !== undefined) {
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) throw new Error(`${location}.properties 必须为 object`);
    for (const [key, child] of Object.entries(schema.properties)) validateSchemaDefinition(child, `${location}.properties.${key}`);
  }
  if (schema.items !== undefined) validateSchemaDefinition(schema.items, `${location}.items`);
  if (schema.pattern !== undefined) {
    try { new RegExp(schema.pattern); } catch { throw new Error(`${location}.pattern 不是有效正则`); }
  }
}

function normalizeRetry(value) {
  if (value === undefined) return { attempts: 1, delay_ms: 0 };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('retry 必须为对象');
  const attempts = Number(value.attempts === undefined ? 1 : value.attempts);
  const delayMs = Number(value.delay_ms === undefined ? 0 : value.delay_ms);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('retry.attempts 必须是 1..5');
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error('retry.delay_ms 必须是 0..5000');
  return { attempts, delay_ms: delayMs };
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof headers.entries === 'function') return Object.fromEntries([...headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
}

async function readResponseText(response, headers, limit) {
  const declared = Number(headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new Error(`响应体超过物理上限 ${limit} bytes`);
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > limit) {
        if (typeof reader.cancel === 'function') await reader.cancel();
        throw new Error(`响应体超过物理上限 ${limit} bytes`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > limit) throw new Error(`响应体超过物理上限 ${limit} bytes`);
  return text;
}

function applyCaptures(capture, json, runtimeValues) {
  for (const [name, jsonPath] of Object.entries(capture || {})) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`capture 变量名非法: ${name}`);
    if (Object.hasOwn(runtimeValues, name)) throw new Error(`capture 拒绝覆盖已有变量: ${name}`);
    const value = getPath(json, jsonPath);
    if (value === undefined || (value !== null && typeof value === 'object')) {
      throw new Error(`capture ${name} 未找到标量值`);
    }
    runtimeValues[name] = String(value);
  }
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (value && typeof value === 'object' && Object.keys(value).length === 0);
}

function inNumericRange(value, range) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !range || typeof range !== 'object') return false;
  if (range.gt !== undefined && !(value > range.gt)) return false;
  if (range.gte !== undefined && !(value >= range.gte)) return false;
  if (range.lt !== undefined && !(value < range.lt)) return false;
  if (range.lte !== undefined && !(value <= range.lte)) return false;
  return Object.keys(range).some((key) => ['gt', 'gte', 'lt', 'lte'].includes(key));
}

function validateJsonSchema(value, schema, location = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [`${location}: schema 必须为对象`];
  if (schema.type && !matchesJsonType(value, schema.type)) return [`${location}: type 应为 ${schema.type}`];
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => deepEqual(item, value))) errors.push(`${location}: 不在 enum`);
  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${location}.${key}: required`);
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (key in value) errors.push(...validateJsonSchema(value[key], child, `${location}.${key}`));
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${location}.${key}: additional property`);
    }
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location}: maxItems`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateJsonSchema(item, schema.items, `${location}[${index}]`)));
  }
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}: minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${location}: maxLength`);
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern).test(value))) errors.push(`${location}: pattern`);
  }
  return errors;
}

function matchesJsonType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPath(value, jsonPath) {
  return String(jsonPath).split('.').filter(Boolean).reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, value);
}

function resolveTemplates(value, env) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, name) => {
      if (!(name in env)) throw new Error(`缺少环境变量 ${name}`);
      return env[name];
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, env));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, env)]));
  }
  return value;
}

function loadEnvFile(file) {
  const env = {};
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`无法解析 env 文件第 ${index + 1} 行`);
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function sanitizeError(message, secretValues = []) {
  let sanitized = String(message);
  const secrets = secretValues
    .map((value) => String(value || ''))
    .filter((value) => value.length >= 4)
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) sanitized = sanitized.split(secret).join('***');
  return sanitized
    .replace(/https?:\/\/[^\s,;]+/gi, '<redacted-url>')
    .replace(/(token|password|secret|authorization)=?[^\s,;]*/gi, '$1=***')
    .slice(0, 300);
}

function isProductionEnvironment(environment) {
  return /^(?:prod(?:uction)?(?:[-_].*)?|生产(?:环境)?|线上|live(?:[-_].*)?)$/i.test(String(environment || '').trim());
}

function fingerprintTarget(url) {
  const effectivePort = url.port || (url.protocol === 'https:' ? '443' : '80');
  const target = `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}:${effectivePort}`;
  return `sha256:${crypto.createHash('sha256').update(target).digest('hex')}`;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeInteger(value, fallback, minimum, maximum, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} 必须是 ${minimum}..${maximum} 的整数`);
  }
  return number;
}

function parseArgs(argv) {
  const parsed = { plan: '', envFile: '', environment: '', allowHosts: [], output: '', dryRun: false, timeoutMs: 15000, maxResponseBytes: 2 * 1024 * 1024 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--plan') parsed.plan = argv[++i] || '';
    else if (arg === '--env-file') parsed.envFile = argv[++i] || '';
    else if (arg === '--environment') parsed.environment = argv[++i] || '';
    else if (arg === '--allow-host') parsed.allowHosts.push(...String(argv[++i] || '').split(',').map((v) => v.trim()).filter(Boolean));
    else if (arg === '--output') parsed.output = argv[++i] || '';
    else if (arg === '--timeout-ms') parsed.timeoutMs = Number(argv[++i] || 15000);
    else if (arg === '--max-response-bytes') parsed.maxResponseBytes = Number(argv[++i] || 2 * 1024 * 1024);
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node bin/run-api-tests.cjs --plan file --env-file file --environment test --allow-host host [--timeout-ms n] [--max-response-bytes n] [--dry-run] [--output file]');
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return parsed;
}

module.exports = {
  executePlan,
  loadEnvFile,
  resolveTemplates,
  runAssertions,
  sanitizeError,
  isProductionEnvironment,
  validatePlan,
  validateJsonSchema,
  readResponseText
};
