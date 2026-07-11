# 工具安装示例

同一套 workflow core 会被多个工具共享。每个平台从 `workflow/core/command-manifest.yaml` 为全部命令生成自己的薄 adapter；命令数量不在 adapter 中硬编码。

## Codex

```bash
agent-workflow-init --target . --tools codex --yes
```

主要生成：

- `AGENTS.md`
- `.agents/skills/agent-workflow/SKILL.md`
- `.agents/skills/{skill_slug}/SKILL.md`
- `.agents/skills/{skill_slug}/agents/openai.yaml`
- `workflow/`

Codex 的项目级入口是根 `AGENTS.md` 和 `.agents/skills/`。在支持的 CLI/IDE 中从 `/` Skills 列表、`/skills` 或 `$` 按阶段编号、英文 slug 或中文展示名模糊选择。分阶段 Skill 的 `allow_implicit_invocation` 为 `false`，不会把自然语言提及自动视为进入实现阶段。本 kit 不生成项目级 `.codex/prompts/`。

## Claude Code

```bash
agent-workflow-init --target . --tools claude --yes
```

主要生成 `AGENTS.md`、`CLAUDE.md`、`.claude/commands/{id}.md`、`.claude/skills/agent-workflow/SKILL.md` 和 `workflow/`。输入 `/` 后可按命令编号或名称模糊选择，附加参数通过 `$ARGUMENTS` 传入。

## Cursor

```bash
agent-workflow-init --target . --tools cursor --yes
```

主要生成 `AGENTS.md`、`.cursor/rules/agent-workflow-core.mdc`、`.cursor/commands/{id}.md` 和 `workflow/`。在 Agent 输入框输入 `/` 后按编号或描述选择。

## GitHub Copilot

```bash
agent-workflow-init --target . --tools copilot --yes
```

主要生成：

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `.github/prompts/{skill_slug}.prompt.md`
- `workflow/`

Prompt Files 是项目级的逐命令入口。在支持的 VS Code、Visual Studio 或 JetBrains 中从 Prompt picker 选择；部分客户端支持输入 `/` 后按 prompt 文件名调用。Prompt Files 仍可能受客户端版本或预览设置影响，找不到时应记录真实行为并用 core 文件引用兜底，不应把它写成已通过 slash 真机认证。

## CodeBuddy

```bash
agent-workflow-init --target . --tools codebuddy --yes
```

主要生成 `AGENTS.md`、`.codebuddy/rules/agent-workflow.md`、`.codebuddy/commands/{id}.md` 和 `workflow/`。输入 `/` 后可按编号或中文名称模糊选择。命令 frontmatter 只提供描述和参数提示，不声明宽泛 `allowed-tools`。

## Kiro

```bash
agent-workflow-init --target . --tools kiro --yes
```

主要生成：

- `AGENTS.md`
- `.kiro/steering/agent-workflow.md`（`inclusion: always`）
- `.kiro/steering/{skill_slug}.md`（`inclusion: manual`，Kiro IDE slash 入口）
- `.kiro/skills/{skill_slug}/SKILL.md`（Kiro CLI slash Skill）
- `workflow/`

Kiro 官方说明中，workspace steering 位于 `.kiro/steering/`，`inclusion: manual` 的 steering 会出现在 `/` 菜单；Kiro CLI 会把 `.kiro/skills/` 中的 Skill 自动作为 slash command。IDE 与 CLI 必须分别验收，自动生成不等于真机认证。

## Trae

```bash
agent-workflow-init --target . --tools trae --yes
```

别名也可用：

```bash
agent-workflow-init --target . --tools trea --yes
```

主要生成：

- `AGENTS.md`
- `.trae/commands/{id}.md`
- `.trae/skills/agent-workflow/SKILL.md`
- `.trae/skills/{skill_slug}/SKILL.md`
- `.trae-cn/commands/{id}.md` 和 `.trae-cn/skills/{skill_slug}/SKILL.md` 兼容镜像
- `workflow/`

Trae 可在 Settings > Skills & Commands 管理项目入口，并从 `/` command panel 按编号或名称模糊选择。`.trae/` 是主官方路径；`.trae-cn/` 只是兼容镜像，不得单独作为 native 认证依据。

## 多工具安装

```bash
agent-workflow-init --target . --tools codex,claude,cursor,copilot,codebuddy,kiro,trae --yes
```

安装后运行：

```bash
node workflow/bin/check-command-manifest.cjs
node workflow/bin/check-support-matrix.cjs
```

kit 维护者还应运行 `node test/adapter-conformance.cjs`，确认七个平台都从 manifest 生成了完整入口。以上自动检查不会把任何平台升级为 `native_verified`；发布前仍需按 [多工具命令发现人工验收](./adapter-manual-acceptance.md) 在真实工具中记录版本化证据。
