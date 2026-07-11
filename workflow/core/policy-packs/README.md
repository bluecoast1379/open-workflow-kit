# Policy Packs

Policy packs 在 `team-profile#risk_policy.policy_packs` 或 Completion Contract 中显式启用，也可由 capability manifest 的 `applies_when` 命中后建议启用。它们只会收紧基础规则，不能降低 core、execution-policy 或合同中的约束。

## 选择规则

- 每个 feature 至少使用 `standard`。
- 涉及账号、健康、金融、未成年人、位置、身份等敏感数据时叠加 `regulated-sensitive-data`。
- 对外 API、事件或 schema 时叠加 `public-contract`。
- 依赖 LLM / model / prompt / RAG / agent tool use 时叠加 `ai-feature`。
- 有显著用户界面、付费、广告或行为劝导时叠加 `user-facing-experience`。
- 需要生产数据迁移、不可逆状态或高可用时叠加 `high-risk-change`。

多个 pack 同时适用时取并集与最严格阈值；冲突时 BLOCK 并形成 decision packet，不允许 Agent 自行选择宽松项。

## Pack Schema

```yaml
schema_version: "1.0"
id: "<stable-id>"
title: "<name>"
extends: []
applies_when: {any_keywords: [], contract_paths: []}
required_capabilities: []
required_contract_sections: []
mandatory_acceptance_dimensions: []
blocking_rules: []
```
