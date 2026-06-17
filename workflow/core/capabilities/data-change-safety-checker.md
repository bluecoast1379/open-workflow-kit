# Capability: data-change-safety-checker

- **Tier**: recommended
- **Stage**: `/03`, `/05`, `/07`
- **Purpose**: 管理 DDL、DML、数据修复和迁移脚本的交付位置、预检查、后检查、幂等性和回滚口径。

## 为什么需要

数据变更一旦混在业务源码目录或缺少执行前后校验，容易在发布时丢失、重复执行或影响错误数据。工作流需要把数据变更当作独立交付资产管理，而不是临时 SQL 片段。

## 输入

- 需求的数据影响说明
- 数据库 / 表 / 字段 / 索引 / 初始化数据变更清单
- 目标团队定义的 release artifact 目录或数据库变更流程
- 执行前查询、执行后校验和回滚策略

## 输出

```yaml
result: PASS | WARN | BLOCK
data_changes:
  - type: DDL | DML | migration | repair
    asset_path: "<交付脚本路径>"
    target_scope: "<目标库表或数据范围>"
    precheck: "<执行前检查>"
    postcheck: "<执行后验证>"
    idempotency: "<可重复执行风险>"
    rollback: "<回滚口径>"
```

## 阻断规则

- 数据脚本放在业务源码目录且 team-profile 未授权该位置时，阻断交付。
- 缺少执行前范围确认、执行后验证或回滚说明时，阻断上线结论。
- DML / 数据修复只依据估算行数时，必须补同条件 `COUNT` 或等价核查；否则降级为 WARN 或 BLOCK。
- 只检查数据库列类型、不检查应用实体 / 映射类型时，不能关闭类型兼容风险。

## Adapter 示例

- **L0**: 在架构和审查模板中固定数据变更表。
- **L1**: prompt 要求补齐 precheck、postcheck、rollback。
- **L2**: slash command 扫描 diff 中的 SQL / migration 文件并生成清单。
- **L3**: hook 阻止未登记的数据脚本进入完成状态。
- **L4**: subagent 专门做数据变更安全审查。

## 反模式

- 把 SQL 临时放进业务仓根目录。
- 没有目标范围就执行数据修复。
- 只写“可回滚”，没有回滚 SQL 或业务口径。
- 用构建通过替代数据兼容验证。
