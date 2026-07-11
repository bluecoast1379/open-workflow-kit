# 外部分发检查清单

发布到公共仓库、package registry、template repository 或文档站点前，使用本清单做最终检查。

## 必须完成

- `npm run check` 通过。
- `npm run check:history` 通过。
- `npm run check:commands` 通过，确认 manifest、23 个 core command、Completion Contract 引用和实现闸门映射一致。
- `npm run check:schemas` 通过，确认 Draft 2020-12 结构、runtime golden fixtures、run-state/permit/anchor/environment/findings/decision-packet 关键不变量一致，且 `workflow/core/schemas/completion-decision-packet.schema.json` 与生成的停止包对齐。
- `npm run check:rules` 通过，确认 37 条规则 / 79 个清单 item 无孤儿、无重复映射。
- `npm run check:adapters` 与 `npm run check:links` 通过。
- reviewed commit 已形成且 worktree clean；`npm run build:release` 通过，manifest 的 source commit/tree 与该 commit 一致。
- `dist/RELEASE_MANIFEST.md` 已人工检查。
- tarball 文件列表已人工检查。
- README、INIT、CHANGELOG、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT、LICENSE、NOTICE 已检查。
- 示例数据均为合成数据，不能追溯到真实客户、员工、项目、事故或生产系统。
- 工具 adapter 只指向 workflow core，不削弱硬闸门。
- 初始化器不会执行远程 Git、创建分支、push、构建 / 部署触发、数据库写入或生产配置写入。
- 生成的 `workflow/team-profile.yaml` 不包含绝对路径、私有端点、账号、凭证或原始审计记录。
- `workflow/local/team-profile.local.yaml`、`workflow/local/rule-provenance.private.yaml` 和 `workflow/local/execution-audit.jsonl` 已被 Git 忽略。
- `workflow/adapters/support-matrix.yaml` 中七个平台的路径和 manifest entry 均通过自动 conformance；缺少当前版本真实工具验收时必须保持 `native_not_yet_manually_certified`，不能阻塞本地候选但必须明确披露。
- `.trae-cn/` 只作为兼容镜像检查，不计为独立 adapter 或 `.trae/` 的认证证据。
- 共享 API runner 的环境白名单、显式 host 授权、生产阻断和脱敏输出已有回归测试。
- Completion Contract 正例 lint 通过；模糊验收、非法 waiver、stale evidence、ledger/anchor tamper、placeholder environment 与无效/开放 findings 负例按预期失败或失效。
- `run-until-done` 只输出 `READY_FOR_HUMAN_ACCEPTANCE`、`BLOCKED_WITH_DECISION_PACKET` 或 `BUDGET_EXHAUSTED`，从不代替 evaluator 输出 `ACCEPTED`。
- Owner Ed25519 permit、完整 command/oracle/executable/findings fingerprint、最小 env allowlist、HMAC 证据与 checkpoint、外部 signed ledger anchor、`shell:false`、realpath/symlink 防护、scope 强制、累计预算、checkpoint 恢复和 HTML escape 有回归覆盖。

## Git 历史扫描（建议）

`check-sanitized.cjs` 只扫描当前工作树。对外发布前先运行内置的 `npm run check:history`（轻量全历史新增行扫描，与工作树扫描共用同一套模式，命中内容掩码输出）；更强规则或超大仓库建议配合 gitleaks / trufflehog 扫描完整提交历史，确认历史提交无凭证或私有信息残留；并运行 `node bin/check-sanitized.cjs --report SANITIZATION_REPORT.md` 生成可复查的扫描报告（报告不含私有词表内容）。

## 私有 denylist 扫描

在 Open Workflow Kit 仓库外部创建私有 denylist 文件，然后运行：

```bash
node bin/check-sanitized.cjs --extra-banned ../private-audit/private-denylist.txt
```

私有 denylist 应包含公司名、内部仓库前缀、内部系统、客户名、私有域名、敏感业务术语和已知事故名称。不要把该文件提交到 Open Workflow Kit 仓库。

如需验证 37 条规则与内部原始规范的溯源完整性，在私有环境执行：

```bash
node bin/check-rule-catalog.cjs --provenance workflow/local/rule-provenance.private.yaml
```

私有溯源文件只保存本地 source locator 和 SHA-256 指纹，永不提交。

## 人工复核

自动扫描不够。仍需人工检查：

- commit message；
- README 和 docs；
- examples；
- install 脚本；
- workflow core；
- adapter 输出；
- package files 列表；
- tarball 内容。

重点关注：

- 是否出现真实组织、真实仓库、真实 URL；
- 是否包含业务数据、日志、SQL、截图或凭证；
- 是否承诺“所有工具体验完全一致”；
- 是否引导 agent 自动远程操作；
- 是否把私有流程写成通用规则。
- 是否把自动完成、人工验收和发布授权混成同一个状态。
- 是否把 `WAIVED` 伪装成 `PASS`，或在 fingerprint 变化后继续沿用旧证据。

## 发布决策

以下事项明确前不要发布：

- license；
- 发布渠道；
- 版本号；
- 支持边界；
- issue / PR 接收方式；
- 私有安全报告渠道；
- 是否允许提交 `dist/` 产物。
- 是否接受当前版本七个平台仍未完成真实客户端人工认证的披露状态。
