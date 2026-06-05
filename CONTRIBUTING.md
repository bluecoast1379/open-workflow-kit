# Contributing

Thanks for improving Agent Workflow Starter Kit. This project keeps the workflow core generic, local-first, and tool-agnostic.

## Before You Open A Pull Request

Run:

```bash
npm run check
npm run build:release
```

Also inspect the generated release manifest:

```bash
cat dist/RELEASE_MANIFEST.md
```

## Privacy Rules

Do not contribute:

- private company names or internal project names;
- real repository names from a private workspace;
- customer, employee, learner, patient, account, payment, or operational records;
- production URLs, internal domains, logs, SQL exports, screenshots, credentials, tokens, or private keys;
- incident details that can be traced back to a real organization.

Examples must be synthetic and replaceable. If a rule came from a private incident, generalize the mechanism and remove identifying facts before proposing it.

## Change Scope

- Put tool-neutral behavior in `workflow/core/`.
- Put team-specific configuration examples under `examples/`.
- Put tool-specific behavior in adapters or initializer generation logic.
- Keep adapters thin; they must not weaken core hard gates.
- Keep remote Git, branch creation, push, package publication, deployment, and database writes manual-only.

## Pull Request Checklist

- The change is generic and not tied to one private organization.
- `npm run check` passes.
- `npm run build:release` passes.
- New or changed examples are synthetic.
- Documentation explains migration or compatibility impact when generated file layout changes.
- No generated `dist/` files are committed unless the maintainer explicitly asks for a release artifact commit.

## Commit History

Before public publication, maintainers should inspect commit messages and changed files for private references. If private data ever enters history, rewrite the unpublished history before pushing, or rotate the affected secret if the data was sensitive.
