# Capability: rule-extractor

- **Tier**: optional
- **Stage**: `/12`
- **Purpose**: 从真实复盘中提炼可进入 workflow core 的通用规则候选，让工作流持续进化。

## 为什么需要

复盘结论只有进入模板、命令、闸门或 checklist，才会影响下一次交付。但不是所有经验都适合做硬规则，必须区分项目级结论、团队级建议和通用 core 规则。

## 输入

- `memory-curator` 输出的结构化记忆
- 当前 `workflow/core/` 规则
- `workflow/team-profile.yaml`
- 用户对规则强度的确认

## 输出

```yaml
result: PASS | WARN
proposals:
  - target: core | team-profile | adapter | example | docs
    rule_type: hard_gate | checklist | template_field | guidance
    wording: "<建议规则>"
    rationale: "<为什么需要>"
    scope_limit: "<适用边界>"
    requires_human_approval: true
```

## 阻断规则

本能力不直接阻断。任何规则变更都必须由维护者确认，不能由 agent 自动把复盘经验升级为全局硬闸门。

## Adapter 示例

- **L0**: 复盘模板要求标注规则候选。
- **L1**: prompt 给出规则草案和适用范围。
- **L2**: slash command 生成待审 PR 草稿。
- **L3**: hook 检查 core 规则变更是否有复盘依据。
- **L4**: subagent 比较多次复盘，提炼稳定规则。

## 反模式

- 把公司特有流程写进通用 core。
- 缺少维护者确认就改硬闸门。
- 只增加规则，不说明触发条件和边界。
- 新规则与既有 adapter 能力不兼容。
