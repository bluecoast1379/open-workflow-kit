# 工具安装示例

同一套 workflow core 会被多个工具共享。每个工具只获得自己的薄 adapter。

## Codex

```bash
agent-workflow-init --target . --tools codex --yes
```

生成文件：

- `AGENTS.md`
- `.agents/skills/agent-workflow/SKILL.md`
- `.agents/skills/workflow-*/SKILL.md`
- `.agents/skills/workflow-*/agents/openai.yaml`
- `workflow/`

Codex 的项目级入口是根 `AGENTS.md` 和 `.agents/skills/`。CLI/IDE 中输入 `$` 或 `/skills` 后按阶段编号、英文 slug 或中文展示名模糊选择；Desktop 通过 Skills 入口选择。分阶段 Skill 的 `allow_implicit_invocation` 为 `false`，不会把自然语言提及自动视为进入 04 阶段。本 kit 不生成项目级 `.codex/prompts/`。

## Claude Code

```bash
agent-workflow-init --target . --tools claude --yes
```

生成文件：

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/commands/`
- `workflow/`

## Cursor

```bash
agent-workflow-init --target . --tools cursor --yes
```

生成文件：

- `AGENTS.md`
- `.cursor/rules/agent-workflow-core.mdc`
- `.cursor/commands/`
- `workflow/`

## GitHub Copilot

```bash
agent-workflow-init --target . --tools copilot --yes
```

生成文件：

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `workflow/`

## CodeBuddy

```bash
agent-workflow-init --target . --tools codebuddy --yes
```

生成文件：

- `AGENTS.md`
- `.codebuddy/rules/agent-workflow.md`
- `.codebuddy/commands/`
- `workflow/`

CodeBuddy 输入 `/` 后可按编号或中文名称模糊选择项目命令。命令 frontmatter 只提供 `description` 和 `argument-hint`，不声明宽泛 `allowed-tools`，因此不会绕过 workflow core 的实现、Git 和高风险操作闸门。当前支持级别为 native，但在真实版本验收前保持 `native_not_yet_manually_certified`。

## Kiro

```bash
agent-workflow-init --target . --tools kiro --yes
```

生成文件：

- `AGENTS.md`
- `.kiro/steering/agent-workflow.md`（官方 steering 路径）
- `workflow/`

Kiro 在本 kit 中属于 `AGENTS.md` compatible 入口。

## Trae

```bash
agent-workflow-init --target . --tools trae --yes
```

或使用别名：

```bash
agent-workflow-init --target . --tools trea --yes
```

生成文件：

- `AGENTS.md`
- `.trae/instructions.md`
- `.agents/skills/workflow-*/SKILL.md`
- `workflow/`

Trae 在本 kit 中通过 `.agents/skills/` 提供按阶段选择能力，并保留 `.trae/instructions.md` 兼容入口。不同 Trae IDE/CLI 版本的 slash panel 和项目命令导入行为仍需真机验证，因此不生成未经确认的 `.trae/commands/`，支持级别保持 compatible。

## 多工具安装

```bash
agent-workflow-init --target . --tools codex,claude,cursor,copilot,codebuddy,kiro,trae --yes
```

支持口径是 Codex、Claude Code、Cursor、GitHub Copilot、CodeBuddy 5 个原生 adapter，Kiro、Trae 2 个 compatible 入口。调用体验按 `slash_fuzzy`、`skill_fuzzy`、`instruction_reference` 分级；生成了工具文件不等于已完成原生验收。发布前按 [`support-matrix.yaml`](../workflow/adapters/support-matrix.yaml) 记录真实工具验收证据，不承诺所有工具体验完全一致。
