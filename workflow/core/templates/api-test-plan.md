# 接口测试计划（api-test-plan 1.1）

> 由 `/06-测试用例` 从 Completion Contract 的 `AC-###` 派生，`/07-测试执行` 通过 `automated-test-runner` 真实执行。
> 凭证与敏感测试数据只写本地未跟踪文件（默认 `workflow/local/test-credentials.env`），禁止写入计划、证据或仓库。

## 执行快照

| 项 | 值 |
| --- | --- |
| Completion Contract | version / hash |
| Source fingerprint | branch / commit / dirty |
| 目标环境 | test / staging；必须与 CLI 和 team-profile allowlist 一致 |
| Base URL | 只写环境变量名，如 `TEST_BASE_URL` |
| 显式 host allowlist | 执行时用 `--allow-host` 传入 hostname |
| fixture / seed | 版本、构造 / 清理方式 |
| 凭证来源 | `workflow/local/test-credentials.env` 中的变量名 |
| 生产防护 | 生产 / 线上 / live 名称默认 BLOCK，runner 无绕过开关 |

## 计划格式

- `schema_version` 使用 `1.1`。
- 每个 case 必须有唯一 `id`、`path` 和至少一个明确 `expect`；只有收到响应不能算 PASS。
- `${UPPER_CASE_VAR}` 可用于 path、headers、body；值来自 env 或前序成功用例的 `capture`。
- `capture` 只从 JSON path 抽取标量，变量名必须是大写形式；capture 失败会使该用例 FAIL。
- `retry.attempts` 为 1..5，`delay_ms` 为 0..5000；只用于合同允许的 bounded retry，不得用重跑掩盖 flaky。
- POST/PUT/PATCH/DELETE 等非天然幂等方法只有在 `retry_safe: true` 且提供 `Idempotency-Key` 时才能重试。
- case `path` 只能是 `/` 开头的同 origin 相对路径；不得切换协议、host 或端口。runner 默认在 2 MiB 处物理截断响应体，可用 `--max-response-bytes` 在 1 byte..10 MiB 内收紧或调整。

## 支持的断言

| 字段 | 语义 | 示例 |
| --- | --- | --- |
| `status` | 单个或允许的 HTTP 状态数组 | `200` 或 `[200, 201]` |
| `json` | JSON path 精确值 | `{ "code": 0 }` |
| `json_exists` | path 必须存在 | `["data.id"]` |
| `json_not_empty` | 非 null / 空串 / 空数组 / 空对象 | `["data.items"]` |
| `json_ranges` | 数值 `gt/gte/lt/lte` | `{ "data.count": { "gte": 1 } }` |
| `json_schema` | 有限 JSON Schema 子集 | `type/enum/required/properties/additionalProperties/items/minItems/maxItems/minLength/maxLength/pattern` |
| `headers` | 响应 header 精确值，名称不区分大小写 | `{ "content-type": "application/json" }` |
| `text_contains` | 响应文本必须包含 | `["ready"]` |
| `text_not_contains` | 响应文本不得包含 | `["stack trace", "secret"]` |
| `duration_ms_lte` | 单请求耗时硬上限 | `800` |
| `body_bytes_lte` | UTF-8 响应体大小上限 | `65536` |

## 用例矩阵

| 用例 | AC ID | 场景 | 方法 / path | 输入与前置 | 断言 | retry / capture | 清理 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API-001 | AC-001 | 正常流 | POST `/api/...` | fixture v1 | 201、schema、id 非空、800ms 内 | capture `RESOURCE_ID` | DELETE fixture |
| API-002 | AC-002 | 缺参数 | POST `/api/...` | 缺字段 | 400/422、业务码、无 stack trace | 无 retry | 无 |
| API-003 | AC-003 | 权限边界 | GET `/api/...` | 低权限角色 | 403 且无敏感字段 | 无 retry | 无 |
| API-004 | AC-004 | 幂等 | POST `/api/...` 两次 | 同 idempotency key | 不重复创建 | 合同定义的 retry | 清理一条记录 |

用例必须覆盖 test-blind-spots，并分别验证同一规则的接口、导入、页面、异步等入口。性能阈值应使用足够样本的 benchmark；单请求 `duration_ms_lte` 只能证明该次调用，不得替代 p95/p99 测试。

## 执行与证据

```bash
node bin/run-api-tests.cjs \
  --plan features/<feature>/api-test-plan.json \
  --env-file workflow/local/test-credentials.env \
  --environment test \
  --allow-host test-api.example.test \
  --max-response-bytes 2097152 \
  --output features/<feature>/api-test-result.json
```

执行结果要与 contract/source/environment/fixture/tool fingerprint 一起登记进 Evidence Ledger。runner 结果不回显 response body、JSON 实际值、私有 URL、请求 header 或凭证；失败摘要仍需二次确认脱敏。

## 执行记录（由 /07 回填）

| 用例 | AC ID | 状态 | attempts | 断言摘要 | Evidence Ledger ref | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| API-001 | AC-001 | PASS / FAIL / BLOCKED / NOT_RUN / STALE | 1 | 脱敏摘要 | 待填写 | |
