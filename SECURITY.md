# Security Policy

## Supported Versions

The public project supports the latest released version. Security fixes are expected to land on the default branch first.

## Reporting A Vulnerability

Do not open a public issue containing secrets, credentials, private URLs, customer data, private source code, logs, database exports, or production configuration.

Report security-sensitive findings privately to the repository maintainer through GitHub's private vulnerability reporting feature if it is enabled. If it is not enabled, contact the maintainer through a private channel and share only the minimum information needed to reproduce the issue.

## Scope

In scope:

- initializer behavior that writes unsafe files into a target workspace;
- accidental inclusion of private data in the package;
- sanitizer bypasses;
- command injection or path traversal in local scripts;
- generated adapters that weaken workflow hard gates.

Out of scope:

- vulnerabilities in a target team's private codebase;
- misuse after a user manually edits generated files;
- remote publishing, branch creation, deployment, or database operations, because this project keeps those actions manual-only.

## Sanitization Check

Before publishing or sharing a release:

```bash
npm run check
npm run build:release
node bin/check-sanitized.cjs --extra-banned /path/to/private-denylist.txt
```

Keep the private denylist outside the repository.
