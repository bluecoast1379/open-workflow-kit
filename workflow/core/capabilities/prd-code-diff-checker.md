# Capability: prd-code-diff-checker

- **Tier**: essential
- **Stage**: end of `/04`, `/04A`, `/04B`; and during `/05`
- **Purpose**: Compare the product intent captured in the PRD and the technical plan against the real Git diff, so that documented scope and actual changes stay aligned.

## Why

Drift between "what the PRD said would change" and "what the diff actually changes" is a documented and recurring cause of review blind spots: either claimed changes were not implemented, or out-of-scope files were modified without the PRD reflecting it. A mechanical diff comparison catches both directions cheaply.

## Inputs

- `features/{feature}/02-产品文档.md` and `features/{feature}/04-代码实现.md` (declared affected files, modules, APIs, UI surfaces)
- Real Git diff: `git diff --name-status <base>..<head>` for each affected repository
- `workflow/team-profile.yaml#repos` (to map repository paths to families)

## Outputs

```yaml
result: PASS | WARN | BLOCK
matches:
  documented_and_changed:
    - "<file>"
  documented_but_not_changed:
    - "<file>: documented in 04 but no diff"
  changed_but_not_documented:
    - "<file>: present in diff but not in 04 scope"
notes:
  - "Module X was described as <intent> but the diff only changes test fixtures."
blocked_reason: "..."
recommended_action: "Update 04-代码实现.md scope, or add the missing change, or revert the out-of-scope edit."
```

## Blocking Rules

- Block when files in the documented scope have no corresponding change in the diff (the implementation is incomplete or the documentation is stale).
- Block when files outside the documented scope are changed and the change is not trivially formatting or whitespace.
- Downgrade to WARN when the diff touches generated files, lockfiles, or vendored code that the team has flagged as auto-managed in `team-profile.yaml`.

## Adapter Examples

- **L0**: A checklist inside the review document template that asks "documented vs actually changed" for every listed file.
- **L1**: A prompt that consumes the PRD scope and the `git diff --name-status` output and produces the table above.
- **L2**: A slash command embedded into `/05-代码审查` that runs the comparison automatically.
- **L3**: A pre-commit or pre-push hook that warns when the staged change touches files outside the documented scope.
- **L4**: A subagent that runs alongside the main reviewer, returning the comparison as a structured artifact.

## Anti-Patterns

- Reviewing only the diff without re-reading the PRD scope.
- Reviewing only the PRD scope without inspecting the diff.
- Treating "all tests still pass" as proof that the scope is correct.
- Silently widening the scope at review time without updating the PRD.
