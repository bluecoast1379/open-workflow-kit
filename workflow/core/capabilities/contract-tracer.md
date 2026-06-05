# Capability: contract-tracer

- **Tier**: essential
- **Stage**: `/03`, `/05` (architecture, review)
- **Purpose**: Trace contracts that cross service, layer, or frontend/backend boundaries so that reviewers do not stop at DTOs, method signatures, or compatibility annotations.

## Why

Cross-layer contract drift is a documented cause of review escapes: a value tagged "compatible" in the API doc may flow through two different downstream paths, and a money or identity field may be filtered correctly at the facade but lost at the data layer. Forcing the reviewer to follow the call chain end to end catches the cases where the surface looks fine but the deep behavior diverges.

## Inputs

- The PRD and technical plan for the current feature
- The real Git diff
- The call graph or static analysis for the affected modules (when available)
- Cross-repo facade or contract files referenced by `workflow/team-profile.yaml#repos[*].family`

## Outputs

```yaml
result: PASS | WARN | BLOCK
contracts:
  - name: "<contract or facade>"
    upstream_entry: "<file:line>"
    downstream_terminals:
      - "<file:line>"
      - "<file:line>"
    filters_or_predicates:
      - "<file:line> applies <predicate> on <field>"
    verdict: pass | drift | block
    notes: "..."
missing_traces:
  - "<contract>: terminal not located"
recommended_action: "Read the actual terminal query, persistence call, or rendering call for each contract listed above."
```

## Blocking Rules

- Block when a contract that touches money, ordering, identity, or access scope cannot be traced to its actual terminal.
- Block when two entries declared as "compatible" have divergent downstream behavior (different filters, different defaults, different error semantics).
- Downgrade to WARN when the trace stops at a third-party library that the team has flagged as out of scope; record the gap explicitly.

## Adapter Examples

- **L0**: A review rule that says "no money or identity contract closes review on DTO inspection alone."
- **L1**: A prompt that asks the reviewer to paste the trace from the entry to the terminal query.
- **L2**: A slash command that scaffolds the trace table and prompts the reviewer to fill it.
- **L3**: A static analysis hook that records and surfaces the call chain.
- **L4**: A subagent that follows references across files and returns the traced terminals.

## Anti-Patterns

- Stopping at the DTO or method signature.
- Trusting an "compatible" annotation without examining both entries.
- Assuming the data layer applies the same filter as the facade.
- Treating a passing unit test as a substitute for the actual end-to-end trace.
