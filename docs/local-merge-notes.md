# Workflow Integration Notes

This document records the generic integration decisions behind Open Workflow Kit 1.0. It contains no machine-specific path, private repository, fixed organization branch name, or claim that a remote release exists.

## Sources of truth

- `workflow/core/command-manifest.yaml`: the 23 cross-tool commands.
- `workflow/core/commands/`: stage contracts and hard gates.
- `workflow/core/schemas/` and `workflow/core/templates/`: Completion Contract, Evidence Ledger and run-state formats.
- `workflow/core/capability-manifest.yaml`: machine-readable capability routing.
- `workflow/core/rules/`: delivery and definition-quality rules.
- `workflow/adapters/support-matrix.yaml`: project-level paths, discovery surfaces and verification status.
- `workflow/team-profile.yaml`: the target workspace's branch, repository, toolchain and policy requests.

No adapter is allowed to become a second workflow core.

## Delivery sequence

A typical feature moves through:

`/new-feature` → `/01-需求讨论` → `/02-产品文档` → `/02B-UI设计` → `/03-06-研发准备`（或 `/03-技术架构` → `/06-测试用例`，Oracle 均为 `NOT_RUN`）→ `/define-done` → `/deliver-until-done`（或显式 04 → 05 → 07）→ `/08-验收表格` → `/09-验收` → `/10-培训文档` → `/11-上线邮件通知` → `/12-复盘总结`.

`/02C-HTML原型` is optional after the UI baseline. `/03-06-研发准备` produces readiness documents only and never authorizes implementation. `/workflow-status` can be invoked at any point.

## Guardrails preserved

- Workflow artifacts live under workspace-level `features/<feature>/`, separate from source repositories unless a public release artifact is explicitly scoped.
- UI/frontend work must pass `/02B-UI设计` before `/04A-前端代码实现`, except for a recorded, narrow design waiver.
- Completion Contract must be frozen before autonomous delivery; changing it invalidates prior evidence.
- Automated completion ends at `READY_FOR_HUMAN_ACCEPTANCE`; human acceptance and release authorization remain separate.
- Branch names and release flows come from `team-profile`; the kit does not hard-code `main`, `master`, `prod` or a fixed promotion chain.
- Same-repository parallel implementation uses isolated worktrees after implementation begins.
- Remote Git, deploy, database writes, production configuration and package publication require the execution policy and explicit authorization; repository configuration cannot grant them by itself.

## Adapter outcome

Codex, Claude Code, Cursor, GitHub Copilot, CodeBuddy, Kiro and Trae receive manifest-driven project entries. Trae and Trae CN use the same project `.trae/commands/` path. The current support state is `native_not_yet_manually_certified` for all seven platforms: generated conformance is covered, but real-client certification remains a versioned manual activity.
