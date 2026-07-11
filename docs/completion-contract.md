# Completion Contract

Completion Contract 是 feature 的可执行 Definition of Done。它不是 PRD 的摘要，而是把目标、技术边界、质量预算、证明方法和人类权限编译为一份可 lint、可 fingerprint、可复验的契约。

默认位置：

```text
features/<feature>/completion/contract.yaml
```

## 为什么需要 Contract

传统验收语句常把“快速”“稳定”“好用”“智能”当成完成标准。它们没有阈值、环境、样本、失败条件或责任人，agent 无法知道什么时候停止，也容易通过改测试或降低标准制造“完成”。

Contract 把完成拆成四个可验证层次：

1. **Outcome**：为什么做、North Star 如何计算、baseline 与 target 是什么、多久观察一次、哪些 guardrail 不能恶化。
2. **System definition**：允许修改什么、禁止修改什么、哪些不变量必须保留，数据如何流动、状态如何迁移、哪个源是权威源。
3. **Quality budgets**：体验、性能、成本、可靠性、韧性、安全、隐私、可观测性、可逆性、演进和 AI 质量各自的硬约束。
4. **Proof**：每个 `AC-###` 的 Given/When/Then、Oracle、证据、环境、优先级、blocking 和 human gate。

## 创建与校验

```bash
node workflow/bin/check-completion-contract.cjs \
  --init \
  --feature example-feature \
  --workspace .
```

初始化不会覆盖已有 `contract.yaml` 或 `run-state.yaml`。填写后校验：

```bash
node workflow/bin/check-completion-contract.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --json
```

机器会输出 `contract_hash`、AC 数量、error、warning 和精确字段路径。只有 error 为 0 才能进入实现闸门；warning 仍应有 Owner、期限与不阻断理由。

## 必填结构

### Policy packs

每个 feature 至少启用 `standard`，并按风险叠加：

- `regulated-sensitive-data`：身份、位置、健康、金融、未成年人或其他敏感数据；
- `public-contract`：对外 API、事件、schema、SDK 或 consumer 兼容；
- `ai-feature`：LLM、模型、prompt、RAG、embedding 或 agent tool use；
- `user-facing-experience`：显著 UI、付费、广告、通知或行为引导；
- `high-risk-change`：生产数据迁移、不可逆状态、账务、支付或高可用。

多个 pack 取并集和最严格约束；冲突时生成 decision packet，agent 不能自行选择宽松项。Pack 可以由 `team-profile#risk_policy.policy_packs` 或 Contract 显式启用，也可由 `applies_when` 建议，但任何 pack 都只能收紧 core 和 execution policy。

### Feature 与 outcome

- `feature.id`：跨版本稳定，不得被复用到另一个目标。
- `feature.contract_version`：冻结后修改必须递增。
- `feature.objective`：一句可证伪的用户或业务结果。
- `feature.non_goals`：明确不做什么，即使为空也必须写数组。
- `objective.problem/target_users/success_definition`：把问题、对象和业务成功含义拆开，避免一句口号承担三种语义。
- `outcome`：North Star、baseline、target、observation window 和至少一个 guardrail。

“提高转化率”不够；应写成类似“在同一事件口径下，实验组 14 日激活率从 31% 提升到至少 36%，退款率不得增加超过 0.5 个百分点”。如果目标只能上线后观察，应把上线前自动完成与上线后商业验收分成不同 AC。

### 组织与术语

- `stakeholders`、`approvers` 和 `operational_owner` 分别说明受影响者、谁能改变/签收契约、上线后谁负责。
- `organization` 显式定义 DRI、decision owner、reviewers、dependency owners 和 escalation path；不适用也要写理由。
- `glossary` 消除同一个词在产品、研发、财务、法务和运营中的不同含义。
- `assumptions` 使用稳定 ID，并记录 statement、Owner、验证方法和到期日；`requirements` 使用 `REQ-###`，`risks` 使用 `RISK-###`。
- blocking unknown 必须有 `owner` 与 `validation_method`，建议给 deadline；未解决时会阻断自动完成。

### Scope 与领域模型

- `source_paths` 决定 source fingerprint 的输入，必须使用工作区内相对路径。
- `allowed_paths` 是实现授权范围，`forbidden_paths` 是硬禁止范围。
- `preserved_invariants` 记录不可为“通过验收”而破坏的行为；`invariant_acceptance_refs` 必须把每条 invariant 映射到至少一个实际 AC，不能只写口号。
- `domain.entities/data_flows/state_machines/sources_of_truth` 明确数据归属、状态、并发、一致性、幂等和恢复语义。

