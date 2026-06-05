# Capability: release-safety-checker

- **Tier**: essential
- **Stage**: `/05`, `/07`, `/11` (review, test execution, release notice)
- **Purpose**: Compare the release-candidate branch against the production baseline so that the release scope matches the documented intent and no foreign commits leak into production.

## Why

Release branches that are created from an integration branch instead of production are the most documented source of large-scale leakage incidents. Treating the release branch as "the whole branch will ship" by default and comparing it to production via the standard Git ancestry checks catches scope drift before deployment.

## Inputs

- `workflow/team-profile.yaml#branch_model.production_branch`
- Release-candidate branch name
- Documented release scope from `features/{feature}/02-产品文档.md` and `features/{feature}/04-代码实现.md`
- Local Git history for the affected repositories
- `workflow/team-profile.yaml#risk_policy.high_risk_files`

## Outputs

```yaml
result: PASS | WARN | BLOCK
checks:
  - name: is_ancestor
    status: pass | block
    detail: "production_branch is ancestor of release_branch: yes/no"
  - name: commit_count
    status: pass | warn | block
    detail: "<N> commits ahead of production"
  - name: file_diff_count
    status: pass | warn | block
    detail: "<N> files changed vs production"
  - name: high_risk_files_touched
    status: pass | block
    files: ["ci/...", ".env.production"]
overall_risk: P0 | P1 | P2 | P3
blocked_reason: "..."
recommended_action: "Rebuild from production, cherry-pick documented commits only."
```

## Blocking Rules

- Block when the production branch is not an ancestor of the release-candidate branch.
- Block when commit count exceeds the documented release scope by a configurable threshold (default: more than 5x the documented commit count, or absolute count above 50).
- Block when the diff touches files in `risk_policy.high_risk_files` that are not listed in the release scope.
- Downgrade to WARN when remote refresh failed and the result is based on local cached refs; require explicit user acknowledgement before treating it as authoritative.

## Adapter Examples

- **L0**: Document the six standard Git checks in `AGENTS.md` and require manual execution before sign-off.
- **L1**: A checklist prompt that pastes the commands and asks the user to paste the outputs.
- **L2**: A slash command that runs the checks and renders a verdict.
- **L3**: A pre-release hook that fails the workflow when any check blocks.
- **L4**: A subagent dedicated to release-scope verification, returning a structured verdict for the review agent to consume.

## Anti-Patterns

- Treating "tests passed in staging" as evidence that the release branch is clean.
- Trusting branch name conventions instead of running the actual ancestor check.
- Skipping the production-baseline diff because the local working tree "only contains the expected changes".
- Promoting a polluted branch to production by cherry-picking after the fact instead of rebuilding from a clean baseline.
