# Capability: ui-baseline-reviewer

- **Tier**: optional
- **Stage**: `/02`, `/04A`, `/05`
- **Purpose**: 检查 UI 实现是否符合设计基线、前端规范，以及展示、校验、提交和后端表示的一致性。

## 为什么需要

UI 问题常发生在“页面能打开”之后：字段展示不一致、回显缺失、校验口径不同、按钮状态不全、移动端溢出或与后端枚举不一致。需要把设计基线和真实实现放在一起审查。

## 输入

- `workflow/team-profile.yaml#source_materials.ui_specs`
- `workflow/team-profile.yaml#source_materials.frontend_rules`
- UI 相关 diff、截图或运行页面
- API / DTO / 枚举等后端契约

## 输出

```yaml
result: PASS | WARN | BLOCK
ui_checks:
  - surface: "<页面或组件>"
    baseline: "<设计或规范来源>"
    implementation: "<file:line 或截图>"
    verdict: pass | warn | block
gaps:
  - "<缺少设计、截图或后端契约证据>"
```

## 阻断规则

- 需求涉及 UI 但没有设计基线、页面参考或待确认说明时阻断产品文档完成。
- 展示、校验、提交字段与后端契约不一致时阻断实现完成。
- 未验证移动端 / 小屏 / 长文本等关键布局风险时降级为 WARN。

## Adapter 示例

- **L0**: PRD 和前端实现文档固定 UI 基线字段。
- **L1**: prompt 要求提供设计来源和截图。
- **L2**: slash command 生成 UI 审查清单。
- **L3**: hook 检查 UI 阶段是否有截图或阻塞说明。
- **L4**: subagent 专门做 UI 和契约一致性审查。

## 反模式

- 没有设计依据就臆造页面。
- 只看页面截图，不查提交字段。
- 忽略错误态、空态、加载态和权限态。
- 移动端文本溢出但未记录。
