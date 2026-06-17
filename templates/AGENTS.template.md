# Agent Workflow

本工作区使用 Agent Workflow Starter Kit 生成的共享工作流。

## 事实源

- 团队配置：`workflow/team-profile.yaml`
- Core 工作流：`workflow/core/`
- 可复用能力：`workflow/core/capabilities/`
- 工具 adapter：只作为生成的薄入口

## 硬闸门

- 功能分支闸门和实现阶段闸门通过前，不得修改业务代码。
- 远程 Git、创建分支、push、tag、merge、构建 / 部署触发、数据库写入和生产配置写入必须人工执行。
- 进入实现阶段后，同仓多需求并行必须使用独立 worktree。
- 缺失本地资料时，必须向用户索要或记录到 `workflow/INITIALIZATION_QUESTIONS.md`。

## 工具策略

只能使用当前工具自己的 adapter。不要承诺所有工具体验完全一致。

## 开始

先读取 `workflow/team-profile.yaml`，再按 `workflow/core/commands/` 执行对应阶段。
