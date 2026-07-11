# 初始化指南

本文说明如何把 Open Workflow Kit 1.0 安装到目标工作区。初始化只负责扫描本地资料、生成 workflow core、team profile 和选中平台的项目级 adapter；它不授权实现、远程 Git、部署或生产写入。

## 推荐流程

1. 将 kit checkout 或安装在目标产品工作区之外。
2. 在目标工作区根目录运行初始化器。
3. 检查 `workflow/team-profile.yaml`，把绝对路径、私有端点和凭证变量映射放入被忽略的 `workflow/local/team-profile.local.yaml`。
4. 如存在 `workflow/INITIALIZATION_QUESTIONS.md`，补齐缺失资料。
5. 检查 `workflow/TOOLCHAIN_MCP_PLAN.md`，只连接当前明确需要且已授权的工具槽位。
6. 用 `/new-feature` 创建 feature，再用 `/define-done` 冻结 Completion Contract；Contract 通过 lint 之前不得进入自主实现。

## 从相邻源码目录初始化

```bash
node ../open-workflow-kit/bin/init-workspace.cjs \
  --target . \
  --tools codex,claude,cursor,copilot,codebuddy,kiro,trae
```

Shell wrapper：

```bash
../open-workflow-kit/install.sh . --tools codex,claude,cursor
```

## 从 package bin 初始化

```bash
agent-workflow-init --target . --tools codex,claude,cursor
```

非交互环境：

```bash
agent-workflow-init --target . --tools codex,claude,cursor --yes
```

缺失资料会写入 `workflow/INITIALIZATION_QUESTIONS.md`，不会被猜测性默认值静默掩盖。

## 升级已有工作区

```bash
agent-workflow-init --target . --tools codex,claude,cursor --upgrade
```

升级规则：

- 默认不覆盖已有文件；冲突内容写入 `.agent-workflow-new`。
- 只有显式 `--force` 才覆盖一般生成文件。
- `workflow/team-profile.yaml` 是团队维护的共享契约，即使 `--force` 也不会原地覆盖。
- 旧版生成文件仅在内容匹配 kit 指纹时自动清理；用户自定义内容保留并提示人工处理。
- `--dry-run` 只列出写入、清理与冲突计划。

升级后必须重新执行 contract、command manifest、adapter 和安装 smoke 检查；旧版 Evidence Ledger 不会因为 adapter 更新自动变成当前 contract/source/environment 的有效证据。

## 会生成什么

所有工具都共享：

- `AGENTS.md`
- `workflow/core/`
- `workflow/team-profile.yaml`
- `workflow/local/team-profile.local.yaml`（Git 忽略）
- `workflow/local/rule-provenance.private.yaml`（Git 忽略）
- `workflow/INSTALL_REPORT.md`
- 必要时的 `workflow/INITIALIZATION_QUESTIONS.md`

工具入口：

| 工具 | 主要生成路径 |
| --- | --- |
| Codex | `.agents/skills/agent-workflow/` 与每个 manifest 命令的 `.agents/skills/{skill_slug}/` |
| Claude Code | `CLAUDE.md`、`.claude/commands/`、`.claude/skills/agent-workflow/` |
| Cursor | `.cursor/rules/agent-workflow-core.mdc`、`.cursor/commands/` |
| GitHub Copilot | `.github/copilot-instructions.md`、`.github/prompts/` |
| CodeBuddy | `.codebuddy/rules/agent-workflow.md`、`.codebuddy/commands/` |
| Kiro | `.kiro/steering/`、`.kiro/skills/` |
| Trae | `.trae/commands/`、`.trae/skills/`，另生成 `.trae-cn/` 兼容镜像 |

七个平台的 `verification_status` 当前均为 `native_not_yet_manually_certified`：生成路径与自动 conformance 通过，不代表已经在每个真实客户端版本完成人工认证。Copilot 使用 Prompt picker 或客户端支持的 slash prompt；`.trae-cn/` 不能替代 `.trae/` 主路径验收。

## 工具别名

初始化器接受 `trea`，并归一为 `trae`：

```bash
agent-workflow-init --target . --tools trea --yes
```

当前版本生成 `.trae/commands/` 与 `.trae/skills/`；旧版单文件 Trae instruction 入口不再是 1.0 的命令路径。

## 初始化 Completion Contract

初始化完成后：

```bash
node workflow/bin/check-completion-contract.cjs \
  --init \
  --feature example-feature \
  --workspace .
```

该命令创建：

- `features/example-feature/completion/contract.yaml`
- `features/example-feature/completion/environment.yaml`
- `features/example-feature/completion/findings.yaml`
- `features/example-feature/completion/run-state.yaml`
- `features/example-feature/completion/evidence/`

如果 contract、environment、findings 或 run-state 任一已存在，初始化会拒绝覆盖。environment/findings 中的 placeholder 必须替换为精确版本或显式 review snapshot；填写完成后运行：

```bash
node workflow/bin/check-completion-contract.cjs \
  --contract features/example-feature/completion/contract.yaml
```

只有 lint 无 error、所有 blocking AC 有可复现 Oracle、人工闸门与质量预算被明确记录、Owner 已冻结 Contract 后，才可请求 `/deliver-until-done`。

## 安全边界

初始化器在任何参数下都不会：

- 拉取远程代码、创建或切换分支、push 或 merge；
- 触发构建、部署、release 或 package publish；
- 写数据库或生产配置；
- 执行 Completion Contract 中的 Oracle；
- 把仓库内配置当作高风险自动执行的唯一信任源。

初始化后的运行时动作仍受 `workflow/core/execution-policy.md` 约束。生效权限取 core 硬上限、仓库外受信策略、team-profile 请求和当次授权的最严格值。

## 接收方验收

正式用于交付前确认：

- `workflow/team-profile.yaml` 已人工检查，且只含可提交内容；
- `workflow/local/` 已被 Git 忽略；
- 待补资料没有被遗漏；
- 选中平台的全部 23 个命令入口已生成；
- `.trae-cn/` 被视为兼容镜像，不被算作独立平台；
- 已有文件没有被意外覆盖；
- 初始化期间没有远程 Git、分支、部署、数据库或生产配置动作；
- `node workflow/bin/check-command-manifest.cjs` 与 `node workflow/bin/check-support-matrix.cjs` 通过；
- 在真实工具中仍按 [多工具人工验收](./docs/adapter-manual-acceptance.md) 记录版本化证据。

完整清单见 [维护者交接](./docs/maintainer-handoff.md)。
