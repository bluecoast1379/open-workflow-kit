# 自主交付、停止与恢复

`/deliver-until-done` 是阶段编排契约；`workflow/bin/run-until-done.cjs` 是其中的本地确定性 runner。二者都服从同一原则：只有完成定义、实现准入和执行授权都明确后，才持续“验证 → 修复动作 → 复验”，并且必须在安全终态或预算边界停止。

## 启动前置条件

运行前应全部满足：

- `features/<feature>/completion/contract.yaml` 已通过 lint 并由有权 Owner 冻结；
- 功能分支、阶段 gate、worktree 隔离与 baseline 已确认；
- `allowed_paths`、`forbidden_paths` 和 preserved invariants 无矛盾，且每条 invariant 映射到实际 AC；
- 06 测试用例与自动 Oracle 已准备；
- environment、fixture、依赖和 source fingerprint 输入明确；
- 本次授权范围明确，但不默认包含 push、merge、deploy、生产写入或 package publish；
- 运行者先复核完整 command spec 与 executable fingerprint，再由工作区外的 Owner private key 签发短期 permit；证据签名 key 只来自仓库外环境变量。

## 安全命令模型

```bash
node workflow/bin/run-until-done.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --print-required-specs

node workflow/bin/sign-execution-permit.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --private-key /owner-controlled/execution-private.pem \
  --public-key /owner-controlled/execution-public.pem \
  --valid-minutes 60 \
  --output /owner-controlled/example-feature.permit.json

node workflow/bin/run-until-done.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --execution-permit /owner-controlled/example-feature.permit.json \
  --execution-public-key /owner-controlled/execution-public.pem \
  --attestation-key-id automation-local-v1 \
  --attestation-key-env OWK_AUTOMATION_KEY
```

runner 对 command Oracle 施加多层边界：

1. Contract 只能提供 `command` 和 `args`，不能提供 `shell`。
2. shell 解释器被禁止，执行固定为 `shell:false`。
3. Oracle 的 `cwd` 必须位于 `--cwd` 指定的 workspace 内。
4. Owner Ed25519 permit 必须绑定 contract/environment/findings/base/scope、完整 command spec、resolved executable fingerprint 与精确预算；公开 spec hash 不是授权。
5. `integrity_paths` 的当前 fingerprint 必须与冻结 Contract 中的 `integrity_fingerprint` 一致，防止测试或 Oracle 在授权后被替换。
6. shell、inline evaluator、网络/发布/部署工具、写 Git 子命令和 package publish/install 等危险入口被硬阻断。
7. 命令有 timeout 与输出 buffer 上限，证据只记录输出 hash 和断言摘要。

`--print-required-specs` 会输出完整 spec、resolved executable fingerprint、contract/environment/findings/base/scope hash。Owner 必须在人工复核该输出后显式运行 `sign-execution-permit.cjs`，不得跳过签名直接启动 runner。Owner 的 private key 必须位于 Agent 不可写的 trust boundary；任何绑定值变化都必须重签短期 permit。Contract 与工作树不能自行构造授权票据。

## 一轮如何运行

每轮 runner：

1. 校验 Contract，并只加载同 contract/environment/findings/base/source 的 checkpoint；累计时间和成本不会因续跑重置。
2. 计算当前 source fingerprint、base-commit changeset 和 scope 边界，并聚合 ledger。
3. 如果自动 blocking AC 已满足，返回成功或等待人工验收。
4. 只用 Contract 的最小环境变量 allowlist 运行非人工 Oracle；Evidence 使用仓库外 HMAC key 签名，checkpoint 在执行前预扣预算并在执行后绑定 ledger head/count。
5. 再次聚合；仍失败时记录 failure fingerprint、blocker 数量和预算消耗。
6. 如果 Contract 定义了受信的 `autonomy.iteration_command`，在同一 allowlist 下执行一次修复/生成动作；随后进入下一轮复验。
7. 如果没有合法修复动作、失败重复、没有进展或预算耗尽，停止并生成 decision packet。

当前 CLI 不会自行编写业务代码。Agent 工作流可以在 `/04`、`/05`、`/07` 中进行受控实现、独立审查和验证，再用 runner 记录/聚合确定性结果；不可把 runner 的命令执行误述为通用自治编码器。

## 预算

Contract 中的 `autonomy` 至少定义：

- `max_iterations`
- `max_elapsed_minutes`
- `max_command_executions`
- `max_cost_units` 与 `cost_unit`
- `stop_conditions`

还可定义：

