# Capability: automated-test-runner

- **Tier**: recommended
- **Stage**: `/06`（生成可执行计划）、`/07`（执行并记录证据）
- **Purpose**: 把测试执行从"全人工"升级为"接口测试 + 功能测试双轨自动执行"，agent 按计划真实调用接口与操作页面，产出可核验的证据矩阵。

## 为什么需要

人工回归是测试效率的最大瓶颈。接口测试具备完全自动化条件（用户提供密钥、地址、账号、业务数据后 agent 可直接调用断言）；Web/H5 功能测试可通过浏览器自动化 MCP 模拟点击并截图存证。自动化的目标是快速暴露回归，人工聚焦探索性测试与验收判断。

## 双轨定义

### API 轨（接口测试）

- 输入：`api-test-plan` 模板填写的用例（端点、方法、鉴权方式、入参、断言）+ 用户提供的测试数据（密钥、地址、账号、业务数据）。
- 执行：优先把用例转成 `api-test-plan.example.json` 同结构的 schema 1.1 计划，通过共享 runner `bin/run-api-tests.cjs` 逐用例发起 HTTP 调用。每个 case 强制至少一个明确 expect；支持 status 数组、response headers、JSON exact/exists/not-empty/range/schema、text contains/not-contains、duration/body budget、capture 和 bounded retry。
- 凭证约定：写入本地未跟踪文件（默认 `workflow/local/test-credentials.env`），**不进版本库、不进文档**；证据中的敏感字段脱敏。
- 边界：runner 不自动跟随 HTTP 重定向；生产、线上、`prod-*`、`production-*` 和 `live-*` 类环境名默认阻断。
- 输出：只保留目标 host SHA-256 指纹、用例状态、HTTP 状态码、attempts、耗时和断言布尔结果；不写响应正文、JSON 实际值、私有 host、header 或凭证。`/07` 另行绑定 contract/source/environment/fixture/tool fingerprint 并追加 Evidence Ledger。

### UI 轨（功能测试）

- Web/H5：通过浏览器自动化 MCP（Playwright 类）执行 导航 → 点击 → 填表 → 断言 → 截图，截图存入工作区级 `features/{feature}/screenshots/`。
- 小程序：通过官方 miniprogram-automator 挂接开发者工具执行脚本（见 `workflow/core/testing-automation-guide.md`）。
- 原生 App：登记为槽位，依赖 computer-use 类工具，暂不作为默认能力。

## 输入

- `06-测试用例.md` 与 `api-test-plan` / `ui-test-plan` 模板产物
- `workflow/team-profile.yaml#testing`（环境白名单、凭证文件路径、浏览器自动化工具）
- 本地凭证文件（用户准备，不入库）

## 输出

```yaml
result: PASS | WARN | BLOCK
tracks:
  - track: api | ui
    executed: <N>
    passed: <N>
    failed: <N>
    not_run: <N>
cases:
  - id: "<用例号>"
    track: api | ui
    status: pass | fail | not-run
    evidence: "<脱敏请求响应摘要 或 截图路径>"
blocked_reason: "..."
```

## 阻断规则

- 目标为生产环境（不在 `testing.environment_allowlist` 内，或标记为 production）时共享 runner 直接 BLOCK。确需只读探活生产必须在 runner 之外按执行策略单独审批和审计，不得修改 runner 绕过。
- 共享 API runner 的 CLI 环境、计划环境或 host allowlist 任一不匹配即 BLOCK；runner 自身不提供生产绕过参数，也不跟随重定向。
- API case 缺少明确 expect、capture 不是标量 / 变量名非法、或 retry 超出 1..5 次与 0..5000ms 边界时 BLOCK。
- 凭证、token、真实账号密码出现在测试计划文档、阶段产物或仓库中即 BLOCK。
- 断言失败的用例未闭环（修复或降级说明）前，不得把 `/07-测试执行` 标记为完成。
- 测试数据含真实客户数据时必须用户确认脱敏或替换。
- 自动化结果不替代验收判断：`/09-验收` 仍由人工确认。

## Adapter 示例

- **L0**: 测试计划模板 + 用户手工执行后回填结果。
- **L1**: prompt 生成逐用例的调用命令（curl 等）供用户执行。
- **L2**: slash command 读取计划、逐用例执行并回写证据。
- **L3**: hook 阻止缺少证据矩阵的测试完成状态。
- **L4**: 浏览器自动化 MCP + subagent 并行执行 UI 用例。

## 反模式

- 用生产账号或生产库跑自动化测试。
- 把密钥写进测试计划或提交进仓库。
- 截图含敏感数据不脱敏直接入库。
- 只截图不断言，把"页面打开了"当成"功能通过"。
- 用 bounded retry 掩盖 flaky，或用单请求 duration 断言冒充 p95/p99 benchmark。
- 断言失败但报告里只写"部分通过"不列失败清单。
