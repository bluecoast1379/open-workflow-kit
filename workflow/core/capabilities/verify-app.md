# Capability: verify-app

- **Tier**: recommended
- **Stage**: end of `/04`; throughout `/07`
- **Purpose**: Replace "I think it works" with an executed verification plan, recording build, unit, integration, browser, or manual evidence appropriate to the technology stack.

## Why

Verification quality is the single largest lever on review outcome. A documented verification loop, even a small one, repeatedly distinguishes "looks like it works" from "actually works". The loop must be tailored to the technology stack rather than a single global recipe.

## Inputs

- `workflow/team-profile.yaml#repos[*].tech_stack`
- The implementation scope from `04-代码实现.md`
- Available CI commands, local scripts, and manual procedures
- The verification commands recorded in previous successful runs

## Outputs

```yaml
result: PASS | WARN | BLOCK
verifications:
  - repo: "<repo>"
    method: unit | integration | e2e | manual | build-only
    command: "<command actually run>"
    status: pass | fail | not-run
    evidence: "<log path, screenshot path, or recorded observation>"
gaps:
  - "<repo>: integration test not available; recorded as not-run."
recommended_followup:
  - "..."
```

## Blocking Rules

- Block when the implementation stage closes with no successful verification on any affected repository and no recorded reason.
- Downgrade to WARN when the tech stack supports only manual verification and the user has explicitly confirmed the result.
- Always record `not-run` rather than skipping the entry silently.

## Adapter Examples

- **L0**: A required verification section in `04-代码实现.md`.
- **L1**: A prompt that proposes the verification command based on the detected tech stack and asks the user to run it.
- **L2**: A slash command that runs the verification and writes the result back into the feature document.
- **L3**: A hook that prevents marking implementation as done until verification status is recorded.
- **L4**: A subagent that owns verification, executes the runner, and posts the structured result.

## Anti-Patterns

- Marking implementation as complete with no verification evidence.
- Pasting a passing log without naming which command produced it.
- Claiming a manual test passed without describing the exact steps.
- Using a single recipe across stacks that need different verification approaches.
