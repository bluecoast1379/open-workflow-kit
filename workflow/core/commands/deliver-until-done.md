# /deliver-until-done

## Goal

在一次明确、可撤销的授权范围内，持续执行“实现 → 独立审查 → 验证 → 修复 → 全量复验”，直到所有自动 blocking AC 通过、出现需要人类决策的阻断，或达到预先定义的自主预算。

## Required Inputs

- 已冻结且通过 Definition Lint 的 `features/{feature}/completion/contract.yaml`（Completion Contract）
- 已填写且通过校验的 `completion/environment.yaml` 与当前 `completion/findings.yaml`；显式空 findings 才代表已检查无 finding
- Owner-signed execution permit、匹配的 Ed25519 public key，以及只从仓库外环境注入的 automation attestation key
- 通过的实现准入、真实 branch / worktree / baseline 与允许路径
- `06-测试用例.md` 和可执行 Oracles
- `team-profile` 的 execution policy、环境 allowlist、质量预算和 policy packs
- 用户对本次实现范围的明确授权；该授权不自动包含 push / merge / deploy /生产写入

## Execution Rules

- 本命令是实现编排器：只有 branch、stage、worktree 和 execution-policy gate 通过时才可进入 `/04`；`/06` 的 Oracle 必须已在研发准备中设计为 `NOT_RUN`，真实审查与执行分别遵守 `/05`、`/07`。
- 每轮持久化 `run-state.yaml`：iteration、source fingerprint、失败队列、预算消耗、下一动作和 checkpoint；中断后幂等恢复，不能依赖聊天上下文。
- 修复后必须先重跑受影响 Oracle，再运行 contract 定义的必跑回归；证据按新 source fingerprint 追加，旧证据标 `STALE`，不得覆盖历史。
- 若发现合同缺陷，停止并生成 contract-change decision packet；Agent 不得自行降低阈值、删除 AC / 测试、扩大 scope / waiver 或修改测试适配错误实现。
- 验证者应与实现上下文隔离到工具允许的最大程度；自审不能替代独立 verifier。
- 外部高风险操作始终按 execution-policy 逐项处理；到达自动完成不等于人工验收或发布授权。

## Required Structure

1. **启动快照**：contract version/hash、source/environment/findings、branch / worktree / base、permit、授权范围、预算与 policy packs。
2. **工作队列**：按 blocking、风险、依赖排序的 `AC/REQ/RISK`；每项记录实现、审查、验证和状态。
3. **迭代循环**：
   - 选取最高优先未满足项；
   - 在允许路径内最小实现；
   - 执行本地快速检查；
   - 由独立审查视角检查 scope、契约、安全与 anti-cheating；
   - 执行相关 Oracle；
   - 更新 Evidence Ledger 与 run-state；
   - 有修复则失效受影响证据并进入下一轮。
4. **全量复验**：所有局部项绿后，执行 contract 所列必跑回归、性能成本、安全、韧性、可访问性、回滚 / 恢复和 AI eval。
5. **预算与收敛**：迭代、elapsed、模型 / 基础设施成本、diff、失败趋势和人类注意力；不因剩余预算少而虚报完成。
6. **终态包**：READY、decision packet 或 budget report，包含未满足 AC、证据、根因、已尝试方案和最小所需决策。

## Stop Conditions

立即停止自主循环并生成 decision packet：

- 需要修改被冻结的目标、范围、AC、blocking、阈值或 human gate；
- 需要越过 allowed paths、执行未授权的高风险 / 生产 / 外部动作或获得第三方审批；
- 缺少凭证、测试数据、环境、设备或不可替代的外部状态；
- 同一失败指纹达到合同阈值，或连续两轮 blocking failure 没有下降；
- 测试疑似 flaky / Oracle 错误 / 目标自相矛盾；
- 达到 iteration / elapsed / cost / diff 等任一预算；
- 发现 P0 安全、隐私、数据损坏或不可逆风险。

## Exit Criteria

唯一合法终态：

- `READY_FOR_HUMAN_ACCEPTANCE`：当前 contract/source/environment/findings 上所有非人工 blocking AC 为 PASS 或有效 WAIVED；这些自动 AC 无 FAIL/BLOCKED/NOT_RUN/STALE，且无开放 P0/P1 finding 或 scope drift；所有质量预算达标，证据可复现。人工 blocking gate 在有权角色按 rubric 签收前必须保持 pending/`NOT_RUN`，不阻断 READY，但阻断 `ACCEPTED`。
- `BLOCKED_WITH_DECISION_PACKET`：命中 Stop Conditions，包中说明具体 AC、证据、已尝试项、影响、选项与所需 Owner；不得泛称“需要更多信息”。
- `BUDGET_EXHAUSTED`：预算真实耗尽，列出剩余 AC、趋势、证据和恢复 checkpoint；不得缩小完成定义来结案。

本命令永远不得输出 `ACCEPTED` 或 `RELEASED`；它们分别属于人工验收与明确发布授权。

## Required Outputs

- 真实代码 / 测试改动及 04–07 对应阶段记录
- `features/{feature}/completion/evidence/ledger.jsonl`
- `features/{feature}/completion/run-state.yaml`
- 更新 `features/{feature}/00-工作流状态.md`
- 终态对应的 acceptance-ready / decision / budget packet
