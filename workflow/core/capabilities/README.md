# Capabilities

Capabilities are reusable checks. Tools can implement them as prompts, rules, hooks, checklists, or subagents depending on tool capability level. Each capability also has a dedicated file in this directory describing its purpose, inputs, outputs, blocking rules, and adapter examples.

## Capability Levels

| Level | Meaning | Typical implementation |
| --- | --- | --- |
| L0 | Document rules | `AGENTS.md`, core docs |
| L1 | Prompt or checklist | prompts, command templates |
| L2 | Tool-native rules | slash commands, editor rules |
| L3 | Hooks or pre-flight checks | local validators |
| L4 | Multi-agent routing | subagents where available |

## Tier Definition

| Tier | Meaning |
| --- | --- |
| essential | Adopt first; the four capabilities most directly tied to documented incident patterns and the implementation gate. |
| recommended | Adopt in the next iteration; broadens scanning, review, and verification. |
| optional | Adopt when team scale or risk profile demands it. |

## Minimum Capability Set

| Tier | Capability | Purpose | Stage |
| --- | --- | --- | --- |
| essential | [branch-gatekeeper](./branch-gatekeeper.md) | Stop code implementation on wrong branch or wrong stage | `/04` |
| essential | [release-safety-checker](./release-safety-checker.md) | Compare release scope to production baseline evidence | `/05`, `/07`, `/11` |
| essential | [prd-code-diff-checker](./prd-code-diff-checker.md) | Compare product intent to real diff | `/05` |
| essential | [contract-tracer](./contract-tracer.md) | Trace cross-service or frontend/backend contract changes | `/03`, `/05` |
| recommended | [worktree-isolator](./worktree-isolator.md) | Enforce one worktree per active same-repo implementation | `/04` |
| recommended | [repo-baseline-scanner](./repo-baseline-scanner.md) | Record local branch, dirty state, and source-of-truth downgrade | `/03` |
| recommended | [impact-scope-analyzer](./impact-scope-analyzer.md) | Map affected repos, APIs, UI, data, config, and tests | `/03` |
| recommended | [security-reviewer](./security-reviewer.md) | Review credentials, auth, privacy, ACL, config, and audit risk | `/05` |
| recommended | [verify-app](./verify-app.md) | Run or record build, unit, integration, browser, or manual verification | `/04`, `/07` |
| optional | [test-evidence-reviewer](./test-evidence-reviewer.md) | Check whether tests actually prove the required behavior | `/06`, `/07` |
| optional | [ui-baseline-reviewer](./ui-baseline-reviewer.md) | Check UI work against design and frontend rules | `/02`, `/04A`, `/05` |
| optional | [memory-curator](./memory-curator.md) | Summarize reusable lessons without leaking private data | `/12` |
| optional | [rule-extractor](./rule-extractor.md) | Propose generic workflow rule improvements after incidents | `/12` |

## Adoption Guidance

Start with the four essential capabilities to cover the implementation gate and the three most documented incident patterns (release scope drift, PRD vs diff drift, cross-layer contract drift). Add recommended capabilities once the essentials are stable and adapted to the team. Adopt optional capabilities when the team has bandwidth or when specific risk classes (UI debt, security surface, retrospective backlog) become visible.
