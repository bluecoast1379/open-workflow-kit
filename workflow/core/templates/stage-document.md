# 阶段文档模板

## 结论

- 阶段结论：`PASS | BLOCKED | NOT_APPLICABLE`
- 一句话理由：待填写
- Completion Contract 版本：待填写
- 当前代码 / 数据 / 环境指纹：待填写；不适用时说明原因

## 语言与展示

- 默认使用简体中文展示；专有名词、产品名、品牌名、代码标识符、命令、文件路径、分支名、API、SDK、框架、协议、标准、错误信息和官方英文术语保留原文。
- 不做无意义的中英双语重复；只有对外材料、多语言产品文案、合同/合规引用、用户明确要求翻译或目标市场需要时，才输出对应语言版本。

## 输入来源

| 来源 | 路径或证据 | 版本 / 指纹 | 状态 |
| --- | --- | --- | --- |
| team-profile | `workflow/team-profile.yaml` | 待填写 | 待核查 |
| Completion Contract | `features/{feature}/completion/contract.yaml` | 待填写 | 待核查 |
| 前序文档 | 工作区级 `features/{feature}/` | 待填写 | 待核查 |
| 本地代码 | 待填写 | branch / commit / dirty 状态 | 待核查 |
| 设计 / 规范 / 测试资料 | 待填写 | 待填写 | 待核查 |

## 事实、假设与决策

### 已确认事实

| ID | 事实 | 来源 | 验证时间 |
| --- | --- | --- | --- |
| `FACT-001` | 待填写 | 待填写 | 待填写 |

### 假设与不确定性

| ID | 假设 / 未知项 | 影响 | 验证方式 | Owner | 截止 / 失效时间 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `ASM-001` | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | OPEN |

### 决策记录

| ID | 决策 | 备选方案 | 理由 | 决策者 | 日期 | 触发重审条件 |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-001` | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |

## 范围与保护边界

- In scope：待填写
- Non-goals：待填写
- 允许修改的仓库 / 路径：从 `workflow/team-profile.yaml` 与 Completion Contract 读取，不在模板中假设具体仓库或分支。
- 禁止修改的路径 / 公共契约 / 数据：待填写
- 必须保持的不变量：待填写
- 依赖与组织边界（DRI、决策者、评审者、外部 Owner、响应 SLA）：待填写

## 验收条件追踪

每条可交付行为必须引用 Completion Contract 中稳定的 `AC-###`。阶段文档不得另造一套无关联的验收口径。

| AC ID | 本阶段贡献 | Oracle | 证据要求 | 当前状态 | 阻塞 / 备注 |
| --- | --- | --- | --- | --- | --- |
| `AC-001` | 待填写 | command / api / browser / metric / manual | 待填写 | `NOT_RUN` | 待填写 |

允许的证据状态只有 `PASS`、`FAIL`、`BLOCKED`、`NOT_RUN`、`STALE`、`WAIVED`。`WAIVED` 不是 `PASS`，必须记录批准人、理由、范围和到期日。

## 风险与质量预算

| 维度 | 约束 / 阈值 | 验证方式 | 状态 |
| --- | --- | --- | --- |
| Business value | 待填写 | 指标 / 人工决策 | 待核查 |
| UX / Accessibility | 待填写 | 任务指标 / 浏览器 / 人工 rubric | 待核查 |
| Performance / Cost | 待填写 | benchmark / 预算检查 | 待核查 |
| Reliability / Resilience | 待填写 | 故障注入 / 恢复演练 | 待核查 |
| Security / Privacy / Compliance | 待填写 | 扫描 / 人工审查 | 待核查 |
| Observability / Operability | 待填写 | 日志 / 指标 / 告警 / runbook | 待核查 |
| Reversibility / Evolution | 待填写 | flag / rollback / migration / compatibility | 待核查 |
| AI quality（如适用） | 待填写 | 固定评测集 / 分布指标 / 成本 | 待核查 |

## 执行边界

- 所有 Git、数据库、部署、生产配置和外部系统动作按 `workflow/core/execution-policy.md` 与 `workflow/team-profile.yaml#execution_policy` 取最严格值执行。
- 分支模型、基线分支、发布流和 worktree 规则只从 `workflow/team-profile.yaml#branch_model` 读取；core 不假设 `main`、`prod` 或任何个人分支命名。
- 未通过实现准入，不修改业务代码、配置、脚本、迁移或部署文件。
- 工作流文档保存在工作区级 `features/{feature}/`；只有 team-profile 或发布契约明确列为公开交付物的材料才进入目标代码仓库。
- Agent 可以建议变更 Completion Contract，但不得为使测试变绿而自行降低阈值、删除失败用例、扩大豁免或把未运行项记为通过。

## Required Structure

- 本模板全部章节均需保留；不适用项写明 `N/A` 及理由，不得静默删除。
- 产物必须引用同一组 `AC-###`、REQ / RISK / DEC / ASM ID，并维护从需求到证据的可追溯关系。
- 任何结论都必须区分已验证事实、设计意图、假设和缺失证据。

## Exit Criteria

- Required Structure 完整，无未解释的占位符。
- 所有本阶段 blocking 项为 `PASS` 或具有合规且未过期的 `WAIVED`；存在 `FAIL`、`BLOCKED`、`NOT_RUN`、`STALE` 时不得标记完成。
- 阶段结论、Completion Contract、`00-工作流状态.md` 与 Evidence Ledger（如已产生证据）一致。
- 不能执行的验证被明确标为 `BLOCKED` 或 `NOT_RUN`，没有把计划、静态检查或“未发现问题”冒充执行证据。

## 输出

- 本阶段文档：待填写
- 更新 `features/{feature}/00-工作流状态.md`。
- 更新 Completion Contract / Evidence Ledger：待填写；不适用时说明原因。
- 待确认项、证据缺口和下一决策点：待填写
