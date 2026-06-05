# Publication Decisions

The starter kit is ready for local validation and local release packaging. Remote publication is still manual-only.

## Required Decisions

| Decision | Options | Current |
| --- | --- | --- |
| License | MIT / Apache-2.0 / internal custom / dual license | Apache-2.0 |
| Distribution channel | public Git repository / private Git repository / package registry / template repository / documentation site | manual decision before remote publication |
| Package name | `agent-workflow-starter-kit` or renamed project brand | draft |
| Contribution model | closed / issue-only / pull requests accepted / contributor license agreement required | issue-only recommended for first public trial |
| Support boundary | best-effort / internal-only / paid support / no support | best-effort recommended |
| Telemetry | none / local-only logs / opt-in analytics | none |
| Private examples | excluded / separate private add-on | excluded |

## Recommended Default For First External Trial

- Use Apache-2.0.
- Keep telemetry disabled.
- Share a read-only archive or private repository with one trusted pilot team before broad publication.
- Require the pilot team to run `agent-workflow-init --target . --yes` and fill `workflow/INITIALIZATION_QUESTIONS.md`.
- Collect feedback before broad public announcement.

## Before Public Release

1. Run `npm run check`.
2. Run `npm run build:release`.
3. Run a private denylist scan from a local file outside the starter kit.
4. Manually review all distributable files and `dist/RELEASE_MANIFEST.md`.
5. Create a clean release tag manually.
6. Publish or push manually according to the selected channel.

Agents must not perform the publish, push, tag, or remote repository creation step automatically.

Manual command examples are maintained in `docs/manual-publish.md`.
