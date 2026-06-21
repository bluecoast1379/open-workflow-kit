# Workflow Merge Notes

This kit merges two sources of workflow truth:

- The public `open-workflow-kit` package structure, initializer, smoke tests, and shareable installation docs.
- A local full-stage workflow that already included concrete command contracts, the `/02B-UI设计` design gate, document/code separation, `prod -> feature branch -> main -> prod` release governance, CI/CD maturity rules, and multi-tool adapters for Codex, Claude Code, and Cursor.

## Team Workflow Outcome

The team kit keeps the full team delivery sequence:

`/01-需求讨论` -> `/02-产品文档` -> `/02B-UI设计` -> `/03-技术架构` -> `/04-代码实现` -> `/05-代码审查` -> `/06-测试用例` -> `/07-测试执行` -> `/08-验收表格` -> `/09-验收` -> `/10-培训文档` -> `/11-上线邮件通知` -> `/12-复盘总结`.

The initializer now installs concrete command files from `workflow/core/commands/` instead of generating only generic placeholders.

## Guardrails Preserved

- Internal workflow artifacts belong under workspace-level `features/<feature>/`, not inside target source-code repositories.
- UI/frontend work must pass `/02B-UI设计` before `/04A-前端代码实现`, unless a scoped waiver is explicitly recorded.
- Team workflows keep remote Git, push, tag, merge, deployment, database writes, and production config writes as manual-only actions unless a safe adapter is explicitly defined.
- Same-repo parallel implementation requires isolated worktrees after implementation begins.

