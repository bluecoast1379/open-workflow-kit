# Capability: ci-cd-automation-governor

- **Tier**: recommended
- **Stage**: `/03`, `/04`, `/07`, `/11`; revisit in `/12`
- **Purpose**: Introduce CI/CD and deployment automation in controlled stages, so automation improves repeatability without silently releasing unreviewed or untested changes.

## Why

Personal projects still need disciplined release flow. The risk is not "too much process"; the risk is automation publishing the wrong branch, leaking secrets, skipping App Store/release requirements, or deploying code whose tests do not match the feature scope. CI should start early because it is read-only verification. CD should start manual-gated, then become progressively automated only after the first stable production release and rollback path exist.

## Automation Maturity Model

```yaml
level_0_manual:
  when: "before first production release or when repo has no stable build"
  allowed:
    - local validation commands
    - documented manual deployment checklist
  blocked:
    - automatic deployment
    - production secret writes

level_1_ci_only:
  when: "repo has repeatable build/test commands"
  allowed:
    - branch and pull-request CI checks
    - lint, unit tests, type checks, build checks
    - artifact creation without deployment
  blocked:
    - automatic production deployment

level_2_manual_cd:
  when: "first prod release exists and rollback is documented"
  allowed:
    - manually approved deployment job
    - deployment from main to prod after tests pass
    - tagged release artifacts
  blocked:
    - unattended production deployment

level_3_guarded_auto_cd:
  when: "several stable releases have passed with reliable CI and rollback"
  allowed:
    - automatic non-production preview deployment
    - optional automatic production deployment from prod tags or protected prod branch
  required:
    - branch protection
    - required CI checks
    - environment protection or equivalent manual approval for high-risk changes
    - rollback runbook tested at least once
```

## Branch Flow Contract

Automation must respect the workspace branch model:

- Development branches are created from `prod`.
- CI runs on development branches and on `main`.
- `main` is the testing/integration branch.
- Release promotion goes from `main` to `prod`.
- No separate `test` branch is created for personal projects.
- Production deployment must be tied to `prod` or a release tag produced from `prod`.

## Inputs

- `workflow/team-profile.yaml#branch_model`
- `workflow/team-profile.yaml#risk_policy`
- Target repository package/build/test scripts
- Runtime and deployment provider docs for the target project
- Secret inventory and environment variable list
- Workspace-level `features/{feature}/03-技术架构.md`
- Workspace-level `features/{feature}/07-测试执行.md`
- Workspace-level `features/{feature}/11-上线邮件通知.md`

## Outputs

```yaml
result: PASS | WARN | BLOCK
automation_level: 0 | 1 | 2 | 3
ci:
  required_checks:
    - "<command or workflow>"
  evidence:
    - "<log, URL, or local command output>"
cd:
  deployment_mode: "none" | "manual-gated" | "guarded-auto"
  source_branch: "main" | "prod" | "<tag>"
  target_environment: "preview" | "production"
  rollback_plan: "<path or summary>"
secrets:
  location: "platform secret store only"
  repo_committed_secrets: false
blocked_reason: "..."
recommended_action: "..."
```

## Blocking Rules

- Block automatic production deployment before the first manual production release succeeds.
- Block any deployment automation that can deploy from a development branch directly to production.
- Block production deployment if required CI checks are missing, failing, or not clearly tied to the release commit.
- Block automation that stores secrets in source code, workflow documents, `.env` committed files, logs, screenshots, or prompt transcripts.
- Block deployment from `main` to `prod` unless the release scope has passed `/07-测试执行` and `/11-上线邮件通知` records the rollback plan.
- Block creating a `test` branch as a deployment environment for personal projects; use `main` for testing/integration and provider preview environments for previews.
- Downgrade to WARN when the project has no code yet; require a CI/CD plan document but do not create workflows until implementation begins.

## Adapter Examples

- **L0**: A checklist in `/03` and `/11` stating the automation level, CI commands, deployment trigger, secret storage, and rollback path.
- **L1**: A prompt that asks for package scripts and deployment provider, then drafts a CI/CD plan.
- **L2**: A slash command that validates workflow files against branch and secret rules.
- **L3**: A pre-push or CI policy check that blocks deployment workflow changes without required checks and rollback notes.
- **L4**: A deployment-safety subagent that reviews workflow YAML, provider configuration, release notes, and evidence before promotion.

## Anti-Patterns

- Treating "personal project" as permission to deploy from a laptop without repeatable checks.
- Enabling auto-deploy before the first manual production release proves the runbook.
- Using `main` as both development and production.
- Creating a `test` branch when provider preview environments or `main` integration are enough.
- Committing platform secrets, API keys, provisioning profiles, or App Store credentials.
- Letting CI pass on a different commit than the one promoted to `prod`.
