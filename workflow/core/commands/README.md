# Core Commands

每个 command 文件都是阶段契约。adapter 可以暴露 slash command、prompt、rule 或 checklist，但必须回指本目录；命令元数据的机器事实源是 `../command-manifest.yaml`。

所有命令必须包含 `Required Structure` 与 `Exit Criteria`。默认简体中文展示，代码标识、路径、协议与官方术语保留原文。新增 / 改名命令时同步 command manifest 并运行其 validator。

## Definition-to-Done 事实源

- 完成合同：`features/{feature}/completion/contract.yaml`
- 证据账本：`features/{feature}/completion/evidence/ledger.jsonl`
- 自主运行状态：`features/{feature}/completion/run-state.yaml`
- 人类可读状态：`features/{feature}/00-工作流状态.md`

所有阶段共享稳定 `AC-###`。允许的证据状态只有 `PASS / FAIL / BLOCKED / NOT_RUN / STALE / WAIVED`；`WAIVED` 不等于 PASS。技术自动完成、人工签收、发布和商业结果分别使用 `READY_FOR_HUMAN_ACCEPTANCE`、`ACCEPTED`、`RELEASED` 与 outcome observation，不得混为一谈。

## Commands

| Command | 作用 | 授权边界 |
| --- | --- | --- |
| `/init-workspace` | 探测资料、仓库、分支模型、工具与 team-profile | 不改业务代码 |
| `/connect-toolchain` | 规划 / 连接证据工具链 | 配置写入按 execution-policy |
| `/new-feature` | 创建 feature、contract、ledger/run-state 容器 | 不改业务代码 |
| `/define-done` | 编译、lint、冻结 Completion Contract | 不授权实现 |
| `/01-需求讨论` | 目标、价值、范围、non-goals、用户、组织、假设与初始 AC | 分析 / 文档 |
| `/02-产品文档` | REQ、业务规则、质量预算、指标与 AC | 分析 / 文档 |
| `/02B-UI设计` | 可实现的 UI/UX、human factor 与 accessibility 基线 | 默认只产文档 |
| `/02C-HTML原型` | 受 tokens / components 约束的可点击原型 | 只写 feature 原型 |
| `/03-技术架构` | 数据流、异常、预算、可运营 / 回滚 / 演进与验证架构 | 冻结 contract，不实现 |
| `/03-06-研发准备` | 编排 03 + 06 设计与 PLAN_ONLY 实施 / 审查计划 | 不生成虚假 04/05/07 |
| `/04-代码实现` | Completion Contract 驱动的真实实现总览 | 通过全部实现 gate 后可改代码 |
| `/04A-前端代码实现` | 前端、状态、设计与可访问性实现 | 同 04 + 02B gate |
| `/04B-后端代码实现` | API、数据、事务、协议、异常和运营实现 | 同 04 |
| `/05-代码审查` | 独立、findings-first、反作弊与跨层审查 | 不默认修代码 |
| `/06-测试用例` | 从 AC 派生可证伪 Oracle 与可复现计划 | 不执行 / 不实现 |
| `/07-测试执行` | 真实执行并追加可失效证据 | 不自行修业务代码 |
| `/deliver-until-done` | 在明确实现授权与预算内实现—审查—验证—修复 | 不含签收 / 发布授权 |
| `/08-验收表格` | 从 contract + ledger 生成业务验收视图 | 不改标准 / 证据 |
| `/09-验收` | 有权 Owner 签收 human gates | 不等于发布 |
| `/10-培训文档` | 面向目标角色的操作、恢复和支持材料 | 文档阶段 |
| `/11-上线邮件通知` | 发布范围、授权、监控、回滚和业务观察通知 | 通知不等于部署授权 |
| `/12-复盘总结` | 定义、实现、证据、Agent 循环、组织与业务结果复盘 | 不自动修改 core |
| `/workflow-status` | 重算各 feature gate、AC 和终态 | 只读 / 状态更新 |

## 执行与分支策略

- 所有 Git、数据库、部署、生产配置和外部写操作由 `workflow/core/execution-policy.md` 四层最严格结果决定；command 不得写死 manual-only 或把仓库请求当受信授权。
- branch / integration / production / testing / release flow 只从 `workflow/team-profile.yaml#branch_model` 读取；core 不假设 `main`、`prod` 或 `test`。
- 冻结后的目标、范围、blocking AC、阈值和 human gate 只能经有权 Owner 版本化变更；Agent 只能建议。

## 相关机器契约

- `../command-manifest.yaml`：命令 ID、aliases、参数和实现 gate。
- `../capability-manifest.yaml`：能力适用条件；recommended 命中风险时自动升级 required。
- `../rules/definition-quality-catalog.yaml`：完成定义质量规则。
- `../policy-packs/`：standard 与场景风险加严包。
