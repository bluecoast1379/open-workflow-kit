# Maintainer Handoff

This document is the maintainer-facing handoff for publishing and supporting the starter kit. It is intentionally generic and must not contain private company, customer, repository, incident, URL, log, SQL, or production configuration details.

## Current Delivery State

The starter kit is locally releasable when these commands pass from the package root:

```bash
npm run check
npm run build:release
```

The build produces:

- `dist/agent-workflow-starter-kit-<version>.tgz`
- `dist/RELEASE_MANIFEST.md`

The manifest records package name, version, license, archive size, SHA-256 checksum, install smoke status, and the manual publish boundary.

## What Maintainers May Share

Maintainers may share only the sanitized starter kit package or a repository containing this starter kit:

- `README.md`
- `INIT.md`
- `LICENSE`
- `NOTICE`
- `install.sh`
- `bin/`
- `scripts/`
- `workflow/`
- `templates/`
- `examples/`
- `docs/`
- `test/`

Do not share source-team workflow documents, product documents, feature directories, business repositories, customer materials, logs, SQL files, screenshots, or internal runbooks as examples.

## Manual-Only Publication Boundary

Agents may prepare, validate, and package the starter kit locally. Agents must not perform remote publication actions.

Maintainer-only actions:

- create a remote repository;
- add or change remote URLs;
- push commits;
- create or push tags;
- publish to npm or another package registry;
- upload archives to a public site;
- run remote Git refresh commands in a private workspace.

Use `docs/manual-publish.md` as the command checklist, then run those commands manually.

## Receiver Acceptance Checklist

Ask a receiving team to run the initializer in a disposable branch or temporary workspace first.

The receiver should verify:

- `workflow/team-profile.yaml` was generated.
- `workflow/INITIALIZATION_QUESTIONS.md` exists when required source materials were missing.
- `workflow/core/` exists and contains command and template guidance.
- `workflow/adapters/` exists.
- Selected tool entries were generated, for example `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, `.codebuddy/`, `.kiro/`, or `.trae/`.
- `trea` was normalized to `trae` when used.
- Existing files were not overwritten unless `--force` was explicitly passed.
- No remote Git, branch creation, push, build, deploy, database write, or production config write occurred during initialization.

Recommended receiver smoke command:

```bash
agent-workflow-init --target . --tools codex,claude,cursor,codebuddy,trea --yes
```

If installed from a local tarball:

```bash
./node_modules/.bin/agent-workflow-init --target . --tools codex,claude,cursor,codebuddy,trea --yes
```

## Support Model

Separate support requests by layer:

- `workflow/core`: flow stages, hard gates, templates, and tool-neutral rules.
- `workflow/team-profile.yaml`: the receiver team's local configuration and missing source-material questions.
- `workflow/adapters`: thin tool-specific entry points.
- `bin/init-workspace.cjs`: local initialization logic.
- `bin/check-sanitized.cjs`: publication safety checks.

When a team reports a problem, first ask for:

- the initializer command they ran;
- Node.js version;
- selected tool list;
- generated `workflow/team-profile.yaml` with secrets removed;
- generated `workflow/INITIALIZATION_QUESTIONS.md`, if present;
- whether any file was written with `.agent-workflow-new`;
- the exact error output.

Do not ask teams to send private source code, customer data, credentials, logs, SQL, or production configuration unless there is a separate approved secure support channel.

## Tool Capability Policy

The workflow must remain tool-agnostic at the core layer. Tool-specific behavior belongs in adapters.

Capability levels:

- L0: documentation rules only.
- L1: prompt or command templates.
- L2: automatic rule triggering inside the current tool.
- L3: hooks or local automation supported by the current tool.
- L4: subagents or specialized skills supported by the current tool.

Do not promise identical behavior across tools. Promise the same workflow core, with each tool enhanced or downgraded according to its available capabilities.

## Release Update Flow

For each release:

1. Change only generic starter kit files.
2. Keep private examples outside this repository.
3. Run `npm run check`.
4. Run `npm run build:release`.
5. Inspect `dist/RELEASE_MANIFEST.md`.
6. Inspect the tarball file list.
7. Run an install smoke test from the tarball in a temporary target workspace.
8. Run `bin/check-sanitized.cjs --extra-banned <private-denylist-file>` with a private denylist outside the package.
9. Manually publish through the chosen channel.

## Versioning Guidance

Use semantic versioning:

- Patch: documentation clarifications, sanitizer improvements, adapter text fixes, smoke test fixes.
- Minor: new adapters, new optional templates, new non-breaking initializer options.
- Major: changed generated file layout, changed command names, changed hard-gate semantics, or removed supported tools.

## Known Non-Goals

The starter kit does not:

- host or sync team documents;
- replace human approval for code implementation gates;
- bypass local tool limitations;
- call one agent tool's private capability from another tool;
- guarantee all tools provide the same automation level;
- create branches, push code, publish packages, deploy services, or write databases.
