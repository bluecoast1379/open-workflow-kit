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
    timeoutMs: args.timeoutMs
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
      target_host_fingerprint: fingerprintHost(baseUrl.hostname),
      dry_run: true,
      summary: { total: plan.cases.length, passed: 0, failed: 0, not_run: plan.cases.length },
      cases: plan.cases.map((item) => ({ id: item.id, status: 'not-run' }))
    };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Node.js 运行时不支持 fetch');
  const cases = [];
  for (const item of plan.cases) {
    const started = Date.now();
    try {
      const resolvedPath = resolveTemplates(item.path, env);
      const url = new URL(resolvedPath, baseUrl);
      if (url.hostname.toLowerCase() !== baseUrl.hostname.toLowerCase()) {
        throw new Error('用例 path 不得跳转到其他 host');
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 15000));
      let response;
      try {
        const headers = resolveTemplates(item.headers || {}, env);
        const bodyValue = item.body === undefined ? undefined : resolveTemplates(item.body, env);
        response = await fetchImpl(url, {
          method: item.method || 'GET',
          headers,
          body: bodyValue === undefined ? undefined : JSON.stringify(bodyValue),
          redirect: 'manual',
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      const text = await response.text();
      let json;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      const assertions = runAssertions(item.expect || {}, response.status, text, json);
      const failed = assertions.filter((assertion) => !assertion.passed);
      cases.push({
        id: item.id,
        status: failed.length ? 'fail' : 'pass',
        http_status: response.status,
        duration_ms: Date.now() - started,
        assertions
      });
    } catch (error) {
      cases.push({
        id: item.id,
        status: 'fail',
        duration_ms: Date.now() - started,
        error: sanitizeError(error.message, Object.values(env))
      });
    }
  }

  const passed = cases.filter((item) => item.status === 'pass').length;
  return {
    schema_version: '1.0',
    environment,
    target_host_fingerprint: fingerprintHost(baseUrl.hostname),
    dry_run: false,
    summary: { total: cases.length, passed, failed: cases.length - passed, not_run: 0 },
    cases
  };
}

function validatePlan(plan) {
  if (!plan || plan.schema_version !== '1.0') throw new Error('plan.schema_version 必须为 1.0');
  if (!plan.environment || !plan.environment.name || !plan.environment.base_url_env) {
    throw new Error('plan.environment 必须包含 name 和 base_url_env');
  }
  if (!Array.isArray(plan.cases) || !plan.cases.length) throw new Error('plan.cases 必须为非空数组');
  const ids = new Set();
  for (const item of plan.cases) {
    if (!item.id || !item.path) throw new Error('每个用例必须包含 id 和 path');
    if (ids.has(item.id)) throw new Error(`用例 ID 重复: ${item.id}`);
    ids.add(item.id);
  }
}

function runAssertions(expect, status, text, json) {
  const results = [];
  if (expect.status !== undefined) {
    results.push({ type: 'status', expected: expect.status, actual: status, passed: status === expect.status });
  }
  for (const [jsonPath, expected] of Object.entries(expect.json || {})) {
    const actual = getPath(json, jsonPath);
    results.push({ type: 'json', path: jsonPath, passed: deepEqual(actual, expected) });
  }
  for (const [index, expected] of (expect.text_contains || []).entries()) {
    results.push({ type: 'text_contains', index, passed: text.includes(expected) });
  }
  if (!results.length) results.push({ type: 'response_received', passed: true });
  return results;
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

function fingerprintHost(hostname) {
  return `sha256:${crypto.createHash('sha256').update(String(hostname).toLowerCase()).digest('hex')}`;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseArgs(argv) {
  const parsed = { plan: '', envFile: '', environment: '', allowHosts: [], output: '', dryRun: false, timeoutMs: 15000 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--plan') parsed.plan = argv[++i] || '';
    else if (arg === '--env-file') parsed.envFile = argv[++i] || '';
    else if (arg === '--environment') parsed.environment = argv[++i] || '';
    else if (arg === '--allow-host') parsed.allowHosts.push(...String(argv[++i] || '').split(',').map((v) => v.trim()).filter(Boolean));
    else if (arg === '--output') parsed.output = argv[++i] || '';
    else if (arg === '--timeout-ms') parsed.timeoutMs = Number(argv[++i] || 15000);
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node bin/run-api-tests.cjs --plan file --env-file file --environment test --allow-host host [--dry-run] [--output file]');
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return parsed;
}

module.exports = { executePlan, loadEnvFile, resolveTemplates, runAssertions, sanitizeError, isProductionEnvironment };
