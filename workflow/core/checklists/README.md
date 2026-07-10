# Checklists

Checklist 是能力（capabilities）的逐项执行版：capability 定义"检查什么、何时阻断"，checklist 把高频事故模式展开成可逐条打勾的清单。全部条目来自真实交付复盘的脱敏提炼，不含任何公司特化内容。

## 清单目录

| 清单 | 适用场景 | 挂接阶段 | 关联能力 |
| --- | --- | --- | --- |
| [validation-change-review](./validation-change-review.md) | 放开/收紧任何字段校验或业务不变式 | `/04`, `/05` | impact-scope-analyzer, prd-code-diff-checker |
| [data-consistency-review](./data-consistency-review.md) | 统计口径、时间列、导出、手工 SQL、数据补录 | `/03`, `/05`, `/07` | data-change-safety-checker, contract-tracer |
| [branch-hygiene](./branch-hygiene.md) | 分支流向、发布候选溯源、污染补救、合并卫生 | `/04`, `/05`, `/11` | branch-gatekeeper, release-safety-checker |
| [test-blind-spots](./test-blind-spots.md) | 测试用例设计与独立复审 | `/05`, `/06`, `/07` | test-evidence-reviewer |
| [third-party-integration-review](./third-party-integration-review.md) | 第三方接口、异步回调、消息消费、变更扇出 | `/03`, `/05`, `/07` | protocol-state-machine-checker, contract-tracer |
| [language-pitfalls-java](./language-pitfalls-java.md) | Java 技术栈的语言级陷阱专项 | `/05` | security-reviewer |

## 条目 ID

每个勾选项都有稳定 ID（VCR/DCR/BH/TBS/TIR/LPJ + 两位序号）。审查、测试与复盘文档记录"命中 / 不适用 / 未核查原因"时**按 ID 引用**（如 `BH-03 命中，见 xx 文件`），保证跨文档可追溯；ID 一经发布不复用、不重排，新增条目只追加编号。

37 条上位规则的唯一公开事实源是 [`../rules/rule-catalog.yaml`](../rules/rule-catalog.yaml)。它将 `OWK-RULE-001..037` 映射到所有 79 个 item；`npm run check:rules` 会阻断孤儿、重复归属或断链证据。

## 使用规则

- 阶段命令引用清单时，逐条核对并在阶段文档记录"命中 / 不适用 / 未核查原因"，不允许整单跳过且不留痕。
- 清单条目与能力阻断规则冲突时，以能力阻断规则为准。
- 团队特化条目请加在 `workflow/team-profile.yaml` 或团队自己的补充清单里，不要改写通用清单原文。
