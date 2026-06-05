# Init Guide

This guide describes how a target team initializes the workflow after receiving the starter kit path or repository address.

## Recommended Flow

1. Put the starter kit somewhere outside the target product repository.
2. Open the target product repository root.
3. Run the initializer from the target root.
4. Review generated `workflow/team-profile.yaml`.
5. Fill any missing items in `workflow/INITIALIZATION_QUESTIONS.md`.
6. Re-run the initializer with the selected tool list if needed.

## Local Path Install

```bash
cd /path/to/target-workspace
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --tools codex,claude,cursor
```

Shell wrapper:

```bash
cd /path/to/target-workspace
/path/to/open-workflow-kit/install.sh . --tools codex,claude,cursor
```

## Package Bin Install

If the starter kit has been installed as a local package:

```bash
cd /path/to/target-workspace
agent-workflow-init --target . --tools codex,claude,cursor
```

## Non-Interactive Install

For agent-driven or CI-like initialization where questions cannot be answered in the terminal:

```bash
agent-workflow-init --target . --tools codex,claude,cursor --yes
```

Missing source materials are recorded in `workflow/INITIALIZATION_QUESTIONS.md`.

## Upgrade Existing Workspace

```bash
agent-workflow-init --target . --tools codex,claude,cursor --upgrade
```

If existing files would be overwritten, the initializer writes `.agent-workflow-new` files unless `--force` is passed.

## Safety Boundary

The initializer does not:

- run remote Git commands;
- create or switch branches;
- push code;
- trigger builds or deployments;
- execute database writes;
- modify production configuration.

Those actions remain user-manual.

## Tool Alias

The initializer accepts `trea` as an alias for `trae`, then writes `.trae/instructions.md`.

## Receiver Acceptance

After initialization, verify the generated workflow before using it for real feature delivery:

- review `workflow/team-profile.yaml`;
- answer items in `workflow/INITIALIZATION_QUESTIONS.md`, if present;
- confirm selected tool adapters were generated;
- confirm existing files were not overwritten unexpectedly;
- confirm no remote Git, branch, push, deploy, database, or production config action was performed.

For the full acceptance checklist, see `docs/maintainer-handoff.md`.
