# External Release Checklist

Use this checklist before publishing the starter kit to a public repository, package registry, template repository, or document site.

## Required

- `npm run check` passes from `open-workflow-kit/`.
- `npm run build:release` passes and leaves only `dist/agent-workflow-starter-kit-<version>.tgz` plus `dist/RELEASE_MANIFEST.md`.
- `install.sh` is executable and can initialize a target workspace through the same `bin/init-workspace.cjs` entry.
- A private denylist scan has been run with `--extra-banned` from a local file that is not committed.
- No company names, internal paths, real repository names, real URLs, credentials, customer data, logs, SQL, or incident originals are present in the distributable.
- `package.json#license` is Apache-2.0, or a deliberately chosen replacement license is documented.
- License text is present if a public license is chosen.
- `NOTICE` is present.
- `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` are present and generic.
- `.github/` issue, pull request, and CI templates are present for the source repository.
- README and INIT instructions use generic examples only.
- `docs/maintainer-handoff.md` is current and uses generic examples only.
- Generated examples are synthetic and cannot be traced to a real customer, employee, project, incident, or production system.
- Tool adapters only point to workflow core and do not weaken hard gates.
- The initializer does not perform remote Git operations, branch creation, push, build/deploy triggers, database writes, or production config writes.

## Private Denylist Scan

Create a local file outside the starter kit, then run:

```bash
node open-workflow-kit/bin/check-sanitized.cjs --extra-banned /path/to/private-denylist.txt
```

The private denylist should include company names, internal repository prefixes, internal systems, customer names, private domains, sensitive business terms, and known incident names. Do not commit that file into the starter kit.

## Manual Review

Automated scanning is not enough. A human reviewer must still inspect:

- `README.md`
- `INIT.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/`
- `workflow/core/`
- `templates/`
- `examples/`
- `docs/`
- `bin/init-workspace.cjs`
- `bin/check-sanitized.cjs`
- `dist/RELEASE_MANIFEST.md` after local release build
- `docs/manual-publish.md`
- `docs/maintainer-handoff.md`

## Release Decision

Do not publish until these decisions are explicit:

- public repository or private share;
- license changes from Apache-2.0, if any;
- issue and contribution policy;
- versioning policy;
- support boundary;
- whether commercial/internal variants will exist.