- `max_diff_lines`
- `max_same_failure`
- `max_no_progress`
- `iteration_command`

CLI 可为当前运行收紧迭代、时间或命令次数，但收紧值是 permit 签名内容：必须在签发和运行命令中传入完全相同的预算参数。下例的两组值必须保持逐项一致：

```bash
node workflow/bin/sign-execution-permit.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --private-key /owner-controlled/execution-private.pem \
  --public-key /owner-controlled/execution-public.pem \
  --valid-minutes 60 \
  --output /owner-controlled/example-feature.permit.json \
  --max-iterations 3 \
  --max-command-executions 10 \
  --max-cost-units 20 \
  --cost-per-execution 1 \
  --max-elapsed-ms 900000

node workflow/bin/run-until-done.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --execution-permit /owner-controlled/example-feature.permit.json \
  --execution-public-key /owner-controlled/execution-public.pem \
  --attestation-key-id automation-local-v1 \
  --attestation-key-env OWK_AUTOMATION_KEY \
  --max-iterations 3 \
  --max-command-executions 10 \
  --max-cost-units 20 \
  --cost-per-execution 1 \
  --max-elapsed-ms 900000
```

预算是停止边界，不是完成标准。签发与运行值不同会使 permit 验证失败；不得用“运行时再收紧”绕过签名边界。接近上限时不得减少测试、降低阈值、忽略失败或把 `NOT_RUN` 写成 `PASS`。

## 停止条件

以下情况必须停止自主循环：

- 需要修改被冻结的目标、scope、AC、blocking、阈值或 human gate；
- 需要越过 allowed paths 或执行未授权的高风险、外部、生产动作；
- 缺少凭证、测试数据、环境、设备、第三方审批或不可替代的外部状态；
- Oracle 疑似错误、flaky，或 Contract 内部自相矛盾；
- 同一失败达到 `max_same_failure`，或 blocker 连续达到 `max_no_progress`；
- iteration、累计 elapsed、command execution、cost units 或 base-commit-pinned diff 任一预算耗尽；
- 发现 P0 安全、隐私、数据损坏或不可逆风险。
- execution permit 在运行中到期。Runner 在每轮、每个 Oracle 和 remediation 前重新核对到期时间，并以 permit 剩余时间缩短命令 timeout；控制权返回后不会再启动后续 Oracle/remediation，并生成精确 decision packet。对忽略终止信号或遗留子进程的非受信命令，还必须由宿主 OS/container sandbox 施加进程与网络硬隔离，不能把 JavaScript runner 误当作内核级沙箱。

遇到合同缺陷时，正确动作是生成 contract-change decision packet，并等待有权角色批准；不是让 agent 修改标准后继续。

## 合法终态

| 终态 | 含义 | 下一动作 |
| --- | --- | --- |
| `READY_FOR_HUMAN_ACCEPTANCE` | 自动 blocking AC 满足，人工 gate 待签收 | 有权角色按 rubric 验收并追加证据 |
| `BLOCKED_WITH_DECISION_PACKET` | 缺权限、无合法修复、重复失败或无进展 | Owner 处理 packet 中的具体决策后恢复 |
| `BUDGET_EXHAUSTED` | 任一自主预算真实耗尽 | 复核根因；调整预算需独立决定 |

`run-until-done` 与 `/deliver-until-done` 都永远不输出 `ACCEPTED` 或 `RELEASED`。它们只把自动交付推进到 `READY_FOR_HUMAN_ACCEPTANCE`。有权角色按 rubric 追加当前人工证据后，独立的 `evaluate-dod` 才可以聚合为 `ACCEPTED`；发布仍需另一份明确授权。

CLI 退出码：

- `2`：`BLOCKED_WITH_DECISION_PACKET`
- `3`：`BUDGET_EXHAUSTED`
- `4`：`READY_FOR_HUMAN_ACCEPTANCE`
- `1`：参数、格式、checkpoint 或运行时错误

## Checkpoint 与幂等恢复

默认状态文件：

```text
features/<feature>/completion/run-state.yaml
```

它记录 contract/source/environment/findings/baseline fingerprint、固定 base commit、iteration、command executions、cost units、累计 elapsed、blocker 数量、failure fingerprint、重复/无进展计数和原始 started time。默认运行会恢复同一 checkpoint：

```bash
node workflow/bin/run-until-done.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --execution-permit /owner-controlled/example-feature.permit.json \
  --execution-public-key /owner-controlled/execution-public.pem \
  --attestation-key-id automation-local-v1 \
  --attestation-key-env OWK_AUTOMATION_KEY
```

