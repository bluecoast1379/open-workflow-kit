# Capability: resilience-recovery-checker

- **Tier**: recommended（有网络、异步、第三方、持久化或生产状态时 required）
- **Stage**: `/03`, `/06`, `/07`, `/11`
- **Purpose**: 验证系统在部分故障、资源耗尽和恢复过程中仍保持不变量，且爆炸半径可控。

## 输入

- data flow / state machine、依赖 SLA、RTO/RPO、恢复与回滚计划
- fault injection、load、backup / restore 和运行态证据

## 输出

```yaml
result: PASS | WARN | BLOCK
failure_modes: [{mode: "timeout", containment: "...", recovery: "...", evidence: "..."}]
rto: {target: "...", actual: "..."}
rpo: {target: "...", actual: "..."}
```

## 阻断规则

- 写操作在超时 / 重试 / 并发下可能重复、丢失或进入不可恢复中间态时 BLOCK。
- 生产状态变更无备份、恢复 / 补偿、kill switch 或爆炸半径说明时 BLOCK。
- RTO/RPO 或关键降级路径只写计划、未按合同演练却声明 PASS 时 BLOCK。

## 反模式

- 把 retry 当作完整韧性策略。
- 只验证服务重启，不验证数据和用户状态恢复。
- 故障演练无终止保护，反而扩大生产风险。
