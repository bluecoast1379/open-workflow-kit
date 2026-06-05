# Capability: impact-scope-analyzer

- **Tier**: recommended
- **Stage**: `/03`
- **Purpose**: Map the affected surface of a feature across repositories, APIs, UI, data, configuration, jobs, and tests, so that subsequent stages do not silently miss a layer.

## Why

Feature scope is rarely confined to a single layer. A change that "only updates a UI label" can hide changes in API contracts, persistence, batch jobs, and analytics. Producing an explicit impact matrix at the architecture stage prevents later stages from inheriting an undercounted scope.

## Inputs

- The PRD and the architecture document
- `workflow/team-profile.yaml#repos[*].family`
- Local code references found in the affected repositories

## Outputs

```yaml
result: PASS | WARN
impact_matrix:
  api:
    affected: ["<endpoint>"]
    notes: "..."
  ui:
    affected: ["<screen or component>"]
    notes: "..."
  data:
    affected: ["<table or collection>"]
    migration_required: true | false
  config:
    affected: ["<config key>"]
    high_risk: true | false
  jobs_or_messaging:
    affected: ["<job or topic>"]
  tests:
    affected_suites: ["<suite>"]
unknowns:
  - "<layer>: needs confirmation"
```

## Blocking Rules

This capability does not block. It exposes scope so that branch and stage gates, PRD/diff comparison, and release safety checks can use a complete map. Unknowns must be recorded explicitly rather than left implicit.

## Adapter Examples

- **L0**: A required table in `03-技术架构.md`.
- **L1**: A prompt that walks through each layer and asks for evidence.
- **L2**: A slash command that prefills the table based on detected references.
- **L3**: A hook that flags PRs which change a layer not listed in the impact matrix.
- **L4**: A subagent that produces the matrix and updates it as the diff evolves.

## Anti-Patterns

- Listing only the obvious surface and treating other layers as "no change".
- Recording the matrix once at the architecture stage and never revisiting it.
- Omitting `config` and `jobs_or_messaging` from the matrix because they are "invisible to users".
- Marking unknowns as "no change" instead of recording them as unknowns.
