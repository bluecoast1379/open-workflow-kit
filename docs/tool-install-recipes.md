# 工具安装示例

同一套 workflow core 会被多个工具共享。每个工具只获得自己的薄 adapter。

## Codex

```bash
agent-workflow-init --target . --tools codex --yes
```

生成文件：

- `AGENTS.md`
- `.codex/prompts/`
- `workflow/`

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
- `.codebuddy/instructions.md`
- `workflow/`

## Kiro

```bash
agent-workflow-init --target . --tools kiro --yes
```

生成文件：

- `AGENTS.md`
- `.kiro/instructions.md`
- `workflow/`

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

## 多工具安装

```bash
agent-workflow-init --target . --tools codex,claude,cursor,copilot,codebuddy,kiro,trae --yes
```

不要期待每个工具提供完全相同的运行体验。core 是同一套，adapter 能力取决于当前工具。
