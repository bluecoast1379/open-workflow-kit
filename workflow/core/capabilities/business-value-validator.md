# Capability: business-value-validator

- **Tier**: recommended（存在增长、收入、成本或效率目标时 required）
- **Stage**: `/01`, `/02`, `/08`, `/09`, `/12`
- **Purpose**: 把“为什么做”锚定到可观测的业务结果，防止技术交付被误报为商业成功。

## 输入

- Completion Contract outcome、业务模型、现状数据与埋点口径
- North Star / guardrail Owner 和观察窗口

## 输出

```yaml
result: PASS | WARN | BLOCK
metric_tree: [{objective: "...", behavior: "...", event: "...", metric: "..."}]
baseline: "..."
target: "..."
observation_window: "..."
guardrails: []
```

## 阻断规则

- 无业务目标 Owner、指标定义、baseline / target 或人工决策 rubric 时，商业验收相关 AC 阻断。
- 指标无法从事件 / 数据事实源复现，或优化 North Star 必然破坏未定义 guardrail 时阻断。
- 发布成功被直接写成商业成功时阻断签收结论。

## 反模式

- 用访问量替代价值或收入但不说明因果链。
- 上线后没有观察窗口、止损阈值和继续 / 撤回决策人。
- 只写“提升效率”，不定义谁节省了多少时间与如何测量。
