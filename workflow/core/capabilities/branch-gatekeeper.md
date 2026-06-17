# Capability: branch-gatekeeper

- **Tier**: essential
- **Stage**: `/04`, `/04A`, `/04B`
- **Purpose**: 在业务代码写入前确认功能分支闸门和实现阶段闸门，防止代码落到错误基线。

## 为什么需要

分支漂移和阶段漂移是代码管理失控的高频来源。实现必须同时满足：当前请求已进入实现阶段，且每个受影响仓库都在本需求功能分支或登记 worktree 中。

## 输入

- `workflow/team-profile.yaml#branch_model`
- 每个受影响仓库的当前分支
- 用户请求和 `features/{feature}/00-工作流状态.md` 中的当前阶段
- 功能名称和前序阶段文档

## 输出

```yaml
result: PASS | WARN | BLOCK
checks:
  - name: stage_gate
    status: pass | block
    detail: "..."
  - name: branch_gate_per_repo
    status: pass | block
    repos:
      - path: "<repo>"
        branch: "<current branch>"
        verdict: pass | block
        reason: "..."
blocked_reason: "..."
recommended_action: "请按 team-profile 中的分支规则准备功能分支。"
```

## 阻断规则

- 当前不是 `/04`、`/04A`、`/04B`，但 agent 将要修改业务源码、配置、SQL、迁移或部署文件时阻断。
- 任一受影响仓库位于生产、集成、历史、不明或无关分支时阻断。
- 功能分支不符合 `branch_model.feature_branch_rule` 时阻断。
- 无 Git 元数据时降级为 WARN，并要求用户明确确认本地快照风险后才能继续。

## Adapter 示例

- **L0**: 在 `AGENTS.md` 中写明闸门规则。
- **L1**: prompt 要求用户粘贴当前分支输出。
- **L2**: slash command 运行仓级分支检查并输出结论。
- **L3**: 写入前 hook 发现分支不合规时中断。
- **L4**: 独立 subagent 负责执行准入检查并返回结构化结果。

## 反模式

- 因为目录名看起来正确就跳过分支检查。
- 认为“小改动”可以绕过 04 阶段。
- 在 `main`、`prod`、`test` 或 integration 分支上直接修代码。
- 两个需求混用同一个功能分支。
