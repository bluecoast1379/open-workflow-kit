# 工作流状态

## 功能与契约

| 项 | 内容 |
| --- | --- |
| 功能名称 | 待填写 |
| 当前阶段 | 待填写 |
| 当前状态 | 待开始 / 进行中 / 阻塞 / 自动验收就绪 / 已签收 |
| Completion Contract | `completion/contract.yaml`；版本 / hash 待填写 |
| Source fingerprint | branch / commit / dirty 状态待填写 |
| Environment fingerprint | 待填写；未执行验证时为 `NOT_RUN` |
| 展示语言 | 简体中文优先；专有名词、命令、路径、分支名、API、SDK、框架和官方英文术语保留原文 |
| 影响仓库 | 从 `workflow/team-profile.yaml#repos` 与 Completion Contract 读取 |
| 分支模型 | 从 `workflow/team-profile.yaml#branch_model` 读取；不得在状态模板硬编码分支名 |
| 当前开发分支 / worktree | 待填写 |
| 分支基线 | 待填写 |
| 实现准入 | 未进入实现 / 已通过 / 阻塞 |
| 同仓并行 | 无 / 已隔离 / 冲突阻塞 |
| 发布与回滚 | 未定义 / 已定义 / 已演练 / 阻塞 |

## Definition of Done

| 项 | 数量 / 状态 | 说明 |
| --- | --- | --- |
| Blocking AC 总数 | 0 | 待填写 |
| PASS | 0 | 当前 contract/source/environment 上有效 |
| FAIL | 0 | 必须闭环 |
| BLOCKED | 0 | 必须附 decision packet |
| NOT_RUN | 0 | 不得计入完成 |
| STALE | 0 | 代码、契约、数据或环境改变后需重跑 |
| WAIVED | 0 | 必须有批准人、范围、理由和到期日；不等于 PASS |
| P0 / P1 开放 finding | 0 | 非零时阻断自动验收就绪 |
| Scope drift | 0 | 非零时阻断并重新确认范围 |
| Automation result | `NOT_READY` | `NOT_READY / READY_FOR_HUMAN_ACCEPTANCE / BLOCKED_WITH_DECISION_PACKET / BUDGET_EXHAUSTED` |
| Human acceptance | `PENDING` | `PENDING / ACCEPTED / REJECTED` |

## 阶段记录

| 阶段 | 状态 | 契约 / 证据 | Exit Criteria | 备注 |
| --- | --- | --- | --- | --- |
| define-done | 待开始 | - | 未核查 | 建立并 lint Completion Contract |
| 01-需求讨论 | 待开始 | - | 未核查 | - |
| 02-产品文档 | 待开始 | - | 未核查 | - |
| 02B-UI设计 | 待开始 | - | 未核查 | 有 UI/前端工作时必须在 04A 前完成或记录明确豁免 |
| 03-技术架构 | 待开始 | - | 未核查 | 冻结实现基线与质量预算 |
| 04-代码实现 | 未授权 | - | 未核查 | 需分支闸门和阶段闸门通过 |
| 05-代码审查 | 待开始 | - | 未核查 | - |
| 06-测试用例 | 待开始 | - | 未核查 | 每个 blocking AC 必须有 Oracle |
| 07-测试执行 | 待开始 | - | 未核查 | 证据绑定 contract/source/environment；完成聚合另绑定 findings snapshot |
| 08-验收表格 | 待开始 | - | 未核查 | 从 AC 与 Evidence Ledger 生成 |
| 09-验收 | 待开始 | - | 未核查 | 只处理 human gates 与签收结论 |
| 10-培训文档 | 待开始 | - | 未核查 | - |
| 11-上线邮件通知 | 待开始 | - | 未核查 | - |
| 12-复盘总结 | 待开始 | - | 未核查 | 含上线后业务学习 |

## 未决事项与证据新鲜度

| ID | 类型 | 内容 | Owner | 截止时间 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 待填写 | assumption / decision / dependency / evidence | 待填写 | 待填写 | 待填写 | OPEN |

## 下一允许动作

- 仅记录由当前闸门与执行策略允许的下一动作；不得把需要用户或外部授权的动作写成已授权。
