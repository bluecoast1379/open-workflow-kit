# Workflow Core

`workflow/core` 是工具无关的工作流层，定义阶段、闸门、模板和可复用检查能力。它不得包含公司特定业务事实、内部仓库名、私有 URL、凭证、客户数据或某个工具的私有能力。

## Core 规则

- 同一套 core，多个工具 adapter 分层增强。
- 不承诺所有工具体验完全一致。
- 业务代码修改必须通过功能分支闸门和实现阶段闸门。
- 高风险写操作（远程 Git 刷新、创建分支、push/tag/merge、构建 / 部署触发、数据库写入、生产配置写入）按 `execution-policy.md` 分级处理：默认每次询问，agent 出命令 + 风险说明，由用户选择执行者，代执行写审计日志。
- 同仓多需求进入实现阶段后必须使用独立 worktree。
- adapter 可以增强或降级体验，但不能削弱 core 闸门。

## 目录地图

- `commands/`: 每个阶段的契约。
- `templates/`: 通用文档模板（含 api/ui-test-plan 与 prototype-page.html）。
- `capabilities/`: 可复用检查能力。
- `checklists/`: 高频事故模式的逐项检查清单。
- `execution-policy.md`: 高风险写操作的分级执行策略。
- `testing-automation-guide.md`: 接口/功能测试双轨自动化接入指引。

## 团队特化

不要为了加入团队业务事实而修改 core 文件。团队特化内容应放在：

- `workflow/team-profile.yaml`
- `features/{feature}/`
- 目标团队自己的规范和本地资料
- 工具 adapter 的薄入口