Completion runtime 自身的 ledger、run-state、decision packet 和 cockpit 只按内核保留的精确路径从 source fingerprint 中排除，避免“写入证据导致证据立即过期”的循环。v1 禁止自定义 `fingerprint_excludes`；不得排除真实实现、测试或其他任意路径来规避失效。

### Quality budgets

以下 canonical 分组必须是非空 object；不适用时写明确 `reason`，不能留空：

- `business`：North Star、收入/成本/风险结果与 guardrail；
- `ux`：任务完成、错误恢复、WCAG 或平台标准、键盘、读屏、对比度；
- `performance_cost`：p95/p99、吞吐、资源、测试环境、样本，以及单次/周期成本上限；
- `reliability_resilience`：错误率、可用性、幂等、重试、部分失败、恢复与容量；
- `security_privacy`：威胁、权限、漏洞门槛、数据最小化、保留、导出、删除和审计；
- `observability_operations`：日志、metric、trace、告警、runbook 与运行责任；
- `reversibility_evolution`：feature flag、kill switch、RTO/RPO、API/schema 兼容、迁移、弃用和回滚；
- `ai_quality`：黄金集、随机性、幻觉率、延迟、成本、模型/提示词版本，或不适用原因。

### Acceptance criteria

每条 AC 使用永不复用的稳定 ID：

```yaml
acceptance:
  - id: "AC-001"
    priority: "P0"
    blocking: true
    human_gate: false
    requirement_refs: ["REQ-001"]
    risk_refs: ["RISK-001"]
    dimensions:
      - "functional"
      - "negative-boundary"
      - "recovery"
      - "regression"
    given: "测试依赖已锁定，fixture 版本为 3"
    when: "在 test 环境执行导出一致性检查"
    then: "1000 条 fixture 的字段一致率为 100%，退出码为 0"
    threshold: "1000/1000 条 fixture 字段一致，且 exit code = 0"
    environment:
      name: "locked-node-test"
      runtime: "Node.js 20.x"
    fixture:
      dataset: "export-fixture-v3"
      sample_size: 1000
    freshness:
      max_age_minutes: 60
    evidence_required:
      - "退出码、断言摘要和三个 fingerprint"
    oracle:
      type: "command"
      command: "npm"
      args: ["run", "test:export"]
      cwd: "."
      timeout_ms: 120000
      expected_exit_code: 0
      integrity_paths:
        - "package.json"
        - "test/export-consistency.cjs"
      integrity_fingerprint: "sha256:<64-hex-computed-value>"
```

`integrity_fingerprint` 不得手填猜测值。在 Contract 仍为 draft、字段中仍有 placeholder 时，先从 workspace 根目录计算指定 command Oracle 的完整性指纹：

```bash
node workflow/bin/check-completion-contract.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --print-oracle-integrity \
  --cwd . \
  --criterion AC-001
```

CLI 先将 Oracle 的相对 `cwd` 解析到 `--cwd` 指定的 workspace 内，再按 `integrity_paths` 的路径与文件内容计算确定性 SHA-256 fingerprint。输出中只有 `usable_for_freeze: true` 才能写回对应 `integrity_fingerprint`；缺失、symbolic link、非 regular file、越出 workspace 或含 `..` 的路径都不可冻结。写回后必须再执行完整 Contract lint；任一 integrity file 变化都必须重新计算、复核并重签 permit。

规则：

- P0/P1 必须有非空 `evidence_required`。
- 每个 AC 至少关联一个存在的 `REQ-###`，并显式列出 `risk_refs`；P0/P1 requirement 不能成为无人验证的孤儿。
- `blocking: true` 表示不满足就不能进入成功终态。
- `human_gate: true` 必须使用 `manual` Oracle 和逐项 rubric；runner 不能代签。
- 每份可自主交付的 Contract 至少包含一条 blocking manual human gate，保证 runner 永远只能到 `READY_FOR_HUMAN_ACCEPTANCE`。
- command Oracle 必须是单一 executable 加参数数组；禁止 `shell` 字段、shell 解释器、NUL 和换行。
- `cwd` 必须留在传入的 workspace 内。
- file Oracle 可检查工作区内相对路径；API、browser、metric Oracle 可作为 Contract 定义，但需要相应受信 executor 产出 ledger evidence。当前本地 runner 直接执行 command 与 file Oracle。
- 形容词必须转换为数值阈值或可逐项签收的人工 rubric。

