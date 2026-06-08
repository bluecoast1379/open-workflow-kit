# Tool Install Recipes

The same workflow core is shared across tools. Each tool receives a thin adapter only.

## Codex

```bash
agent-workflow-init --target . --tools codex
```

Generated files:

- `AGENTS.md`
- `.codex/prompts/init-workspace.md`
- `.codex/prompts/workflow-status.md`
- `workflow/`

## Claude Code

```bash
agent-workflow-init --target . --tools claude
```

Generated files:

- `CLAUDE.md`
- `.claude/commands/*.md`
- `workflow/`

## Cursor

```bash
agent-workflow-init --target . --tools cursor
```

Generated files:

- `.cursor/rules/agent-workflow-core.mdc`
- `.cursor/commands/*.md` (custom slash commands, Cursor 1.6+)
- `workflow/`

## GitHub Copilot

```bash
agent-workflow-init --target . --tools copilot
```

Generated files:

- `.github/copilot-instructions.md`
- `workflow/`

## CodeBuddy

```bash
agent-workflow-init --target . --tools codebuddy
```

Generated files:

- `.codebuddy/instructions.md`
- `workflow/`

## Kiro

```bash
agent-workflow-init --target . --tools kiro
```

Generated files:

- `.kiro/instructions.md`
- `workflow/`

## Trae

```bash
agent-workflow-init --target . --tools trae
```

`trea` is accepted as an alias and is normalized to `trae`.

Generated files:

- `.trae/instructions.md`
- `workflow/`

## Multi-Tool Install

```bash
agent-workflow-init --target . --tools codex,claude,cursor,copilot,codebuddy,kiro,trae
```

Do not expect every tool to provide the same runtime behavior. The core is the same; adapter capability depends on the tool.
