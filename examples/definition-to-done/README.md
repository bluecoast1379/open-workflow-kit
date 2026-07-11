# Definition-to-Done 黄金样例

本目录全部使用合成数据，演示 Completion Contract 的正例和三类必须被阻断或失效的负例。

## 文件

| 文件 | 预期 |
| --- | --- |
| `valid-contract.yaml` | Contract lint 通过；包含一个自动 AC 和一个人工 gate |
| `invalid-vague-contract.yaml` | **不可运行负例**；包含“流畅、快速、自然、友好”但没有阈值或 manual rubric，lint 必须失败 |
| `invalid-waiver-entry.json` | **不可追加负例**；waiver 缺少 `approved_by`，ledger append 必须失败 |
| `stale-evidence.json` | **过期证据负例**；格式可追加，但三个 fingerprint 与当前 Contract 不同，DoD 必须投影为 `STALE` |

负例只用于回归校验，不得复制到真实 `features/<feature>/completion/`，也不得被报告为完成证据。

## 验证正例

从 kit 根目录运行：

```bash
node bin/check-completion-contract.cjs \
  --contract examples/definition-to-done/valid-contract.yaml
```

预期退出码为 0，并输出非空 `contract_hash`。

仓库中的 `valid-contract.yaml` **只是 lint 黄金样例，不是可直接执行的授权配置**。它故意使用不可签名的合成 execution/ledger public-key fingerprint，`findings-manifest.yaml` 也故意保留快照 placeholder。下列命令用统一变量指向 Owner 在仓库外准备的副本；不得将后续命令改回原始样例路径。

```bash
export OWNER_DIR=/owner-controlled/definition-example
export CONTRACT="$OWNER_DIR/contract.yaml"
export ENVIRONMENT="$OWNER_DIR/environment.yaml"
export FINDINGS="$OWNER_DIR/findings.yaml"
export EXECUTION_PRIVATE_KEY="$OWNER_DIR/execution-private.pem"
export EXECUTION_PUBLIC_KEY="$OWNER_DIR/execution-public.pem"
export EXECUTION_PERMIT="$OWNER_DIR/execution.permit.json"
export RUNTIME_DIR=examples/definition-to-done/.runtime

mkdir -p "$OWNER_DIR" "$RUNTIME_DIR"
cp examples/definition-to-done/valid-contract.yaml "$CONTRACT"
cp examples/definition-to-done/environment-manifest.yaml "$ENVIRONMENT"
cp examples/definition-to-done/findings-manifest.yaml "$FINDINGS"

openssl genpkey -algorithm ED25519 -out "$EXECUTION_PRIVATE_KEY"
chmod 600 "$EXECUTION_PRIVATE_KEY"
openssl pkey -in "$EXECUTION_PRIVATE_KEY" -pubout -out "$EXECUTION_PUBLIC_KEY"
node bin/sign-execution-permit.cjs \
  --public-key "$EXECUTION_PUBLIC_KEY" \
  --print-public-key-fingerprint

node bin/check-completion-contract.cjs \
  --contract "$CONTRACT" \
  --print-oracle-integrity \
  --cwd . \
  --criterion AC-001
```

此处必须暂停自动执行，由 Owner 完成下列编辑与复核：

1. 将 public-key 命令输出同时写入 `$CONTRACT` 的 `governance.execution_authorization.trusted_public_key_sha256` 与 `governance.ledger_anchor.trusted_public_key_sha256`；若两类授权使用不同 Owner key，则分别生成并写入各自 fingerprint。
2. 将 `--print-oracle-integrity` 输出中 `usable_for_freeze: true` 的 AC-001 fingerprint 写回对应 `integrity_fingerprint`。
3. 让 `$ENVIRONMENT` 反映当前受控运行时、依赖、数据、服务、模型和工具真实版本；不得沿用与本机不符的声明。
4. 将 `$FINDINGS.snapshot_at` 替换为当前 ISO-8601 review 时间，并确保 owner/source 与 Contract 的 `governance.findings_registry` 完全一致。只有显式 `findings: []` 才表示“已检查且无 finding”。
5. 递增 contract version，复核所有 scope/AC/budget，再由有权 Owner 冻结。

准备完成后，所有运行命令都只引用上述 Owner 副本变量：

