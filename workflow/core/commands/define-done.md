# /define-done

## Goal

把人类意图编译成一份可 lint、可执行、可证明、可失效、可治理的 Completion Contract；在授权实现前明确“什么叫完成、如何证明、什么绝不能被 Agent 自行改变”。

## Required Inputs

- `AGENTS.md`、`workflow/team-profile.yaml`
- 用户目标、01/02/02B、`03-技术架构.md`、`06-测试用例.md`（全部 `NOT_RUN`）与真实产品 / 代码 / 数据 / 运行环境事实
- `/new-feature` 生成并由 03/06 细化的 draft contract、版本化 `environment.yaml`、显式 `findings.yaml` 与适用 policy packs

## Execution Rules

- 新建时给 contract 一个稳定 feature ID 与 version；更新冻结合同必须递增 version、记录变更理由 / 决策者 / diff，并使受影响旧证据 `STALE`。
- Agent 可以起草、lint 和指出矛盾，不能自行批准商业目标、降低 blocking 阈值、删除 AC、扩大 waiver 或把 human gate 改成自动通过。
- 每个验收条件使用稳定 `AC-###`；删除后 ID 保留 retired 记录，不重用。
- 本命令只定义完成，不授权业务代码、数据库、部署、生产配置或公开发布操作。

## Required Structure

Completion Contract 至少包含：

1. `feature`：ID、name、version、Owner、评审者、状态、创建 / 冻结时间。
2. `objective/outcome`：问题、目标用户、North Star、baseline、target、观测窗口、guardrail、止损条件。
3. `scope`：repos / allowed_paths / forbidden_paths、In scope、Non-goals、反需求、必须保持的不变量和公开契约。
4. `domain`：词汇表、实体、权威数据源、data flows、state machines、业务规则、时间 / 并发 / 一致性语义。
5. `organization`：DRI、决策者、评审者、依赖 Owner / SLA、审批与升级路径。
6. `assumptions/decisions/risks`：稳定 ID、证据、Owner、期限、验证 / 缓解和关联 AC。
7. `quality_budgets`：business、UX/accessibility、performance/cost、reliability/resilience、security/privacy/compliance、observability/operations、reversibility/evolution、AI quality。
8. `acceptance`：`AC-###`、关联 REQ/RISK、priority、blocking、Given / When / Then、Oracle、threshold、environment、fixture、evidence、freshness、human gate。
9. `autonomy`：允许 / 禁止 / 需询问动作、max iterations / elapsed / cost / diff、重试 / flaky 策略、stop conditions 和恢复 checkpoint。
10. `governance`：冻结、变更批准、evidence invalidation、waiver 字段、anti-cheating 与最终聚合规则。
11. `environment/findings`：精确 runtime/dependency/service/data/model/tool 版本，以及有 Owner、来源、时间和 freshness 的显式 review snapshot。

## Definition Lint

至少检查：

- ID 唯一、引用可解析、P0/P1 REQ/RISK 有 AC、blocking AC 有 Oracle 和证据要求。
- 所有形容词型标准有阈值、单位、环境、样本或人工 rubric。
- scope、non-goals、invariants、allowed/forbidden paths 不矛盾。
- 正常 / 异常 / 边界 / 权限 / 并发 / 部分失败 / 恢复，以及所有适用质量维度有覆盖或 N/A 理由。
- 自动 Oracle 可复现；人工 Oracle 有角色、rubric 与失败条件。
- waiver 有批准人、理由、范围、补偿控制、到期日；WAIVED 不参与 PASS 计数。
- Agent 无权降低的字段被标记，Evidence Ledger 与 source/environment invalidation 规则存在。

## Exit Criteria

- Definition Lint 无 error；warning 均有 Owner、期限和不阻断理由。
- 所有 blocking `AC-###` 具有明确 Oracle、阈值、环境 / 数据、证据、新鲜度与 human gate 属性。
- 商业价值、组织、UX、性能成本、安全隐私、可观测性、可逆演进、AI / 非确定性、non-goals 与 assumptions 均已定义或有审计级 N/A。
- 合同已由有权 Owner 冻结；hash 与版本写入状态页，适用 policy packs 记录完整。
- 合同更新时，受影响证据已标 `STALE`，没有保留跨版本的伪通过。

## Required Outputs

- `features/{feature}/completion/contract.yaml`
- `features/{feature}/completion/environment.yaml`
- `features/{feature}/completion/findings.yaml`
- `features/{feature}/completion/run-state.yaml`（初始状态或更新后的失效状态）
- 更新 `features/{feature}/00-工作流状态.md`
- 必要时生成 contract change / decision packet
