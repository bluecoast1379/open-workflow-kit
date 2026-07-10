# Rules

`rule-catalog.yaml` 是 37 条通用规则的公开单一事实源。清单文件负责逐项执行，catalog 负责审计级追溯。

硬性约束：

- 规则 ID 固定为 `OWK-RULE-001..037`，不因排序或改名复用旧 ID。
- 79 个清单 item 必须全部被覆盖，且每个 item 只归属一条规则。
- 每条规则必须挂接至少一个 capability 和一个 stage command。
- `deprecated` / `retired` 规则必须记录原因、版本和替代规则。
- 公开 catalog 不得包含公司名、私有路径、客户数据、内部 URL、日志/SQL 原文或复盘原文。
- `private_provenance_ref` 只是脱敏引用；真实材料指纹只存在被忽略的 `workflow/local/rule-provenance.private.yaml`。

公开完整性校验：

```bash
node workflow/bin/check-rule-catalog.cjs
```

kit 源仓维护者也可使用 `npm run check:rules`。

维护者在本地补齐私有 provenance 后，可执行：

```bash
node workflow/bin/check-rule-catalog.cjs --provenance workflow/local/rule-provenance.private.yaml
```
