# Workflow Core

`workflow/core` is the tool-agnostic part of the workflow. It defines stages, gates, templates, and reusable checks. It must not contain company-specific business facts, internal repository names, private URLs, credentials, customer data, or tool-specific private capabilities.

## Core Rules

- Source of truth is local evidence: code, docs, test output, runtime evidence, and team-profile paths.
- Keep verified facts separate from assumptions, design intent, and missing evidence.
- Business code implementation requires both:
  - a valid feature branch or registered implementation worktree;
  - an explicit implementation stage request (`/04`, `/04A`, or `/04B`).
- Remote Git refresh, branch creation, push, tag, merge, build/deploy triggers, database writes, and production config writes are manual-only.
- Same-repository parallel implementation must use separate worktrees after implementation stage begins.
- Tool adapters may enhance or downgrade behavior, but they must not weaken core gates.

## Directory Map

- `commands/`: stage command contracts.
- `templates/`: generic document templates.
- `capabilities/`: reusable checks such as branch gates, release safety, PRD/diff consistency, and test evidence review.

## Team Specialization

Do not edit core files to add team-specific business facts. Put those facts in:

- `workflow/team-profile.yaml`
- local business docs referenced by the profile
- feature documents under `features/{feature}/`
