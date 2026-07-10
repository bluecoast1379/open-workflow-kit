# Capabilities

Capabilities 是可复用检查能力。不同工具可以把它们实现成 prompt、规则、hooks、checklist 或 subagent；实现形态可以不同，但核心阻断规则不能被削弱。

## 能力等级

| 等级 | 含义 | 常见实现 |
| --- | --- | --- |
| L0 | 文档规则 | `AGENTS.md`、core 文档 |
| L1 | Prompt 或 checklist | prompts、命令模板 |
| L2 | 工具原生规则 | slash commands、editor rules |
| L3 | Hooks 或前置检查 | 本地 validator |
| L4 | 多 agent 路由 | 支持 subagent 的工具 |

## 分层定义

| 分层 | 含义 |
| --- | --- |
| essential | 首批必须接入；直接保护实现闸门和核心交付风险。 |
| recommended | 第二批接入；补齐范围扫描、运行验证、数据变更和发布准备。 |
| optional | 团队规模或风险场景需要时再接入。 |

## 最小能力集

| 分层 | Capability | 用途 | 阶段 |
| --- | --- | --- | --- |
| essential | [branch-gatekeeper](./branch-gatekeeper.md) | 阻止在错误分支或错误阶段修改业务代码 | `/04` |
| essential | [release-safety-checker](./release-safety-checker.md) | 对比发布候选与生产基线，防止范围漂移 | `/05`, `/07`, `/11` |
| essential | [prd-code-diff-checker](./prd-code-diff-checker.md) | 对比产品意图、技术方案与真实 diff | `/05` |
| essential | [contract-tracer](./contract-tracer.md) | 追踪跨服务、跨层或前后端契约变更 | `/03`, `/05` |
| recommended | [worktree-isolator](./worktree-isolator.md) | 同仓多需求进入实现后强制 worktree 隔离 | `/04` |
| recommended | [repo-baseline-scanner](./repo-baseline-scanner.md) | 记录分支、dirty 状态和事实来源降级 | `/03` |
| recommended | [impact-scope-analyzer](./impact-scope-analyzer.md) | 扫描仓库、API、UI、数据、配置和测试影响面 | `/03` |
| recommended | [security-reviewer](./security-reviewer.md) | 审查凭证、鉴权、隐私、ACL、配置和审计风险 | `/05` |
| recommended | [verify-app](./verify-app.md) | 记录真实执行的构建、单测、集成、浏览器或人工验证 | `/04`, `/07` |
| recommended | [deployment-readiness-checker](./deployment-readiness-checker.md) | 区分构建成功、启动成功、部署生效和路由可达 | `/07`, `/11` |
| recommended | [runtime-evidence-triage](./runtime-evidence-triage.md) | 用运行态证据替代静态猜测，定位部署、路由、配置和日志问题 | `/03`, `/05`, `/07` |
| recommended | [data-change-safety-checker](./data-change-safety-checker.md) | 管理 DDL/DML/数据修复的交付位置、预检查、后检查和回滚口径 | `/03`, `/05`, `/07` |
| recommended | [protocol-state-machine-checker](./protocol-state-machine-checker.md) | 让多步外部协议按状态机建模，明确终态、幂等和失败语义 | `/03`, `/05`, `/07` |
| recommended | [ci-cd-automation-governor](./ci-cd-automation-governor.md) | 按成熟度分级引入 CI/CD 自动化，防止自动化放大未审代码的发布风险 | `/03`, `/04`, `/07`, `/11` |
| recommended | [toolchain-mcp-planner](./toolchain-mcp-planner.md) | 探测工具链槽位并维护 MCP 连接计划，只读优先接入证据链 | `init-workspace`, `connect-toolchain` |
| recommended | [automated-test-runner](./automated-test-runner.md) | 接口/功能测试双轨自动执行，产出可核验证据矩阵 | `/06`, `/07` |
| optional | [test-evidence-reviewer](./test-evidence-reviewer.md) | 检查测试是否真的证明需求行为 | `/06`, `/07` |
| optional | [ui-baseline-reviewer](./ui-baseline-reviewer.md) | 检查 UI 实现是否符合设计和前端规范 | `/02`, `/04A`, `/05` |
| optional | [memory-curator](./memory-curator.md) | 把复盘中的可复用经验脱敏沉淀为结构化记忆 | `/12` |
| optional | [rule-extractor](./rule-extractor.md) | 从复盘中提炼可进入 workflow core 的通用规则候选 | `/12` |

## 与检查清单的关系

能力定义"检查什么、何时阻断"；`workflow/core/checklists/` 把高频事故模式展开为可逐条打勾的执行清单。相关能力文件在执行时应联动对应清单：branch-gatekeeper / release-safety-checker ↔ `branch-hygiene`；prd-code-diff-checker ↔ `test-blind-spots` §B（死字段检测）；data-change-safety-checker ↔ `data-consistency-review`；protocol-state-machine-checker / contract-tracer ↔ `third-party-integration-review`；impact-scope-analyzer ↔ `validation-change-review`。

## 接入建议

先接入四个 essential 能力，保护“分支 / 阶段 / 发布范围 / PRD-diff / 契约追踪”这些最容易造成严重返工的边界。稳定后再接入 recommended 能力，补齐部署有效性、运行态证据、数据变更、多步协议、工具链证据链和自动化测试。optional 能力适合团队进入规模化使用后逐步增强。高风险写操作的执行方式统一由 `workflow/core/execution-policy.md` 约束。
