# 可分享安装方式

本文面向拿到 workflow 地址或发布归档的接收团队。

## 从本地 tarball 安装

```bash
cd /path/to/target-workspace
npm install /path/to/agent-workflow-starter-kit-<version>.tgz --save-dev
npx agent-workflow-init --target . --tools codex,claude,cursor --yes
```

## 从 Git 地址安装

```bash
cd /path/to/target-workspace
npm install git+https://github.com/bluecoast1379/open-workflow-kit.git --save-dev
npx agent-workflow-init --target . --tools codex,claude,cursor --yes
```

如果使用 fork 或私有 mirror，请替换 URL。初始化器只在本地工作区运行。

## 从 package registry 安装

```bash
cd /path/to/target-workspace
npm install agent-workflow-starter-kit --save-dev
npx agent-workflow-init --target . --tools codex,claude,cursor --yes
```

## 会生成什么

- `workflow/team-profile.yaml`
- `workflow/core/`
- `workflow/adapters/`
- `workflow/INSTALL_REPORT.md`
- 必要资料缺失时生成 `workflow/INITIALIZATION_QUESTIONS.md`
- 选中工具的薄入口，例如 `AGENTS.md`、`CLAUDE.md`、`.cursor/commands/`

## 安全边界

初始化器不会拉取远程代码、创建分支、push 代码、触发构建、部署、写数据库或修改生产配置。它只读取本地文件，并把工作流文件写入目标工作区。

## 验收

安装后按 [维护者交接](./maintainer-handoff.md) 的接收方清单检查。关键点是确认 `workflow/team-profile.yaml`、`workflow/core/` 和选中工具 adapter 已生成；缺失本地资料会记录在 `workflow/INITIALIZATION_QUESTIONS.md`。
