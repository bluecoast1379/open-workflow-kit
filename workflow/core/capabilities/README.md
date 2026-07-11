# Capabilities

Capabilities 定义“何时适用、检查什么、什么会阻断、需要什么证据”。adapter 可实现为文档、prompt、原生命令、hook 或多 agent 路由，但不能削弱核心阻断规则。

机器可读事实源为 `../capability-manifest.yaml`：

- `essential` 始终 required。
- `recommended` 在 request / diff 关键词或 Completion Contract path 命中时自动升级 required，不得静默跳过。
- `optional` 由 policy pack、团队或风险评审显式启用；一旦启用，其 blocking 规则仍生效。

## 能力等级

| 等级 | 典型实现 |
| --- | --- |
| L0 | 文档规则 |
| L1 | Prompt / checklist |
| L2 | 工具原生命令 / rule |
| L3 | validator / hook |
| L4 | 独立 verifier / 多 agent 路由 |

## Definition-to-Done 能力

| Tier | Capability | 核心用途 |
| --- | --- | --- |
| essential | [definition-quality-linter](./definition-quality-linter.md) | lint 目标、范围、non-goals、不变量、AC、Oracle 与歧义 |
| essential | [evidence-freshness-checker](./evidence-freshness-checker.md) | 绑定 contract/source/environment/data/tool 指纹并失效旧证据 |
| essential | [autonomy-anti-cheating-guard](./autonomy-anti-cheating-guard.md) | 防止弱化合同 / 测试、伪造 PASS、scope drift 与预算失控 |
| recommended | [business-value-validator](./business-value-validator.md) | North Star、baseline/target、guardrail 与商业观察窗 |
| recommended | [organization-consensus-checker](./organization-consensus-checker.md) | DRI、决策权、依赖 SLA、审批与签收边界 |
| recommended | [ux-human-factor-reviewer](./ux-human-factor-reviewer.md) | 任务、认知、信任、恢复、accessibility 与反暗黑模式 |
| recommended | [performance-cost-budget-checker](./performance-cost-budget-checker.md) | p50/p95/p99、负载、资源、单次 / 周期成本 |
| recommended | [resilience-recovery-checker](./resilience-recovery-checker.md) | 部分故障、资源耗尽、RTO/RPO、恢复与爆炸半径 |
| recommended | [observability-operability-checker](./observability-operability-checker.md) | logs/metrics/traces/alerts/runbooks 与人工处置 |
| recommended | [reversibility-evolution-checker](./reversibility-evolution-checker.md) | flag、rollback、兼容、迁移、清理与安全下线 |
| recommended | [ai-quality-evaluator](./ai-quality-evaluator.md) | 版本化黄金集、风险切片、方差、幻觉、安全、回退与成本 |

## 工程交付能力

| Tier | Capability | 阶段 / 用途 |
| --- | --- | --- |
| essential | [branch-gatekeeper](./branch-gatekeeper.md) | 04：读取 team-profile 分支 / 实现 gate |
| essential | [release-safety-checker](./release-safety-checker.md) | 05/07/11：发布候选、生产基线与范围 |
| essential | [prd-code-diff-checker](./prd-code-diff-checker.md) | 04/05：REQ/AC 与真实 diff |
| essential | [contract-tracer](./contract-tracer.md) | 03/05：入口到数据 / 消费者终点 |
| recommended | [repo-baseline-scanner](./repo-baseline-scanner.md) | 03：branch/commit/dirty 与事实降级 |
| recommended | [impact-scope-analyzer](./impact-scope-analyzer.md) | 03：跨仓 / API / UI / data / config / release 影响面 |
| recommended | [worktree-isolator](./worktree-isolator.md) | 04：同仓并行隔离 |
| recommended | [security-reviewer](./security-reviewer.md) | 02–07：安全、隐私、合规、滥用与供应链 |
| recommended | [verify-app](./verify-app.md) | 04/07：真实 build/test/browser/runtime 验证 |
| recommended | [deployment-readiness-checker](./deployment-readiness-checker.md) | 07/11：构建、启动、部署、路由与 release commit |
| recommended | [runtime-evidence-triage](./runtime-evidence-triage.md) | 03/05/07：运行态证据替代静态猜测 |
| recommended | [data-change-safety-checker](./data-change-safety-checker.md) | 03/05/07：DDL/DML/补数的预检、后检与恢复 |
| recommended | [protocol-state-machine-checker](./protocol-state-machine-checker.md) | 03/05/07：异步 / 第三方状态、幂等与失败语义 |
| recommended | [ci-cd-automation-governor](./ci-cd-automation-governor.md) | 03/04/07/11：按真实 branch model 治理自动化 |
| recommended | [toolchain-mcp-planner](./toolchain-mcp-planner.md) | init/connect：最小权限接入证据链 |
| recommended | [automated-test-runner](./automated-test-runner.md) | 06/07：API 1.1 + UI 双轨可执行验证 |
| optional | [test-evidence-reviewer](./test-evidence-reviewer.md) | 独立复核覆盖和 Oracle 证伪性 |
| optional | [ui-baseline-reviewer](./ui-baseline-reviewer.md) | 设计 tokens / components / implementation 一致性 |
| optional | [memory-curator](./memory-curator.md) | 12：脱敏经验候选 |
| optional | [rule-extractor](./rule-extractor.md) | 12：可复用 core 规则候选 |

## 与 Rules / Policy Packs / Checklists 的关系

- `rules/definition-quality-catalog.yaml` 定义完成合同质量规则；`rules/rule-catalog.yaml` 保留工程事故规则。
- `policy-packs/` 根据标准、高风险数据、公开契约、AI、敏感数据和用户体验场景加严能力与 AC 维度。
- `checklists/` 展开高频执行项；capability 负责适用、聚合与阻断。
- 多个来源适用时取并集与最严格结果；冲突时 BLOCK 并生成 decision packet。

高风险写操作始终由 `workflow/core/execution-policy.md` 管理。capability 判定“应该检查 / 是否可继续”，不自行扩大 Git、数据库、部署、生产配置或外部写权限。
