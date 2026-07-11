# 维护者交接

本文面向 Open Workflow Kit 的发布和支持维护者。内容必须保持通用，不得包含私有公司、客户、仓库、事故、URL、日志、SQL 或生产配置细节。

## 当前交付状态

在 package 根目录执行以下命令通过后，本 workflow kit 可本地打包：

```bash
npm run check
npm run check:history
npm run build:release
```

构建会生成：

- `dist/open-workflow-kit-<version>.tgz`
- `dist/RELEASE_MANIFEST.md`

manifest 会记录包名、版本、license、归档大小、SHA-256、安装 smoke 状态和人工发布边界。

## 维护者可以分享什么

只能分享脱敏后的 Open Workflow Kit 包，或只包含本 workflow kit 的仓库：

- `README.md`
- `INIT.md`
- `CHANGELOG.md`
- `LICENSE`
- `NOTICE`
- `install.sh`
- `bin/`
- `scripts/`
- `workflow/`
- `templates/`
- `examples/`
- `docs/`
- `test/`

不要把来源团队的工作流文档、产品文档、需求目录、业务仓库、客户资料、日志、SQL、截图或内部 runbook 当成示例分享。

## 人工发布边界

agent 可以在本地准备、验证和打包 Open Workflow Kit，但不得执行远程发布动作。

只能由维护者手动执行的动作：

- 创建远程仓库；
- 添加或修改 remote URL；
- push commits；
- 创建或 push tags；
- 发布到 npm 或其他 package registry；
- 上传归档到公共站点；
- 在私有工作区运行远程 Git 刷新命令。

发布命令清单见 `docs/manual-publish.md`，维护者应手动运行。

## 接收方验收清单

建议接收团队先在临时工作区或一次性分支中运行初始化器。

接收方应确认：

- 已生成 `workflow/team-profile.yaml`。
- 已生成并 Git 忽略 `workflow/local/team-profile.local.yaml` 和 `workflow/local/rule-provenance.private.yaml`。
- 必要资料缺失时生成了 `workflow/INITIALIZATION_QUESTIONS.md`。
- `workflow/core/` 存在，并包含命令、模板和能力说明。
- `workflow/adapters/` 存在。
- `workflow/adapters/support-matrix.yaml` 明确披露 Codex、Claude Code、Cursor、GitHub Copilot、CodeBuddy、Kiro、Trae 七个项目级 adapter；当前都保持 `native_not_yet_manually_certified`，直到本版本真实工具验收完成。
- 选中的工具入口已生成，例如 `AGENTS.md`、`CLAUDE.md`、`.cursor/rules/`、`.github/copilot-instructions.md`、`.codebuddy/`、`.kiro/` 或 `.trae/`。
- `.trae-cn/` 仅作为 Trae 中文发行版兼容镜像，不计为第八个 adapter，也不替代 `.trae/` 主路径验收。
- 使用 `trea` 时已归一为 `trae`。
- 除非显式传入 `--force`，已有文件没有被覆盖。
- 初始化期间没有远程 Git、创建分支、push、构建、部署、数据库写入或生产配置写入。

推荐 smoke 命令：

```bash
agent-workflow-init --target . --tools codex,claude,cursor,copilot,codebuddy,kiro,trae --yes
```

如果从本地 tarball 安装：

```bash
./node_modules/.bin/agent-workflow-init --target . --tools codex,claude,cursor,copilot,codebuddy,kiro,trae --yes
```

## 支持模型

按层定位问题：