```bash
node bin/check-completion-contract.cjs --contract "$CONTRACT"

node bin/run-until-done.cjs \
  --contract "$CONTRACT" \
  --cwd . \
  --environment-manifest "$ENVIRONMENT" \
  --findings "$FINDINGS" \
  --print-required-specs

# 在仓库外设置至少 32 bytes 的本地密钥，不要把值写进 Contract 或提交记录。
export OWK_AUTOMATION_KEY='<external-secret-at-least-32-bytes>'

node bin/sign-execution-permit.cjs \
  --contract "$CONTRACT" \
  --private-key "$EXECUTION_PRIVATE_KEY" \
  --public-key "$EXECUTION_PUBLIC_KEY" \
  --environment-manifest "$ENVIRONMENT" \
  --findings "$FINDINGS" \
  --cwd . \
  --valid-minutes 60 \
  --output "$EXECUTION_PERMIT"

node bin/run-until-done.cjs \
  --contract "$CONTRACT" \
  --cwd . \
  --environment-manifest "$ENVIRONMENT" \
  --findings "$FINDINGS" \
  --execution-permit "$EXECUTION_PERMIT" \
  --execution-public-key "$EXECUTION_PUBLIC_KEY" \
  --attestation-key-id automation-local-v1 \
  --attestation-key-env OWK_AUTOMATION_KEY \
  --ledger "$RUNTIME_DIR/ledger.jsonl" \
  --checkpoint "$RUNTIME_DIR/run-state.yaml" \
  --decision-packet "$RUNTIME_DIR/decision-packet.json"
```

自动 AC 通过后，人工 AC-002 仍未签收，因此预期结果是 `READY_FOR_HUMAN_ACCEPTANCE`，退出码为 4，而不是 `ACCEPTED`。`$RUNTIME_DIR` 已被忽略，不应提交。

## 验证模糊标准负例

```bash
node bin/check-completion-contract.cjs \
  --contract examples/definition-to-done/invalid-vague-contract.yaml
```

预期非零退出码，并包含 `AMBIGUOUS_WITHOUT_ORACLE`。不要修改 linter 或给这个负例加宽松豁免来让它通过。

## 验证非法 waiver 负例

本节和 stale evidence 负例都要求已完成上述 Owner 副本准备，并保留 `$CONTRACT`、`$ENVIRONMENT`、`$FINDINGS` 和 `$RUNTIME_DIR` 变量。负例 payload 仍从仓库只读路径加载，但 Contract/environment/findings 必须来自当前 Owner 副本。

```bash
export OWK_HUMAN_KEY='<external-human-secret-at-least-32-bytes>'

node bin/evidence-ledger.cjs append \
  --ledger "$RUNTIME_DIR/invalid-waiver-ledger.jsonl" \
  --entry examples/definition-to-done/invalid-waiver-entry.json \
  --contract "$CONTRACT" \
  --cwd . \
  --environment-manifest "$ENVIRONMENT" \
  --attestation-key-id human-owner-v1 \
  --attestation-key-env OWK_HUMAN_KEY
```

预期非零退出码，因为 waiver 缺少有权批准人。不得把 agent 名称补成 `approved_by`。

## 验证 stale evidence 负例

先把负例 payload 追加为一条 hash-chain entry：

```bash
node bin/evidence-ledger.cjs append \
  --ledger "$RUNTIME_DIR/stale-ledger.jsonl" \
  --entry examples/definition-to-done/stale-evidence.json \
  --contract "$CONTRACT" \
  --cwd . \
  --environment-manifest "$ENVIRONMENT" \
  --attestation-key-id automation-local-v1 \
  --attestation-key-env OWK_AUTOMATION_KEY
```

Payload 中的旧 fingerprint 故意覆盖当前值；ledger 本身仍可验证：

```bash
node bin/evidence-ledger.cjs verify \
  --ledger "$RUNTIME_DIR/stale-ledger.jsonl" \
  --attestation-key automation-local-v1=OWK_AUTOMATION_KEY
```

聚合时必须显示 AC-001 为 `STALE`，不能显示 PASS：

```bash
node bin/evaluate-dod.cjs \
  --contract "$CONTRACT" \
  --ledger "$RUNTIME_DIR/stale-ledger.jsonl" \
  --cwd . \
  --environment-manifest "$ENVIRONMENT" \
  --findings "$FINDINGS" \
  --attestation-key automation-local-v1=OWK_AUTOMATION_KEY
```

Ledger hash chain/HMAC 能发现 entry 内容与顺序篡改，但不能单独发现整个 ledger 被回滚到旧前缀；最终 `ACCEPTED` 还必须核对由独立 Owner 在 Agent 工作区之外签发和保存的 Ed25519-signed head/count/fingerprint anchor。它也不证明旧证据仍适用于当前 contract/source/environment。
