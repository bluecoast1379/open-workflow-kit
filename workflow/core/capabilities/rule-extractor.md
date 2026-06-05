# Capability: rule-extractor

- **Tier**: optional
- **Stage**: `/12`
- **Purpose**: Propose generic, redacted workflow rule updates derived from real incidents, so that retrospectives feed the workflow core instead of dying inside a single project.

## Why

A team that runs retrospectives without a rule-extraction step typically improves only the project that ran them. A small extraction pass converts incident-specific lessons into tool-agnostic rules suitable for `workflow/core/` or `workflow/team-profile.yaml`, and surfaces them for explicit human approval before they take effect.

## Inputs

- The curated memory entries produced by `memory-curator`
- The current `workflow/core/` rules
- The current `workflow/team-profile.yaml`
- A redaction policy

## Outputs

```yaml
result: PASS | WARN
proposed_changes:
  - target: "workflow/core/<file>" | "team-profile.yaml" | "AGENTS.md"
    summary: "<rule change, redacted>"
    rationale: "<why this rule is generalizable>"
    risk_if_ignored: "..."
    needs_human_approval: true
discarded_proposals:
  - reason: "specific to a single business context"
recommended_followup:
  - "Open a change proposal for proposal #N."
```

## Blocking Rules

This capability does not block. Every proposal requires explicit human approval before any rule change.

## Adapter Examples

- **L0**: A required section in the retrospective template that lists candidate rule changes.
- **L1**: A prompt that walks the memory entries and proposes rule changes.
- **L2**: A slash command that produces the structured proposal list.
- **L3**: A hook that prevents marking the retrospective as done without a proposal section, even when the proposal is "no changes".
- **L4**: A subagent that drafts proposals and links them to the relevant rule files.

## Anti-Patterns

- Approving rule changes silently without recording who approved them.
- Allowing the agent to update `workflow/core/` directly without human review.
- Letting incident-specific terminology leak into a generic rule.
- Discarding lessons that "do not fit" the existing structure instead of explaining why.
