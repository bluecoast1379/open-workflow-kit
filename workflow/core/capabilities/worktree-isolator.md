# Capability: worktree-isolator

- **Tier**: recommended
- **Stage**: `/04`, `/04A`, `/04B`
- **Purpose**: When two or more features modify the same repository in parallel, enforce one Git worktree per active feature so that conflicting edits never share a working directory.

## Why

Same-repository parallel implementation without isolation is a documented cause of accidental cross-feature contamination: shared dirty state, accidental commits onto the wrong branch, and merge conflicts treated as ordinary edits. Physical worktree isolation gives each active feature a dedicated directory bound to a single feature branch.

## Inputs

- `workflow/team-profile.yaml#branch_model.worktree_dir` (default `_worktrees`)
- The active workflow registry, for example `features/00-active-branches.md` or an equivalent ledger
- Per-repository working directory state (`git worktree list`, `git status`)

## Outputs

```yaml
result: PASS | WARN | BLOCK
isolation:
  - repository: "<repo>"
    active_features:
      - feature: "<name>"
        worktree_path: "<path or main-clone>"
        branch: "<branch>"
        same_file_conflict_with: ["<other feature>"]
    verdict: pass | block
blocked_reason: "..."
recommended_action: "Add or use a registered worktree under <worktree_dir>/<repo>-<feature-branch>."
```

## Blocking Rules

- Block when a new feature is about to enter implementation in a repository where another active feature is already in implementation and no separate worktree exists.
- Block when two active features would touch the same file, query, method, or business contract concurrently; require serial scheduling instead.
- Downgrade to WARN when the repository has no Git metadata; record the gap in the feature document.

## Adapter Examples

- **L0**: A documented rule plus a manually maintained registry.
- **L1**: A prompt that asks the user to paste the active registry before starting implementation.
- **L2**: A slash command that prints the verdict and the worktree command to run.
- **L3**: A hook that refuses to write business code from a working tree that is not registered for the current feature.
- **L4**: A subagent that owns the registry and proposes worktree commands.

## Anti-Patterns

- Switching branches inside the main clone to "quickly do the other feature".
- Sharing a working directory between two features and relying on staging discipline.
- Treating a worktree as permanent infrastructure instead of a per-feature isolation.
- Creating worktrees without a registry entry, then losing track of which feature owns which directory.
