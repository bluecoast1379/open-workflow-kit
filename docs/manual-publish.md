# Manual Publish Guide

Agents must not create remote repositories, push commits, create tags, or publish packages automatically. Use this guide as a manual checklist after `npm run build:release` passes.

## Current Local Release

```bash
cd /path/to/open-workflow-kit
npm run check
npm run build:release
cat dist/RELEASE_MANIFEST.md
```

The shareable local archive is:

```text
dist/agent-workflow-starter-kit-0.1.0.tgz
```

## Option A: Share The Tarball Directly

Send the `.tgz` file and `dist/RELEASE_MANIFEST.md` through your approved file-sharing channel.

Receiver install command:

```bash
cd /path/to/target-workspace
npm install --no-audit --no-fund /path/to/agent-workflow-starter-kit-0.1.0.tgz
./node_modules/.bin/agent-workflow-init --target . --tools codex,claude,cursor,codebuddy,trea --yes
```

## Option B: Publish To A Git Repository

Manual steps:

```bash
cd /path/to/open-workflow-kit
git add .
git commit -m "Prepare open workflow kit for public release"
git branch -M main
git remote add origin git@github.com:bluecoast1379/open-workflow-kit.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

Receiver install command from Git:

```bash
cd /path/to/target-workspace
npx --yes --package git+https://github.com/bluecoast1379/open-workflow-kit.git agent-workflow-init --target . --tools codex,claude,cursor
```

If `origin` already exists, verify it manually with `git remote -v` instead of adding it again. If tag `v0.1.0` already exists locally, move or recreate it only after confirming the release commit is the intended one.

## Option C: Publish To A Package Registry

Manual steps:

```bash
cd /path/to/open-workflow-kit
npm login
npm publish --access public
```

Receiver install command from registry:

```bash
cd /path/to/target-workspace
npx --yes --package agent-workflow-starter-kit agent-workflow-init --target . --tools codex,claude,cursor
```

## Required Before Any Remote Publication

- Run `npm run check`.
- Run `npm run build:release`.
- Run private denylist scanning with `bin/check-sanitized.cjs --extra-banned <private-file>`.
- Review `dist/RELEASE_MANIFEST.md`.
- Review every file included in the tarball.
- Confirm Apache-2.0 is acceptable, or update license files before publishing.
- Confirm no private examples, company documents, customer data, logs, SQL, URLs, or repository names are included.
- Review [Maintainer Handoff](./maintainer-handoff.md) and keep remote publication manual-only.
