# 初始化指南

本文说明目标团队拿到 starter kit 路径、Git 地址或发布包后，如何在自己的工作区初始化工作流。

## 推荐流程

1. 把 starter kit 放在目标产品仓库之外。
2. 打开目标产品工作区根目录。
3. 从目标根目录运行初始化器。
4. 检查可提交的 `workflow/team-profile.yaml`，将本地绝对路径、私有端点和凭证变量映射填入被忽略的 `workflow/local/team-profile.local.yaml`。若团队需要审计级规则溯源，同时在被忽略的 `workflow/local/rule-provenance.private.yaml` 中补齐原始来源与 SHA-256 指纹。
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

如果已有文件会被覆盖，初始化器默认写出 `.agent-workflow-new` 文件；只有显式传入 `--force` 才会覆盖。例外：`workflow/team-profile.yaml` 是团队手工维护的契约，在 `--upgrade` 模式下永不原地覆盖（即使 `--force`），新版内容始终写入 `.agent-workflow-new` 供人工比对合并。

`--upgrade` 还会自动清理历史版本生成、当前版本已不再使用的残留：`.codex/prompts/`、`.kiro/instructions.md`、`.codebuddy/instructions.md`、`.codebuddy/rules/agent-workflow/RULE.mdc` 和旧 `workflow/core/checklists/rule-catalog.yaml`。仅当文件内容匹配 kit 生成指纹或明确旧 catalog 标记时才删除；用户自定义内容保留并提示手动确认。`--dry-run` 会列出清理计划但不删除。

schema 1.1 升级到 1.2 时，旧 profile 不会被覆盖；请将 `.agent-workflow-new` 中的 `requested_*`、外部受信策略和本地审计路径人工合并到现有 profile。

## 安全边界

初始化器不会：

- 执行远程 Git 命令；
- 创建或切换分支；
- push 代码；
- 触发构建或部署；
- 执行数据库写入；
- 修改生产配置。

上述约束描述的是**初始化器本身**：它在任何参数下都不得执行这些动作。初始化完成后，agent 的其他运行时写操作由 `workflow/core/execution-policy.md` 的 core 硬上限、仓库外受信策略、仓库请求和当次用户授权共同决定，取最严值。

此外，仓库内 `team-profile.yaml` 不能作为高危 auto 的唯一信任源。详细规则见 `workflow/core/execution-policy.md`；外部受信策略模板见 `workflow/core/templates/trusted-execution-policy.template.yaml`。

## 工具别名

初始化器接受 `trea` 作为 `trae` 的别名，并写入 `.trae/instructions.md`。

## 接收方验收

正式用于需求交付前，请先确认：

- 已检查 `workflow/team-profile.yaml`；
- `workflow/local/` 已被 Git 忽略，本地 profile、私有规则 provenance、凭证与原始执行日志未被跟踪；
- 如存在 `workflow/INITIALIZATION_QUESTIONS.md`，已补齐待补资料；
- 选中的工具 adapter 已生成；
- 已有文件没有被意外覆盖；
- 初始化期间没有发生远程 Git、分支、push、部署、数据库或生产配置动作。

完整验收清单见 `docs/maintainer-handoff.md`。
