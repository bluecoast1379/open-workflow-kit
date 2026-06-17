# Capability: worktree-isolator

- **Tier**: recommended
- **Stage**: `/04`, `/04A`, `/04B`
- **Purpose**: 同一仓库多个需求并行实现时，强制一个需求一个 worktree，避免改动混在同一工作目录。

## 为什么需要

同仓多需求在一个目录里反复切分支，最容易产生未保存改动、暂存区残留、错分支提交和同文件冲突。进入实现阶段后必须用物理目录隔离。

## 输入

- 活跃开发登记表，例如 `features/00-active-branches.md`
- 当前需求、受影响仓库、功能分支和 worktree 路径
- 当前 `pwd`、分支、dirty 状态
- 本次影响文件清单

## 输出

```yaml
result: PASS | WARN | BLOCK
repo: "<repo>"
current_worktree: "<path>"
registered_worktree: "<path>"
same_repo_active_features:
  - feature: "<feature>"
    branch: "<branch>"
    files: ["..."]
conflicts:
  - type: same_file | same_sql | same_method | same_business_rule
    detail: "..."
```

## 阻断规则

- 同仓已有其他活跃 04 阶段需求，且当前需求未使用独立 worktree 时阻断。
- 两个活跃需求改同一文件、SQL、方法或业务口径时，默认阻断后进入实现的需求。
- agent 不得自动创建开发分支；worktree 创建也必须先由用户确认已有本地功能分支。

## Adapter 示例

- **L0**: 在 `AGENTS.md` 写明同仓并行策略。
- **L1**: prompt 要求用户确认 worktree 路径。
- **L2**: slash command 读取活跃登记表并输出准入结论。
- **L3**: 写入前 hook 检查当前目录是否为登记 worktree。
- **L4**: subagent 维护活跃需求冲突矩阵。

## 反模式

- 在一个目录里切两个功能分支同时开发。
- 只按分支名判断隔离完成，不检查 `pwd`。
- 同文件不同区域也默认并行。
- 把 integration 分支当正式开发分支。
