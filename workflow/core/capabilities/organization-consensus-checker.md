# Capability: organization-consensus-checker

- **Tier**: recommended（跨团队、外部审批或多人签收时 required）
- **Stage**: `/01`, `/02`, `/03`, `/09`
- **Purpose**: 显式定义 DRI、决策权、依赖和签收边界，避免 Agent 在组织缝隙中假设共识。

## 输入

- team-profile organization、Completion Contract organization
- 依赖、审批、评审、SLA 与 decision log

## 输出

```yaml
result: PASS | WARN | BLOCK
roles: [{scope: "...", dri: "...", decision_owner: "...", reviewers: []}]
dependencies: [{owner: "...", sla: "...", status: "..."}]
decisions: [{id: "DEC-001", status: "open | approved | rejected"}]
```

## 阻断规则

- blocking 决策、依赖或 human gate 无有权 Owner 时 BLOCK。
- 多方对同一范围、阈值或责任存在冲突而未记录升级路径时 BLOCK。
- Agent 代替业务、设计、安全、合规或发布 Owner 签收时 BLOCK。

## 反模式

- 把“已告知”当“已同意”。
- 只记录参与者，不记录谁有最终决策权。
- 豁免永久有效且无批准人或到期日。
