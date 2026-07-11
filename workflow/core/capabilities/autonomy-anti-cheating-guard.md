# Capability: autonomy-anti-cheating-guard

- **Tier**: essential
- **Stage**: `/04`, `/05`, `/07`, `/deliver-until-done`
- **Purpose**: 约束 Agent 只能修复实现，不能通过修改完成定义、测试或证据来制造“通过”。

## 输入

- 冻结 Completion Contract、测试 / evaluator diff、scope 与 allowed paths
- 迭代历史、Evidence Ledger、waiver 与预算

## 输出

```yaml
result: PASS | WARN | BLOCK
contract_drift: []
test_weakening: []
scope_drift: []
evidence_anomalies: []
budget: {iterations: 0, elapsed: 0, cost: 0, diff_lines: 0}
```

## 阻断规则

- 未获批准修改 blocking、阈值、Oracle、human gate、non-goal 或 invariant 时 BLOCK。
- 删除 / skip 失败测试、扩大 mock、硬编码 fixture、只改测试迎合错误实现或将 NOT_RUN/STALE/WAIVED 计为 PASS 时 BLOCK。
- 超出 allowed paths / budget、静默扩大范围、隐藏失败或覆盖 Evidence Ledger 历史时 BLOCK。
- 同一失败指纹达到阈值或连续两轮无收敛时必须停止并输出 decision packet。

## 反模式

- 测试绿了就假设修复正确，不检查测试是否被弱化。
- 为避免阻断把 AC 从 blocking 改成 optional。
- 在摘要中省略失败 / 未运行项。