## Contract 冻结与变更

冻结后改变目标、范围、AC、blocking、阈值、human gate、fingerprint 输入或质量预算，都属于 contract change：

1. 生成 decision packet，说明变更原因、影响和决定者。
2. 由 `approvers` 中有权角色批准。
3. `contract_version` 递增。
4. 重新计算 `contract_hash`。
5. 旧 contract hash 上的证据自然变成 `STALE`，受影响 Oracle 必须重跑。

Agent 可以发现矛盾并起草 diff，但不能自行批准变更。不得通过删除 AC、把 blocking 改成 false、降低阈值、放宽 scope、排除源文件、改测试适配错误实现或扩大 waiver 来收敛。

`governance` 必须显式记录 `status`、`change_approval`、`evidence_invalidation`、`waiver_policy` 和 `anti_cheating`。`draft` 可以 lint，但不得进入自主交付；只有 `frozen` 才表示人类已冻结当前版本。

`feature.status` 与 `governance.status` 必须一致；部分冻结会被拒绝。自主执行还要求 `execution_authorization`：Owner 控制的 Ed25519 public key fingerprint、key ID 和最长 permit 有效期。短期 permit 绑定 contract/environment/base/scope、完整 command spec、resolved executable fingerprint 与精确预算，取代可由 Agent 自行复制的公开 allowlist hash。`ledger_anchor` 则定义最终 head/count 的独立 Owner、签名公钥与工作区外存储位置。

## Evidence Ledger

默认位置：

```text
features/<feature>/completion/evidence/ledger.jsonl
```

每条 entry 包含 sequence、previous hash、entry hash、observed time、AC ID、status、三个 fingerprint、executor provenance 和 evidence manifest。所有 runner 记录都由 HMAC-SHA256 attestation 绑定 sequence/previous hash；automation key 与 human/waiver key 互斥并映射到明确 principal，密钥至少 32 bytes、只从仓库外环境变量读取且读取后即从环境移除。可选 `artifacts` 以工作区内相对路径加 SHA-256 绑定截图、报告或产物；文件缺失、过大、被换成 symlink、realpath 越界、类型改变或 hash 变化会使证据失效。验证 hash chain：

```bash
node workflow/bin/evidence-ledger.cjs verify \
  --ledger features/example-feature/completion/evidence/ledger.jsonl \
  --attestation-key automation-local-v1=OWK_AUTOMATION_KEY \
  --attestation-key human-owner-v1=OWK_HUMAN_KEY
```

若不提供 key，CLI 只报告 `chain_valid`，并明确把 `attestation_valid` 和整体 `valid` 置为 `null`；不得把“链结构有效”误报为“HMAC 已验证”。

追加人工证据时必须同时提供 Contract、workspace 和版本化 environment manifest，不允许脱离当前三个 fingerprint 写入：

```bash
node workflow/bin/evidence-ledger.cjs append \
  --ledger features/example-feature/completion/evidence/ledger.jsonl \
  --entry /owner-controlled/example-feature/human-evidence.json \
  --contract features/example-feature/completion/contract.yaml \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --cwd . \
  --attestation-key-id human-owner-v1 \
  --attestation-key-env OWK_HUMAN_KEY
```

状态语义：

| 状态 | 含义 |
| --- | --- |
| `PASS` | Oracle 在当前 contract/source/environment 上满足 |
| `FAIL` | Oracle 已执行且断言失败 |
| `BLOCKED` | 由于权限、allowlist、环境或前置条件无法执行 |
| `NOT_RUN` | 当前组合没有证据 |
| `STALE` | 证据存在，但 contract、source、environment 已变化，或 waiver 已过期 |
| `WAIVED` | 有权人员在限定范围和期限内批准例外；它保留为 WAIVED，不伪装成 PASS |

DoD 只读取每个 AC 的最新 entry。Ledger 是单 writer append-only：append 使用锁文件、fsync 和事后链验证；修复、重跑和失效都追加新记录，不覆盖历史。Hash chain/HMAC 能发现内容与顺序篡改，但不能单独发现整个 ledger + checkpoint 被一起回滚到旧前缀；最终 `ACCEPTED` 还必须核对由独立 Owner 在 Agent 工作区之外签发和保存的 Ed25519-signed head/count anchor。允许的 key ID/principal、Oracle hash、完整断言、人工 signer 与逐项 rubric 共同证明成功证据来源，缺一即 `BLOCKED`。

