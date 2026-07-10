# 维护者交接

本文面向 starter kit 的发布和支持维护者。内容必须保持通用，不得包含私有公司、客户、仓库、事故、URL、日志、SQL 或生产配置细节。

## 当前交付状态

在 package 根目录执行以下命令通过后，本 starter kit 可本地发布：

```bash
npm run check
npm run build:release
```

构建会生成：

- `dist/open-workflow-kit-<version>.tgz`
- `dist/RELEASE_MANIFEST.md`

manifest 会记录包名、版本、license、归档大小、SHA-256、安装 smoke 状态和人工发布边界。

## 维护者可以分享什么

只能分享脱敏后的 starter kit 包，或只包含本 starter kit 的仓库：

- `README.md`
- `INIT.md`
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

agent 可以在本地准备、验证和打包 starter kit，但不得执行远程发布动作。

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
- 必要资料缺失时生成了 `workflow/INITIALIZATION_QUESTIONS.md`。
- `workflow/core/` 存在，并包含命令、模板和能力说明。
- `workflow/adapters/` 存在。
- 选中的工具入口已生成，例如 `AGENTS.md`、`CLAUDE.md`、`.cursor/rules/`、`.github/copilot-instructions.md`、`.codebuddy/`、`.kiro/` 或 `.trae/`。
- 使用 `trea` 时已归一为 `trae`。
- 除非显式传入 `--force`，已有文件没有被覆盖。
- 初始化期间没有远程 Git、创建分支、push、构建、部署、数据库写入或生产配置写入。

推荐 smoke 命令：

```bash
agent-workflow-init --target . --tools codex,claude,cursor,codebuddy,trea --yes
```

如果从本地 tarball 安装：

```bash
./node_modules/.bin/agent-workflow-init --target . --tools codex,claude,cursor,codebuddy,trea --yes
```

## 支持模型

按层定位问题：

- `workflow/core`: 阶段、硬闸门、模板和工具无关规则。
- `workflow/team-profile.yaml`: 接收团队的本地配置和缺失资料问题。
- `workflow/adapters`: 工具特定薄入口。
- `bin/init-workspace.cjs`: 本地初始化逻辑。
- `bin/check-sanitized.cjs`: 发布安全检查。

团队反馈问题时，优先索要：

- 执行的初始化命令；
- Node.js 版本；
- 选择的工具列表；
- 已移除敏感内容的 `workflow/team-profile.yaml`；
- 如存在，提供 `workflow/INITIALIZATION_QUESTIONS.md`；
- 是否生成了 `.agent-workflow-new` 文件；
- 精确错误输出。

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

1. 只修改通用 starter kit 文件。
2. 私有示例留在本仓库之外。
3. 运行 `npm run check`。
4. 运行 `npm run build:release`。
5. 检查 `dist/RELEASE_MANIFEST.md`。
6. 检查 tarball 文件列表。
7. 在临时目标工作区用 tarball 做安装 smoke test。
8. 使用 starter kit 外部的私有 denylist 运行 `bin/check-sanitized.cjs --extra-banned <private-denylist-file>`。
9. 由维护者手动发布到目标渠道。

## 版本建议

遵循 semantic versioning：

- Patch：文档澄清、脱敏检查增强、adapter 文案修复、smoke test 修复。
- Minor：新增 adapter、新增可选模板、新增非破坏性初始化参数或新 capability。
- Major：改变生成文件布局、改变命令名、改变硬闸门语义或移除支持工具。

## 明确不做

本 starter kit 不会：

- 托管或同步团队文档；
- 替代代码实现闸门的人工确认；
- 绕过本地工具限制；
- 从一个 agent 工具调用另一个工具的私有能力；
- 保证所有工具具有同等自动化水平；
- 创建分支、push 代码、发布包、部署服务或写数据库。
