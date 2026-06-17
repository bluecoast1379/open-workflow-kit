# Capability: prd-code-diff-checker

- **Tier**: essential
- **Stage**: `/04`, `/04A`, `/04B`, `/05`
- **Purpose**: 对比 PRD、技术方案和真实 diff，确保“文档说要做的”和“代码实际改的”一致。

## 为什么需要

只看 diff 容易漏掉产品目标，只看 PRD 又容易忽略实际代码越界。实现结束和审查阶段必须双向核对：需求项是否都有代码落点，代码改动是否都有需求或技术依据。

## 输入

- `02-产品文档.md`
- `03-技术架构.md`
- `04/04A/04B` 实现记录
- 真实 Git diff 或用户提供的变更清单
- 测试和验证结果

## 输出

```yaml
result: PASS | WARN | BLOCK
requirements:
  - id: "<PRD item>"
    expected: "<预期行为>"
    implementation: "<file:line 或 diff 摘要>"
    verdict: covered | partial | missing
extra_diffs:
  - file: "<file>"
    reason: "<为何不在 PRD 范围内>"
blocked_reason: "..."
```

## 阻断规则

- P0/P1 需求项没有实现落点且无明确延期说明时阻断。
- 真实 diff 包含 PRD 和技术方案均未覆盖的业务行为变更时阻断。
- 测试只覆盖新增代码但不覆盖需求验收口径时降级为 WARN 或 BLOCK。

## Adapter 示例

- **L0**: 审查模板固定 PRD-diff 对照表。
- **L1**: prompt 要求逐项列出需求、文件和验证。
- **L2**: slash command 生成对照表草稿。
- **L3**: hook 检查 05 文档是否记录 diff 覆盖结果。
- **L4**: subagent 独立做 PRD 和 diff 的双向比对。

## 反模式

- 只审 diff，不回看 PRD。
- 只复述 PRD，不读取真实改动。
- 把“代码能跑”当成“需求已覆盖”。
- 对额外改动不解释来源。
