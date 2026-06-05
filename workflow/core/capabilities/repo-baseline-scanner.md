# Capability: repo-baseline-scanner

- **Tier**: recommended
- **Stage**: `/03`; can also run at session start
- **Purpose**: Record the actual local baseline of every affected repository so that later stages do not confuse "current working tree" with "what is in production".

## Why

Every later stage depends on a clear baseline: current branch, whether the working tree is dirty, whether `origin/<production>` is reachable, and which assumptions had to be downgraded because of network or permission gaps. Capturing this once at the start of the architecture stage prevents downstream conclusions that quietly assume an unreachable refresh succeeded.

## Inputs

- `workflow/team-profile.yaml#repos`
- `workflow/team-profile.yaml#branch_model.production_branch`
- Local Git state per repository

## Outputs

```yaml
result: PASS | WARN
repositories:
  - path: "<repo>"
    branch: "<current branch>"
    dirty_files: <count>
    has_remote_prod: true | false
    remote_refresh: success | failed | skipped
    baseline_source: "origin/production" | "local production" | "working tree snapshot"
    notes: "..."
gaps:
  - "<repo>: remote refresh failed; conclusions limited to local cached refs."
```

## Blocking Rules

This capability does not block by itself. It records facts so that other capabilities can decide whether to block. Always mark the baseline source explicitly so that later stages do not promote "local cached" into "remote confirmed".

## Adapter Examples

- **L0**: A required table in the architecture document.
- **L1**: A prompt that asks the user to paste branch and status output for each repository.
- **L2**: A slash command that fills the table automatically.
- **L3**: A session-start hook that refreshes the baseline and writes it into the feature document.
- **L4**: A subagent that owns the baseline and exposes it to other agents.

## Anti-Patterns

- Treating the current working tree as production fact.
- Silently relying on cached refs when remote refresh failed.
- Skipping the baseline because "we already know what is on production".
- Mixing facts from different repositories into a single column without marking the source per row.
