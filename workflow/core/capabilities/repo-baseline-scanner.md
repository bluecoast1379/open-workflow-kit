# Capability: repo-baseline-scanner

- **Tier**: recommended
- **Stage**: `/03`，也可在会话开始时运行
- **Purpose**: 记录每个受影响仓库的真实本地基线，避免把当前工作树误写成生产事实。

## 为什么需要

多仓工作区里，不同仓库可能处于不同分支、dirty 状态或本地快照。架构和审查文档必须写清事实来源：生产基线、当前分支、用户手动刷新后的远端引用，还是本地缓存。

## 输入

- 受影响仓库列表
- 当前分支、dirty 文件、Git 元数据状态
- team-profile 中的生产分支、集成分支和功能分支规则
- 用户是否已手动刷新远端引用

## 输出

```yaml
result: PASS | WARN
repos:
  - path: "<repo>"
    git: yes | no
    branch: "<branch>"
    dirty: true | false
    baseline_source: production_ref | current_branch | local_snapshot | cached_remote_ref
    caveat: "..."
```

## 阻断规则

本能力通常不直接阻断，但会为分支闸门、发布核查和线上排查提供事实来源。未经用户手动刷新确认的远端引用，不得写成“已确认最新线上事实”。

## Adapter 示例

- **L0**: 在 `/03` 模板固定仓库基线表。
- **L1**: prompt 要求记录分支和 dirty 状态。
- **L2**: slash command 生成仓级扫描表。
- **L3**: hook 阻止缺少基线表时关闭 `/03`。
- **L4**: subagent 维护多仓基线摘要。

## 反模式

- 默认当前工作树就是生产事实。
- 没有 Git 元数据还写“prod 已核查”。
- 只记录主仓，不记录配套前端、脚本或发布资产仓。
- 远端未刷新却声称引用最新。
