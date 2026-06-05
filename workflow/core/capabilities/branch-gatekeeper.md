# Capability: branch-gatekeeper

- **Tier**: essential
- **Stage**: `/04`, `/04A`, `/04B` (before any business code modification)
- **Purpose**: Stop business code implementation when the current branch or workflow stage is not authorized.

## Why

Untracked branch and stage drift is the most common cause of code being written into the wrong baseline. A documented stage gate combined with a real branch check prevents accidental modifications to `main`, `prod`, `test`, integration, or unrelated history branches.

## Inputs

- `workflow/team-profile.yaml#branch_model` (production branch, integration branch, feature branch rule)
- Current Git branch of each affected repository (`git rev-parse --abbrev-ref HEAD`)
- Active workflow stage (from the user request and `features/{feature}/00-工作流状态.md`)
- Feature name and feature documents

## Outputs

```yaml
result: PASS | WARN | BLOCK
checks:
  - name: stage_gate
    status: pass | block
    detail: "..."
  - name: branch_gate_per_repo
    status: pass | block
    repos:
      - path: "<repo>"
        branch: "<current branch>"
        verdict: pass | block
        reason: "..."
blocked_reason: "..."
recommended_action: "Create or switch to feature branch using the rule in team-profile."
```

## Blocking Rules

- Block when the current request is not an implementation request (`/04`, `/04A`, `/04B`) and the agent is about to modify business source, config, SQL, migration, or deployment files.
- Block when any affected repository is currently on a non-feature branch (production, integration, unrelated history, unknown).
- Block when feature branch name does not match `branch_model.feature_branch_rule`.
- Downgrade to WARN when the repository has no Git metadata; require explicit user confirmation before writing.

## Adapter Examples

- **L0**: Document the gate inside `AGENTS.md` and refuse to write code without confirming both gates.
- **L1**: A prompt that asks the user to paste current branch output before proposing edits.
- **L2**: A slash command that runs the per-repo branch check and prints a verdict before yielding to the implementation step.
- **L3**: A pre-write hook that aborts the write if the branch check fails.
- **L4**: A subagent dedicated to running and reporting the gate result, separate from the main implementation agent.

## Anti-Patterns

- Assuming the branch is correct because the directory name "looks right".
- Skipping the gate when the change "seems small".
- Editing code in `main` or `prod` to fix a release issue without first creating a feature branch.
- Mixing two features on the same feature branch.
