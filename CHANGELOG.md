# Changelog

All notable changes to Open Workflow Kit are documented here. Versions follow Semantic Versioning; a section does not imply that a remote tag or registry release already exists.

## 1.0.0 - Unreleased

### Added

- Completion Contract schema, template and Definition Lint for business outcome, organization, scope, domain semantics, quality budgets, requirements, risks, assumptions, governance and stable acceptance criteria.
- Append-only Evidence Ledger with separately reported hash-chain/HMAC verification, signed checkpoint head/count binding, Owner-signed external acceptance anchor, and `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `STALE`, `WAIVED` states.
- Contract, source, environment and explicit findings-review fingerprints; changed inputs invalidate prior evidence or authorization instead of silently reusing PASS.
- `evaluate-dod`, `run-until-done`, resumable run-state, decision packets and escaped local Done Cockpit.
- Command Oracle hardening with `shell:false`, workspace-contained realpaths, Owner-signed Ed25519 execution permits, protected Oracle/executable fingerprints, minimal environment allowlist, budget-capped timeout and hashed output evidence.
- HMAC-attested automated, human and waiver evidence with key-ID policy, complete provenance checks and forged-PASS rejection.
- Versioned environment manifests binding observed runtime, dependencies, services, datasets, models, tools and per-AC fixtures.
- Owner/source/freshness-bound findings manifests; only an explicit reviewed empty list means no open finding, and permit/checkpoint/anchor bind its fingerprint.
- Autonomy budgets for iterations, cumulative elapsed time across resumes, command executions, cost units, base-commit-pinned diff size, repeated failures and no-progress detection.
- Enforced allowed/forbidden path boundaries, preserved-invariant-to-AC traceability and decision-packet scope evidence.
- `/define-done` and `/deliver-until-done`, increasing the command manifest to 23 entries.
- Definition-quality rules, policy packs and capabilities covering business value, organization consensus, UX/human factors, performance/cost, reliability/resilience, security/privacy, observability/operations, reversibility/evolution and AI quality.
- Project-level command adapters for Codex, Claude Code, Cursor, GitHub Copilot, CodeBuddy, Kiro and Trae.
- Adapter conformance checks and Definition-to-Done positive/negative golden examples.

### Changed

- Support matrix schema upgraded to 2.0. All seven adapters use `native_not_yet_manually_certified` until current-version real-tool evidence is recorded.
- API test plan 1.1 adds explicit assertions, captures, bounded retries and response budgets while preserving 1.0 compatibility.
- Initialization, upgrade, smoke and release validation derive adapter entries from the command manifest rather than a hard-coded command count.
- Documentation now separates automated completion, human acceptance and release authorization.
- Codex discovery is documented as Desktop Skill selection or `/skills`/`$skill`, not a Claude-style literal project slash command.
- Cursor commands are pure Markdown, CodeBuddy commands disable model invocation, and Trae emits one tool-owned `.trae/commands/` entry per stage without `.trae/skills/<stage>` or `.trae-cn/` project mirrors. Multi-tool docs disclose that Cursor/Trae may still display Codex's shared `.agents/skills/` in a separate Skills group.
- Upgrade recognizes the exact openone-workflow-kit 0.1.0 command template so retired `08/09/10` entries do not survive beside the current manifest.

### Security

- Repository-provided commands and public hashes cannot authorize themselves; the runner requires an Owner-signed permit bound to a Contract-pinned Ed25519 public-key fingerprint.
- Shell interpreters, shell fields and workspace-escaping Oracle paths are blocked.
- Expired waivers and fingerprint mismatches become `STALE`; WAIVED remains distinguishable from PASS.

### Migration notes

- Re-run `agent-workflow-init --upgrade` to generate all 23 command entries and the current project-level adapter paths.
- Replace legacy Trae instruction, stage Skills and `.trae-cn/` project mirrors with one `.trae/commands/` entry per stage; Trae CN reads the same project path.
- Do not copy old PASS evidence into a new Contract. Initialize or migrate `features/<feature>/completion/`, then rerun Oracle checks under the new fingerprints.
- A 1.0.0 tag or registry package may be referenced only after a maintainer explicitly publishes it.

## 0.9.x

The 0.9 line introduced manifest-driven command discovery and multi-tool adapters. Its 21-command layout, older support split and Trae instruction-file path are superseded by 1.0.0.
