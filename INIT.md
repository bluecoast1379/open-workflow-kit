# 初始化指南

本文说明目标团队拿到 starter kit 路径、Git 地址或发布包后，如何在自己的工作区初始化工作流。

## 推荐流程

1. 把 starter kit 放在目标产品仓库之外。
2. 打开目标产品工作区根目录。
3. 从目标根目录运行初始化器。
4. 检查生成的 `workflow/team-profile.yaml`。
5. 如果存在 `workflow/INITIALIZATION_QUESTIONS.md`，补齐缺失资料。
6. 如需调整工具列表，重新运行初始化器。

## 本地路径安装

```bash
cd /path/to/target-workspace
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --tools codex,claude,cursor
```

Shell wrapper：

```bash
cd /path/to/target-workspace
/path/to/open-workflow-kit/install.sh . --tools codex,claude,cursor
```

## package bin 安装

如果 starter kit 已作为本地 package 安装：

```bash
cd /path/to/target-workspace
agent-workflow-init --target . --tools codex,claude,cursor
```

## 非交互安装

在 agent 驱动或 CI-like 初始化中，终端无法回答问题时使用：

```bash
agent-workflow-init --target . --tools codex,claude,cursor --yes
```

缺失资料会记录到 `workflow/INITIALIZATION_QUESTIONS.md`。

## 升级已有工作区

```bash
agent-workflow-init --target . --tools codex,claude,cursor --upgrade
```

如果已有文件会被覆盖，初始化器默认写出 `.agent-workflow-new` 文件；只有显式传入 `--force` 才会覆盖。

## 安全边界

初始化器不会：

- 执行远程 Git 命令；
- 创建或切换分支；
- push 代码；
- 触发构建或部署；
- 执行数据库写入；
- 修改生产配置。

这些动作必须由用户手动执行。

## 工具别名

初始化器接受 `trea` 作为 `trae` 的别名，并写入 `.trae/instructions.md`。

## 接收方验收

正式用于需求交付前，请先确认：

- 已检查 `workflow/team-profile.yaml`；
- 如存在 `workflow/INITIALIZATION_QUESTIONS.md`，已补齐待补资料；
- 选中的工具 adapter 已生成；
- 已有文件没有被意外覆盖；
- 初始化期间没有发生远程 Git、分支、push、部署、数据库或生产配置动作。

完整验收清单见 `docs/maintainer-handoff.md`。
