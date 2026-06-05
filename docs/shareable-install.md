# Shareable Install

This document is for teams receiving a workflow address or release archive.

## From A Local Tarball

If you received `agent-workflow-starter-kit-0.1.0.tgz`:

```bash
cd /path/to/target-workspace
npm install --no-audit --no-fund /path/to/agent-workflow-starter-kit-0.1.0.tgz
./node_modules/.bin/agent-workflow-init --target . --tools codex,claude,cursor,codebuddy,trea --yes
```

`trea` is accepted as an alias for `trae`.

## From A Git Address

If the maintainer gives you a Git URL:

```bash
cd /path/to/target-workspace
npx --yes --package git+https://github.com/bluecoast1379/open-workflow-kit.git agent-workflow-init --target . --tools codex,claude,cursor
```

Replace the URL if you are using a fork or private mirror. The initializer runs locally in your workspace.

## From A Package Registry

If the package is published to a registry:

```bash
cd /path/to/target-workspace
npx --yes --package agent-workflow-starter-kit agent-workflow-init --target . --tools codex,claude,cursor
```

## What Gets Generated

- `workflow/team-profile.yaml`
- `workflow/core/`
- `workflow/adapters/`
- `AGENTS.md` for Codex when selected
- `CLAUDE.md` and `.claude/commands/` for Claude Code when selected
- `.cursor/rules/` for Cursor when selected
- `.codebuddy/`, `.kiro/`, `.trae/`, or `.github/` adapter files when selected
- `workflow/INITIALIZATION_QUESTIONS.md` when local source materials are missing

## Safety Boundary

The initializer does not pull remote code, create branches, push code, trigger builds, deploy, write databases, or modify production config. It only reads local files and writes workflow files into the target workspace.

## Acceptance

After installation, follow the receiver checklist in [Maintainer Handoff](./maintainer-handoff.md). The important validation is that `workflow/team-profile.yaml`, `workflow/core/`, and the selected tool adapters exist, while missing local materials are captured in `workflow/INITIALIZATION_QUESTIONS.md`.
