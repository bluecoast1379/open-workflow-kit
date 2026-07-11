#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { executePlan, loadEnvFile, validatePlan, validateJsonSchema } = require('../bin/run-api-tests.cjs');

const plan = {
  schema_version: '1.0',
  environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
  cases: [
    {
      id: 'API-001',
      method: 'GET',
      path: '/health',
      headers: { Authorization: 'Bearer ${TEST_API_TOKEN}' },
      expect: { status: 200, json: { status: 'ok' } }
    }
  ]
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

async function main() {
  const calls = [];
  const result = await executePlan(plan, {
    environment: 'test',
    allowHosts: ['api.example.test'],
    env: { TEST_BASE_URL: 'https://api.example.test', TEST_API_TOKEN: 'TEST_VALUE_NOT_A_REAL_SECRET' },
    fetchImpl: async (url, options) => {
      calls.push({
        url: String(url),
        authorizationPresent: Boolean(options.headers.Authorization),
        redirect: options.redirect
      });
      return { status: 200, text: async () => '{"status":"ok"}' };
    }
  });
  assert.strictEqual(result.summary.passed, 1);
  assert.strictEqual(result.summary.failed, 0);
  assert.deepStrictEqual(calls, [{
    url: 'https://api.example.test/health',
    authorizationPresent: true,
    redirect: 'manual'
  }]);
  assert.match(result.target_host_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes('api.example.test'));
  assert.ok(!Object.hasOwn(result.cases[0].assertions[1], 'actual'));

  const httpsDefaultTarget = await executePlan(plan, {
    environment: 'test', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'https://api.example.test' }, dryRun: true
  });
  const httpsExplicitDefaultTarget = await executePlan(plan, {
    environment: 'test', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'https://api.example.test:443' }, dryRun: true
  });
  const httpTarget = await executePlan(plan, {
    environment: 'test', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'http://api.example.test' }, dryRun: true
  });
  const alternatePortTarget = await executePlan(plan, {
    environment: 'test', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'https://api.example.test:8443' }, dryRun: true
  });
  assert.strictEqual(httpsDefaultTarget.target_host_fingerprint, httpsExplicitDefaultTarget.target_host_fingerprint);
  assert.notStrictEqual(httpsDefaultTarget.target_host_fingerprint, httpTarget.target_host_fingerprint);
  assert.notStrictEqual(httpsDefaultTarget.target_host_fingerprint, alternatePortTarget.target_host_fingerprint);

  const advancedPlan = {
    schema_version: '1.1',
    environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
    cases: [
      {
        id: 'API-CAPTURE',
        method: 'POST',
        path: '/items',
        expect: {
          status: [200, 201],
          headers: { 'content-type': 'application/json' },
          json_exists: ['data.id'],
          json_not_empty: ['data.id'],
          json_ranges: { 'data.count': { gte: 1, lte: 3 } },
          json_schema: {
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['id', 'count'],
                properties: { id: { type: 'string', minLength: 1 }, count: { type: 'integer' } }
              }
            }
          },
          text_not_contains: ['private-value'],
          duration_ms_lte: 1000,
          body_bytes_lte: 1024
        },
        capture: { CREATED_ID: 'data.id' }
      },
      {
        id: 'API-USE-CAPTURE',
        method: 'GET',
        path: '/items/${CREATED_ID}',
        expect: { status: 200, json: { 'data.id': '${CREATED_ID}' } },
        retry: { attempts: 2, delay_ms: 0 }
      }
    ]
  };
  const advancedCalls = [];
  const advancedResult = await executePlan(advancedPlan, {
    environment: 'test',
    allowHosts: ['api.example.test'],
    env: { TEST_BASE_URL: 'https://api.example.test' },
    fetchImpl: async (url) => {
      advancedCalls.push(String(url));
      return {
        status: advancedCalls.length === 1 ? 201 : 200,
        headers: { 'Content-Type': 'application/json' },
        text: async () => '{"data":{"id":"item-1","count":2}}'
      };
    }
  });
  assert.strictEqual(advancedResult.summary.failed, 0);
  assert.deepStrictEqual(advancedCalls, [
    'https://api.example.test/items',
    'https://api.example.test/items/item-1'
  ]);
  assert.strictEqual(advancedResult.cases[0].attempts, 1);

  assert.throws(
    () => validatePlan({
      schema_version: '1.1',
      environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
      cases: [{ id: 'API-NO-ASSERTION', path: '/health' }]
    }),
    /至少一个明确 expect 断言/
  );
  assert.throws(
    () => validatePlan({
      schema_version: '1.1',
      environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
      cases: [{ id: 'API-UNKNOWN-ASSERTION', path: '/health', expect: { looks_good: true } }]
    }),
    /未支持 expect/
  );
  assert.throws(
    () => validatePlan({
      schema_version: '1.1',
      environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
      cases: [{ id: 'API-EMPTY-JSON', path: '/health', expect: { json: {} } }]
    }),
    /不得为空 object/
  );
  assert.throws(
    () => validatePlan({
      schema_version: '1.1',
      environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
      cases: [{ id: 'API-UNKNOWN-SCHEMA', path: '/health', expect: { json_schema: { const: 'ok' } } }]
    }),
    /未支持关键字/
  );
  assert.throws(
    () => validatePlan({
      schema_version: '1.1',
      environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
      cases: [{ id: 'API-UNSAFE-RETRY', method: 'POST', path: '/items', retry: { attempts: 2 }, expect: { status: 200 } }]
    }),
    /retry_safe.*Idempotency-Key/
  );
  assert.doesNotThrow(() => validatePlan({
    schema_version: '1.1',
    environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
    cases: [{
      id: 'API-SAFE-RETRY', method: 'POST', path: '/items', retry: { attempts: 2 }, retry_safe: true,
      headers: { 'Idempotency-Key': '${REQUEST_ID}' }, expect: { status: 200 }
    }]
  }));
  assert.deepStrictEqual(validateJsonSchema({ id: 1 }, {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'integer' } }
  }), []);
  assert.ok(validateJsonSchema({ id: '1' }, {
    type: 'object',
    properties: { id: { type: 'integer' } }
  }).length > 0);

  await assert.rejects(
    () => executePlan({ ...plan, environment: { name: 'production', base_url_env: 'TEST_BASE_URL' } }, {
      environment: 'production', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'https://api.example.test' }
    }),
    /生产环境默认阻断/
  );

  await assert.rejects(
    () => executePlan({ ...plan, environment: { name: 'prod-cn', base_url_env: 'TEST_BASE_URL' } }, {
      environment: 'prod-cn', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'https://api.example.test' }
    }),
    /生产环境默认阻断/
  );

  await assert.rejects(
    () => executePlan(plan, {
      environment: 'test', allowHosts: ['other.example.test'], env: { TEST_BASE_URL: 'https://api.example.test' }
    }),
    /allowlist/
  );

  await assert.rejects(
    () => executePlan({
      ...plan,
      cases: [{ ...plan.cases[0], path: 'https://api.example.test:8443/health' }]
    }, {
      environment: 'test', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'https://api.example.test', TEST_API_TOKEN: 'test-token' }
    }),
    /同 origin|\/开头相对路径/
  );

  const oversized = await executePlan(plan, {
    environment: 'test',
    allowHosts: ['api.example.test'],
    env: { TEST_BASE_URL: 'https://api.example.test', TEST_API_TOKEN: 'test-token' },
    maxResponseBytes: 4,
    fetchImpl: async () => ({ status: 200, headers: { 'content-length': '20' }, text: async () => '01234567890123456789' })
  });
  assert.strictEqual(oversized.summary.failed, 1);
  assert.match(oversized.cases[0].error, /物理上限/);

  const slowBody = await executePlan(plan, {
    environment: 'test',
    allowHosts: ['api.example.test'],
    env: { TEST_BASE_URL: 'https://api.example.test', TEST_API_TOKEN: 'test-token' },
    timeoutMs: 10,
    fetchImpl: async () => ({
      status: 200,
      headers: {},
      body: {
        getReader: () => ({
          read: () => new Promise(() => {}),
          cancel: async () => undefined
        })
      }
    })
  });
  assert.strictEqual(slowBody.summary.failed, 1);
  assert.match(slowBody.cases[0].error, /超时上限/);
  assert.ok(slowBody.cases[0].duration_ms < 250, `slow body timeout took ${slowBody.cases[0].duration_ms}ms`);

  const captureOverwritePlan = {
    schema_version: '1.1',
    environment: { name: 'test', base_url_env: 'TEST_BASE_URL' },
    cases: [{ id: 'API-CAPTURE-OVERWRITE', path: '/health', expect: { status: 200 }, capture: { TEST_BASE_URL: 'url' } }]
  };
  const captureOverwrite = await executePlan(captureOverwritePlan, {
    environment: 'test', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'https://api.example.test' },
    fetchImpl: async () => ({ status: 200, text: async () => '{"url":"https://evil.invalid"}' })
  });
  assert.strictEqual(captureOverwrite.summary.failed, 1);
  assert.match(captureOverwrite.cases[0].error, /拒绝覆盖/);

  const dryRun = await executePlan(plan, {
    environment: 'test', allowHosts: ['api.example.test'], env: { TEST_BASE_URL: 'https://api.example.test' }, dryRun: true
  });
  assert.strictEqual(dryRun.summary.not_run, 1);

  const leakedValue = 'VERY_PRIVATE_' + 'TOKEN_VALUE_9142';
  const failed = await executePlan(plan, {
    environment: 'test',
    allowHosts: ['api.example.test'],
    env: { TEST_BASE_URL: 'https://api.example.test', TEST_API_TOKEN: leakedValue },
    fetchImpl: async () => {
      throw new Error(`request failed at https://api.example.test/health?token=${leakedValue}`);
    }
  });
  const failedOutput = JSON.stringify(failed);
  assert.ok(!failedOutput.includes(leakedValue));
  assert.ok(!failedOutput.includes('api.example.test'));
  assert.match(failed.cases[0].error, /redacted-url|\*\*\*/);

  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-runner-env-'));
  const envFile = path.join(envDir, 'credentials.env');
  const malformedSecret = 'MALFORMED_' + 'PRIVATE_VALUE_7812';
  fs.writeFileSync(envFile, malformedSecret + '\n');
  assert.throws(() => loadEnvFile(envFile), (error) => {
    assert.ok(!error.message.includes(malformedSecret));
    return /第 1 行/.test(error.message);
  });
  console.log('API runner test passed.');
}