恢复要求：

- contract hash 必须一致；旧 contract 的 checkpoint 会被拒绝；
- environment fingerprint 必须一致；切换环境需要归档旧状态并明确重新开始；
- findings fingerprint 必须一致；review snapshot 更新后必须重新签发 permit，开放 P0/P1 会阻断；
- checkpoint 之外的 source 变化会拒绝恢复；Oracle 执行期间的 source 变化会把该证据判为 `STALE`；
- base commit 固定后，即使中途 commit，diff 与 scope 仍从原始基线计算；
- 原始 `started_at`、已用 cost units 与 command executions 跨恢复累计；
- ledger 已有 entry 先验证 hash chain，并与签名 checkpoint 的 head/count 核对后参与 runner 聚合。

`--no-resume` 已在 CLI 禁用。新运行必须由 Owner 归档旧 runtime、递增 Contract/version，并签发新的 execution permit；不得用删除或重建 checkpoint 重置预算。

## Decision packet

默认文件：

```text
features/<feature>/completion/decision-packet.json
```

Packet 应包含 reason、当前 fingerprint、base commit、blockers、pending human gates、blocking unknowns、scope violation、iteration、command executions、cost units、累计 elapsed time 和最小 required decisions。它必须具体到 AC、证据和所需 Owner，不能只写“需要更多信息”。

## 证据新鲜度与复验

Evidence Ledger 的有效性同时绑定：

- `contract_hash`
- `source_fingerprint`
- `environment_fingerprint`

任一变化都会把旧 evidence 的有效状态投影为 `STALE`。如果 entry 绑定了 `artifacts`，产物缺失、类型变化或 hash 不匹配也会失效。修复后应先重跑受影响 Oracle，再执行 Contract 指定的必跑回归。不得覆盖旧 entry；新证据追加到 hash chain。

自主 runner 不接受单一环境名称，必须读取版本化 environment manifest，显式记录 runtime、dependency、service、dataset、model 与 tool versions；不适用项也要写带理由的 `N/A`。内核还会加入观察到的 Node/V8/OpenSSL/platform/arch 与每条 AC 的 environment/fixture，原始 `--environment-fingerprint` 不能覆盖计算结果。

`findings.yaml` 同样是必需输入：它声明 snapshot time、Owner、唯一来源和逐条 P0..P3 状态。显式 `findings: []` 才表示已完成检查且没有 finding；缺失、placeholder、过期、Owner/source 不匹配或开放 P0/P1 都不能到达自动完成。

Hash chain 与 HMAC 能发现 entry 内容、顺序和 checkpoint 后的 tail 截断，但无法单独阻止整个 ledger 与 checkpoint 一起被回滚到旧快照。最终 `ACCEPTED` 因此强制要求独立 Owner 在 Agent 工作区之外用受信 Ed25519 key 签发并保存最新 `ledger_head_hash + ledger_entry_count + fingerprints` anchor；缺失时状态为 `EXTERNAL_LEDGER_ANCHOR_REQUIRED`，签名、时效或内容不匹配时为 `EXTERNAL_LEDGER_ANCHOR_INVALID`。

## Waiver 与人工 gate

- Waiver 需要有权批准人、scope、理由、补偿控制和到期日，并在治理文档中关联风险；对应 AC 还必须预先 allowlist 批准人、scope 与最大期限。
- 过期 waiver 自动变成 `STALE`。
- `WAIVED` 保留独立计数，不等于测试通过。
- 人工 blocking AC 必须有 manual rubric；runner 不能为自己追加“已接受”证据。
- 自动完成、人工验收和发布授权是三个独立边界。

## Done Cockpit

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

node workflow/bin/generate-done-cockpit.cjs \
  --contract features/example-feature/completion/contract.yaml \
  --ledger features/example-feature/completion/evidence/ledger.jsonl \
  --cwd . \
  --environment-manifest features/example-feature/completion/environment.yaml \
  --findings features/example-feature/completion/findings.yaml \
  --attestation-key automation-local-v1=OWK_AUTOMATION_KEY \
  --attestation-key human-owner-v1=OWK_HUMAN_KEY \
  --ledger-anchor /owner-controlled/example-feature.anchor.json \
  --ledger-anchor-public-key /owner-controlled/ledger-public.pem \
  --output features/example-feature/completion/done-cockpit.html
```

Cockpit 展示聚合状态、每条 AC、fingerprints、ledger head/count 与签名外部锚结论。所有动态文本会 HTML escape；仍应把它当作本地验收视图，不向公开渠道上传私有证据或路径。
