# Capability: ai-quality-evaluator

- **Tier**: recommended（产品行为依赖模型、prompt、检索或 agent tool use 时 required）
- **Stage**: `/02`, `/03`, `/06`, `/07`, `/12`
- **Purpose**: 用版本化数据集和分布指标评价 AI 非确定性、幻觉、安全、方差、回退与成本。

## 输入

- model / prompt / retrieval / tool 版本与参数
- 黄金集、评分 rubric / evaluator、风险切片、重复运行计划
- 质量、安全、延迟和成本预算

## 输出

```yaml
result: PASS | WARN | BLOCK
evaluation_fingerprint: "..."
slices: [{name: "...", samples: 0, quality: 0, hallucination_rate: 0, refusal_rate: 0}]
variance: "..."
cost_per_case: 0
fallback: {tested: true, evidence: "..."}
```

## 阻断规则

- 无固定数据集、版本指纹、样本量、重复次数或评分规则时，AI blocking AC 无法 PASS。
- 只报告平均分、不报告关键风险切片、失败分布或方差时 BLOCK。
- 幻觉 / 安全拒绝 / 工具越权 / 成本超过硬预算，或回退未验证时 BLOCK。

## 反模式

- 用几个精心挑选的 prompt 演示替代评测。
- 模型更新后沿用旧证据。
- 让同一模型自由判断自己的回答且没有校准或人工抽样。
