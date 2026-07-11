# Capability: observability-operability-checker

- **Tier**: recommended（有运行服务、后台任务或业务关键路径时 required）
- **Stage**: `/03`, `/04`, `/06`, `/07`, `/11`
- **Purpose**: 保证故障能被发现、定位、告警和人工处置，避免“代码能跑但无法运营”。

## 输入

- SLO / error budget、日志 / 指标 / trace、告警、dashboard、runbook
- 隐私 / 保留要求、correlation ID 和人工修复入口

## 输出

```yaml
result: PASS | WARN | BLOCK
signals: [{journey: "...", logs: true, metrics: true, trace: true, evidence: "..."}]
alerts: [{condition: "...", owner: "...", tested: true}]
runbooks: [{failure: "...", path: "...", exercised: true}]
```

## 阻断规则

- blocking 用户旅程或状态变更无可定位信号、告警 Owner 或人工恢复入口时 BLOCK。
- 日志记录秘密 / 敏感数据、指标口径不可复现或告警无路由时 BLOCK。
- 只证明埋点代码存在、未证明信号可查询 / 告警可触发时不得 PASS。

## 反模式

- “有日志”但没有 correlation、结构化字段和保留策略。
- 仪表盘存在却无人负责、无告警阈值。
- 直到事故发生才编写 runbook。
