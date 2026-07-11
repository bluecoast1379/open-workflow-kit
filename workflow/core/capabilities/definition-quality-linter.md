# Capability: definition-quality-linter

- **Tier**: essential
- **Stage**: `/define-done`, `/01`, `/02`, `/03`
- **Purpose**: 在实现前检查 Completion Contract 是否清晰、完整、无矛盾且可验证。

## 输入

- `features/{feature}/completion/contract.yaml`
- 01/02/02B/03 文档、team-profile 与适用 policy packs

## 输出

```yaml
result: PASS | WARN | BLOCK
errors: [{path: "acceptance[0].oracle", rule: "OWK-DEF-...", message: "..."}]
warnings: []
traceability: {requirements: 0, acceptance: 0, orphan_ids: []}
```

## 必查项

- 稳定 ID、引用完整、P0/P1 REQ/RISK 有 AC、blocking AC 有 Oracle / threshold / evidence / freshness。
- 目标、范围、non-goals、反需求、不变量、allowed / forbidden paths 不矛盾。
- 模糊词被阈值、单位、示例、决策表或人工 rubric 消融。
- assumptions / decisions / waivers 有 Owner、期限和治理；human gate 不会被自动判定。
- 适用的业务、组织、UX、NFR、异常、运营、回滚、演进与 AI 维度均有定义或 N/A 理由。

## 阻断规则

- blocking AC 无确定 Oracle、存在孤立 P0/P1 需求、合同自相矛盾或 Agent 可自行降低关键阈值时 BLOCK。
- 仅用“体验好、性能高、足够安全”等形容词定义完成时 BLOCK。
- contract 更新未递增版本或未失效受影响证据时 BLOCK。

## 反模式

- 用文档篇幅代替定义质量。
- 为已有实现反向编写宽松 AC。
- 把未知项静默写成已确认事实。
