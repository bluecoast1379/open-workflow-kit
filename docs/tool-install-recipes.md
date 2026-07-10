# 工具安装示例

同一套 workflow core 会被多个工具共享。每个工具只获得自己的薄 adapter。

## Codex

```bash
agent-workflow-init --target . --tools codex --yes
```

生成文件：

- `AGENTS.md`
- `.agents/skills/agent-workflow/SKILL.md`
- `workflow/`

Codex 的项目级入口是根 `AGENTS.md` 和 `.agents/skills/`；本 kit 不生成项目级 `.codex/prompts/`。

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
- `workflow/`

CodeBuddy 在本 kit 中属于 `AGENTS.md` compatible 入口，不宣称与原生 adapter 等价。

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
- `workflow/`

Trae 在本 kit 中属于 `AGENTS.md` compatible 入口；该路径是兼容增强，不作为原生能力承诺。

## 多工具安装

```bash
agent-workflow-init --target . --tools codex,claude,cursor,copilot,codebuddy,kiro,trae --yes
```

支持口径是 Codex、Claude Code、Cursor、GitHub Copilot 4 个原生 adapter，CodeBuddy、Kiro、Trae 3 个 `AGENTS.md` compatible 入口。生成了工具文件不等于已完成原生验收；发布前按 [`support-matrix.yaml`](../workflow/adapters/support-matrix.yaml) 记录真实工具验收证据。不承诺所有工具体验完全一致。
