# Capability: security-reviewer

- **Tier**: recommended
- **Stage**: `/05`
- **Purpose**: Review the security surface of a change, focusing on credentials, authentication, authorization, privacy, audit, and configuration that influence the production blast radius.

## Why

Security regressions rarely appear in functional tests. A dedicated review pass with a small, explicit checklist catches the cases that ordinary feature review misses: credentials added to plaintext, authorization predicates removed, audit fields skipped, configuration files moved from secret storage to source control.

## Inputs

- The real Git diff
- `workflow/team-profile.yaml#risk_policy.high_risk_files`
- The team's compliance requirements declared in `team-profile.yaml`
- Existing security baseline documents referenced by the team profile

## Outputs

```yaml
result: PASS | WARN | BLOCK
findings:
  - category: credentials | auth | authz | privacy | audit | config | dependency
    severity: P0 | P1 | P2 | P3
    file: "<path>"
    summary: "..."
    recommendation: "..."
compliance:
  - requirement: "<e.g. data export rule>"
    status: satisfied | unclear | violated
    evidence: "..."
```

## Blocking Rules

- Block when credentials, tokens, or private keys appear in the diff.
- Block when authorization predicates are removed or weakened on endpoints that handle user data, money, or admin actions.
- Block when audit, retention, or access-log calls are removed.
- Downgrade to WARN when a high-risk configuration file is modified within scope but the change is documented and reviewed.

## Adapter Examples

- **L0**: A small checklist inside `05-代码审查.md` template.
- **L1**: A prompt that walks the categories above and asks for evidence for each.
- **L2**: A slash command that runs the checklist and returns a structured report.
- **L3**: A pre-commit or pre-merge hook that scans for credential patterns and high-risk file edits.
- **L4**: A subagent that focuses on this surface and returns a verdict that the reviewer combines with other findings.

## Anti-Patterns

- Combining security review with general code review and skipping security checks under time pressure.
- Treating "no test failure" as evidence of secure behavior.
- Ignoring removed audit calls because the new code "still functions".
- Failing to record an unclear compliance verdict and silently moving forward.
