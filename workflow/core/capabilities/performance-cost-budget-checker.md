# Capability: performance-cost-budget-checker

- **Tier**: recommended（存在 SLA、规模、资源、第三方或 LLM 成本时 required）
- **Stage**: `/02`, `/03`, `/06`, `/07`, `/12`
- **Purpose**: 用明确负载、百分位、资源和费用预算约束性能与成本取舍。

## 输入

- quality_budgets、负载模型、数据规模、benchmark 环境
- CPU / memory / battery / network、第三方 / 云 / LLM 定价与证据

## 输出

```yaml
result: PASS | WARN | BLOCK
budgets: [{metric: "p95_latency_ms", target: 0, actual: 0, load: "...", verdict: "pass"}]
costs: [{unit: "per_operation", target: 0, actual: 0, currency: "..."}]
regressions: []
```

## 阻断规则

- blocking 性能 / 成本 AC 无单位、负载、样本、环境或阈值时在定义阶段 BLOCK。
- p50 掩盖 p95/p99、平均成本掩盖长尾，或 benchmark 与目标规模不匹配时 BLOCK。
- 实测超过硬预算且无有效 waiver 时 BLOCK 自动完成。

## 反模式

- 本地单次运行代表生产容量。
- 只优化延迟而忽略内存、电量、网络或单次推理成本。
- 通过增加不可控重试“提升成功率”却不核算费用和放大效应。
