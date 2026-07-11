# Capability: reversibility-evolution-checker

- **Tier**: recommended（有数据、公开契约、依赖升级或发布时 required）
- **Stage**: `/02`, `/03`, `/05`, `/07`, `/11`, `/12`
- **Purpose**: 验证功能可灰度、可撤回、可迁移、可兼容、可安全下线。

## 输入

- feature flag / rollout、API/schema 兼容、迁移、备份 / 恢复、下线计划
- release diff、consumer inventory 和演练证据

## 输出

```yaml
result: PASS | WARN | BLOCK
controls: [{type: "flag | kill-switch | rollback | migration", owner: "...", evidence: "..."}]
compatibility: [{consumer: "...", window: "...", verdict: "..."}]
decommission: {trigger: "...", data_disposition: "..."}
```

## 阻断规则

- 不可逆数据 / schema / 权限变更无备份、forward fix、兼容窗口和明确批准时 BLOCK。
- 删除 / 重命名公开契约但未盘点消费者与发布顺序时 BLOCK。
- 声称可回滚却没有绑定 release/source 的真实演练证据时 BLOCK。

## 反模式

- 回滚只还原代码，不处理已写数据。
- feature flag 永久存在且无清理 Owner。
- 只定义如何上线，不定义如何迁移用户和删除依赖。
