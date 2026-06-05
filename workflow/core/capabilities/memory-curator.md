# Capability: memory-curator

- **Tier**: optional
- **Stage**: `/12`
- **Purpose**: Extract reusable lessons from the retrospective into a structured memory index, without leaking private business facts.

## Why

Lessons recorded only inside long retrospective documents tend to be invisible to future work. A curated index lets agents and humans see the operative rule without re-reading the original case. Without a curation step, the same lesson is re-learned project after project.

## Inputs

- The retrospective document `12-复盘总结.md`
- The current memory index, for example `.claude/MEMORY.md` or an equivalent file referenced by the team profile
- A redaction policy listing terms that must not leave the team context

## Outputs

```yaml
result: PASS | WARN
added_entries:
  - phenomenon: "<observable, redacted>"
    root_cause: "<mechanism, redacted>"
    prevention: "<rule or check, redacted>"
    stage_owner: "<stage>"
    source_feature: "<feature name>"
skipped_due_to_redaction:
  - "<reason>"
recommended_followup:
  - "Confirm whether rule X should become a hard gate."
```

## Blocking Rules

This capability does not block. It records and proposes. The team decides whether a proposed entry becomes a rule.

## Adapter Examples

- **L0**: A redaction checklist inside the retrospective template.
- **L1**: A prompt that walks the retrospective and proposes structured entries.
- **L2**: A slash command that writes proposed entries into the memory index.
- **L3**: A hook that prevents committing a retrospective without a curated section.
- **L4**: A subagent dedicated to memory curation and redaction.

## Anti-Patterns

- Copying the original incident description into the memory index without redaction.
- Recording lessons as long prose instead of structured `phenomenon / root_cause / prevention`.
- Treating curation as optional and never returning to it.
- Burying high-severity lessons inside the same low-priority backlog as cosmetic improvements.
