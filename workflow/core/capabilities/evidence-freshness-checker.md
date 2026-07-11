# Capability: evidence-freshness-checker

- **Tier**: essential
- **Stage**: `/07`, `/08`, `/09`, `/deliver-until-done`
- **Purpose**: 确保证据绑定具体 contract、source、environment、dataset 和 executor，变化后自动失效而非沿用旧绿灯。

## 输入

- Completion Contract、Evidence Ledger、run-state
- 当前 contract/source/environment/dataset/tool/model fingerprint

## 输出

```yaml
result: PASS | WARN | BLOCK
current_fingerprint: "..."
evidence: [{ac_id: "AC-001", status: "PASS | STALE", reason: "..."}]
invalidated: []
```

## 阻断规则

- PASS 缺 contract hash、source/environment fingerprint、时间、Oracle / command hash 或 artifact hash 时 BLOCK。
- contract、代码、依赖、环境、数据集、模型 / prompt 变化后，受影响证据未标 STALE 时 BLOCK。
- Evidence Ledger 被覆盖 / 回写历史、或不同 fingerprint 的结果被混合聚合时 BLOCK。

## 反模式

- “上周测过”但没有对应 commit。
- 截图 / 日志文件可被替换且没有 hash。
- 更新合同后只重跑最方便的一部分用例。
