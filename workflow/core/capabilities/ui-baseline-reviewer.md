# Capability: ui-baseline-reviewer

- **Tier**: optional
- **Stage**: `/02`, `/04A`, `/05`
- **Purpose**: Check UI work against the design baseline, the frontend code rules, and the consistency between display, validation, submission, and backend representation.

## Why

UI work has a recurring failure pattern: the screen looks correct, but field semantics drift across the four touchpoints of display, client-side validation, submission payload, and backend persistence. A dedicated reviewer enforces a "four-touchpoint" check before the UI is signed off.

## Inputs

- The design references declared in `workflow/team-profile.yaml#source_materials.ui_specs`
- The frontend rules declared in `workflow/team-profile.yaml#source_materials.frontend_rules`
- The implementation diff for the UI surfaces in scope

## Outputs

```yaml
result: PASS | WARN | BLOCK
fields:
  - field: "<field name>"
    display: ok | mismatch | unknown
    client_validation: ok | mismatch | missing
    submission_payload: ok | mismatch | missing
    backend_representation: ok | mismatch | unknown
    verdict: pass | drift | block
style_consistency:
  - rule: "<rule>"
    status: ok | violation
    file: "<path>"
```

## Blocking Rules

- Block when any field shows drift across any two of display, client validation, submission, and backend representation.
- Block when the design tokens or layout rules in the design baseline are violated for a primary surface.
- Downgrade to WARN when the team has explicitly accepted a deviation and recorded the rationale.

## Adapter Examples

- **L0**: A four-touchpoint table inside the UI review section.
- **L1**: A prompt that asks the reviewer to fill the table per field.
- **L2**: A slash command that scaffolds the table and links to the diff.
- **L3**: A linter or screenshot diff that fires on UI files.
- **L4**: A subagent that walks the UI tree and proposes the verdict.

## Anti-Patterns

- Approving the UI by inspection of the screen alone.
- Treating client validation as a substitute for backend validation.
- Letting the submitted payload silently drift from the rendered fields.
- Skipping the four-touchpoint check on "small" UI tweaks.
