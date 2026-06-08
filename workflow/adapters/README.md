# Adapters

Adapters are thin tool-specific entry points generated from the same workflow core and `team-profile.yaml`.

Supported tools:

- Codex: `AGENTS.md` and `.codex/prompts/`
- Claude Code: `CLAUDE.md` and `.claude/commands/`
- Cursor: `.cursor/rules/` and `.cursor/commands/` (custom slash commands, Cursor 1.6+)
- GitHub Copilot: `.github/copilot-instructions.md`
- CodeBuddy: `.codebuddy/instructions.md`
- Kiro: `.kiro/instructions.md`
- Trae: `.trae/instructions.md`

Rules:

- An adapter must not weaken workflow/core hard gates.
- An adapter must not call another tool's private capability.
- If a tool cannot support hooks or subagents, downgrade to prompt, rule, or checklist behavior.
- If a local tool entry already exists, the initializer writes a `.agent-workflow-new` file unless `--force` is used.