如果 writer 崩溃后留下 `.lock`，不得直接删除或自动越锁追加。先确认 append 冲突输出的精确 32 位 token，再执行显式恢复：

```bash
node workflow/bin/evidence-ledger.cjs recover-lock \
  --ledger features/example-feature/completion/evidence/ledger.jsonl \
  --lock-token <32-hex-token> \
  --min-age-ms 60000
```

`recover-lock` 只隔离同一主机、已达最小年龄、token 未变且 writer PID 已退出的 lock；writer 仍存活、lock 来自其他主机、JSON 损坏或检查期间变化都会拒绝恢复。被隔离的 stale lock 保留供审计；恢复后仍需先运行 `verify` 再继续 append。

## Waiver

Waiver 默认禁止。对应 AC 必须先在冻结 Contract 中限定策略，例如：

```yaml
waiver:
  allowed: true
  approvers: ["release-owner"]
  scopes: ["仅 AC-007 的指定设备矩阵"]
  max_expiry_days: 7
```

未允许 waiver、批准人不在 allowlist、scope 不在 allowlist 或期限超过策略时，evaluator 会把它判为 `BLOCKED`。有效 waiver entry 至少包含：

```yaml
waiver:
  approved_by: "release-owner"
  scope: "仅 AC-007 的指定设备矩阵"
  reason: "外部测试设备在本窗口不可用，已启用等价补偿控制"
  compensation: "由独立设备实验室在到期日前补跑；发布期间保持 kill switch"
  expires_at: "2030-01-01T00:00:00.000Z"
```

`approved_by` 必须是真实有权角色；`scope` 和 `compensation` 不能空泛，治理记录还应关联风险。Agent 不能把自己写成批准人。到期后状态自动变成 `STALE`。`WAIVED` 可以满足聚合条件，但单独计数，不能进入 PASS 数量或被报告成测试通过。

## 聚合判定

在最后一条自动或人工 evidence entry 追加后，由独立 Owner 签发短期 anchor；private key 与 anchor 输出均不得位于 Agent 工作区：

```bash
node workflow/bin/sign-ledger-anchor.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --ledger features/example-feature/completion/evidence/ledger.jsonl \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --private-key /owner-controlled/ledger-private.pem \
  --public-key /owner-controlled/ledger-public.pem \
  --output /owner-controlled/example-feature.anchor.json
```

```bash
node workflow/bin/evaluate-dod.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --ledger features/example-feature/completion/evidence/ledger.jsonl \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --attestation-key automation-local-v1=OWK_AUTOMATION_KEY \
  --attestation-key human-owner-v1=OWK_HUMAN_KEY \
  --ledger-anchor /owner-controlled/example-feature.anchor.json \
  --ledger-anchor-public-key /owner-controlled/ledger-public.pem
```

聚合同时要求：

- 当前 fingerprint 上所有自动 blocking AC 为 `PASS` 或有效 `WAIVED`；
- 没有未解决的 blocking unknown；
- `findings.yaml` 是当前、Owner/source 匹配的显式 review snapshot，且没有开放的 P0/P1 finding；缺文件不等于空列表；
- 人工 blocking AC 在有权角色签收前保持 pending。

因此：

- `INCOMPLETE`：仍有自动 blocker、unknown 或高优 finding；
- `READY_FOR_HUMAN_ACCEPTANCE`：自动部分完成，但仍有人工闸门；
- `EXTERNAL_LEDGER_ANCHOR_REQUIRED`：自动与人工条件已满足，但还没有当前快照的 Owner-signed anchor；
- `EXTERNAL_LEDGER_ANCHOR_INVALID`：anchor 签名、key、时效或任一 fingerprint/head/count 不匹配；
- `ACCEPTED`：自动与人工 blocking 条件都在当前 fingerprint 上满足，且当前 Owner-signed anchor 有效。

证据完整不等于发布授权。`ACCEPTED` 也不会自动 push、merge、deploy 或写生产系统。

## 黄金样例

[Definition-to-Done examples](../examples/definition-to-done/README.md) 包含一份可 lint 的合成 Contract，以及用于验证模糊标准、非法 waiver 和 stale evidence 的负例。负例不得复制到真实 feature 作为可运行配置。