- `workflow/core`: 阶段、硬闸门、模板和工具无关规则。
- `workflow/team-profile.yaml`: 接收团队可提交的共享契约和缺失资料问题。
- `workflow/local/`: 绝对路径、私有端点、凭证映射、原始审计和私有规则溯源，必须 Git 忽略。
- `workflow/adapters`: 工具特定薄入口。
- `bin/init-workspace.cjs`: 本地初始化逻辑。
- `bin/check-sanitized.cjs`: 发布安全检查。
- `bin/check-rule-catalog.cjs`: 37 条规则 / 79 个清单 item 映射与可选私有 provenance 检查。
- `bin/check-command-manifest.cjs`: 23 个命令、core command、Completion Contract 引用和实现闸门映射检查。
- `bin/check-support-matrix.cjs`: 七个平台项目级路径、发现方式、conformance 和人工验收状态检查。
- `bin/check-completion-contract.cjs`: Contract 结构、traceability、量化标准、governance 和 Oracle 安全 lint。
- `bin/evidence-ledger.cjs`: append-only evidence；chain 与 HMAC 验证结果分开报告。
- `bin/evaluate-dod.cjs`: 在当前 contract/source/environment/findings 快照上独立聚合自动完成、人工验收与 signed anchor。
- `bin/check-completion-schemas.cjs`: Completion Contract、Evidence Ledger、run-state、execution permit、ledger anchor、environment、findings 与 decision packet 的 schemas/templates/runtime golden conformance 检查；decision packet 对应 `workflow/core/schemas/completion-decision-packet.schema.json`。
- `bin/run-until-done.cjs`: 受 allowlist、预算和 checkpoint 约束的自动 Oracle 收敛；只到 `READY_FOR_HUMAN_ACCEPTANCE` 或精确停止终态。
- `bin/generate-done-cockpit.cjs`: 生成 HTML-escaped 本地验收视图。

团队反馈问题时，优先索要：

- 执行的初始化命令；
- Node.js 版本；
- 选择的工具列表；
- 已移除敏感内容的 `workflow/team-profile.yaml`；
- 如存在，提供 `workflow/INITIALIZATION_QUESTIONS.md`；
- 是否生成了 `.agent-workflow-new` 文件；
- 精确错误输出。

命令发现能力按 [`adapter-manual-acceptance.md`](./adapter-manual-acceptance.md) 验收；不得只凭“生成了目录”或“菜单能打开”更新 `native_verified`。

除非已经建立单独的安全支持渠道，不要要求团队发送私有源码、客户数据、凭证、日志、SQL 或生产配置。

## 工具能力策略

workflow core 必须保持工具无关。工具特定行为只能放在 adapters。

能力等级：

- L0：仅文档规则。
- L1：prompt 或命令模板。
- L2：当前工具内的自动规则触发。
- L3：当前工具支持的 hooks 或本地自动化。
- L4：当前工具支持的 subagents 或专项技能。

不要承诺不同工具体验完全一致。应承诺同一套 workflow core，并按工具能力增强或降级。

## 发布更新流程

每次发布：

1. 只修改通用 Open Workflow Kit 文件。
2. 私有示例留在本仓库之外。
3. 运行 `npm run check`。
4. 运行 `npm run check:history`。
5. 运行 `npm run build:release`。
6. 检查 `dist/RELEASE_MANIFEST.md`。
7. 检查 tarball 文件列表。
8. 在临时目标工作区用 tarball 做安装 smoke test。
9. 运行 Definition-to-Done 正例与模糊标准、非法 waiver、stale evidence 负例。
10. 使用 Open Workflow Kit 仓库外部的私有 denylist 运行 `bin/check-sanitized.cjs --extra-banned <private-denylist-file>`。
11. 在有私有规则源的环境运行 `bin/check-rule-catalog.cjs --provenance workflow/local/rule-provenance.private.yaml`。
12. 由维护者手动发布到目标渠道。

## 版本建议

遵循 semantic versioning：

- Patch：文档澄清、脱敏检查增强、adapter 文案修复、smoke test 修复。
- Minor：新增 adapter、新增可选模板、新增非破坏性初始化参数或新 capability。
- Major：改变生成文件布局、改变命令名、改变硬闸门语义或移除支持工具。

## 明确不做

本 workflow kit 不会：

- 托管或同步团队文档；
- 替代代码实现闸门的人工确认；
- 绕过本地工具限制；
- 从一个 agent 工具调用另一个工具的私有能力；
- 保证所有工具具有同等自动化水平；
- 把自动 conformance 误报为真实客户端人工认证；
- 让 `run-until-done` 代替人类验收或输出 `ACCEPTED`；
- 创建分支、push 代码、发布包、部署服务或写数据库。
