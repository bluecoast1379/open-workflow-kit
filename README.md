# Open Workflow Kit

一个可分发给其他团队的通用研发工作流 kit。它把可分发架构拆成四部分：

- `workflow/core`: 工具无关的流程、阶段、闸门、模板、检查能力、清单和 37 条规则 catalog。
- `workflow/team-profile.yaml`: 可提交、可脱敏审查的团队契约；本地私有值进被忽略的 `workflow/local/team-profile.local.yaml`。
- `workflow/adapters`: 各智能体工具的薄入口与支持矩阵，只调用当前工具自己的能力。
- `examples`: 全部由合成数据组成的团队初始化示例，不是运行时信任源。

核心原则：同一套 workflow core，多工具 adapter 分层增强；不承诺所有工具体验完全一致。

## 核心能力（v0.9）

| 能力块 | 说明 |
| --- | --- |
| 20 个检查能力 + 6 个事故模式清单 | `workflow/core/capabilities/` 定义检查契约；`workflow/core/checklists/` 把真实交付事故的脱敏教训展开为逐项清单（校验变更复扫、数据一致性、分支卫生、测试盲区、第三方集成、Java 陷阱） |
| 工具链 MCP 连接计划 | 初始化时自动探测 CI/CD、部署、配置中心、数据库、日志、代码托管六大槽位，生成 `workflow/TOOLCHAIN_MCP_PLAN.md`；`/connect-toolchain` 问答补齐并按"现成 MCP 优先、只读默认"推进连接 |
| 受信分级执行策略 | 生效权限取 core 硬上限、仓库外受信策略、team-profile 请求和当次授权的最严格值；生产部署/配置、DDL/DML、受保护分支写入和包发布不得仅凭仓库配置 auto |
| 测试双轨自动化 | 接口轨内置 `workflow/bin/run-api-tests.cjs` 共享 runner，强制环境与 host allowlist；功能轨通过浏览器自动化 MCP 或 miniprogram-automator 执行 |
| 生命周期治理（v0.7） | `--upgrade` 自动清理旧版适配器残留（kit 指纹校验，用户自定义内容保留）并永不覆盖 team-profile；内置 `npm run check:history` 全历史凭证扫描（掩码输出）；79 条清单条目稳定 ID（VCR/DCR/BH/TBS/TIR/LPJ）可跨文档引用；Claude skills 官方推荐格式入口 |
| HTML 可点击原型 | `/02C-HTML原型` 显式阶段：强制先提取 design tokens + 组件清单，产出前端开发级单文件可点击原型（微路由 + 四态），`ui-baseline-reviewer` 用 tokens 反查卡关 |
| 规则审计级可追溯 | `workflow/core/rules/rule-catalog.yaml` 以 `OWK-RULE-001..037` 映射 79 个清单 item、capability、stage、版本和脱敏证据；`npm run check:rules` 阻断重复或孤儿映射 |
| 跨工具命令发现（v0.9） | `workflow/core/command-manifest.yaml` 统一维护 21 个命令；Claude/Cursor/CodeBuddy 使用 `/` 模糊选择，Codex 使用分阶段 Skill，Trae 使用兼容级 Agent Skills；不承诺所有工具体验完全一致 |
| 工具支持分级 | Codex/Claude/Cursor/Copilot/CodeBuddy 5 个原生 adapter；Kiro/Trae 为兼容入口。无真实工具验收证据时不标记 `native_verified` |

## 一键初始化

在目标团队的项目根目录运行：

```bash
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target .
```

也可以使用 shell wrapper：

```bash
/path/to/open-workflow-kit/install.sh . --tools codex,claude,cursor
```

如果你拿到的是 Git 地址或 npm 包地址，见 [可分享安装方式](./docs/shareable-install.md)。

常用参数：

```bash
# 指定工具入口
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --tools codex,claude,cursor

# GitHub 包安装方式
npx --yes --package "git+https://github.com/bluecoast1379/open-workflow-kit.git#v0.9.0" agent-workflow-init --target . --tools codex,claude,cursor

# 工具名支持 trea 别名，会自动归一为 trae
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --tools codex,trea,codebuddy

# 非交互模式，缺失资料会写入 workflow/INITIALIZATION_QUESTIONS.md
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --yes

# 只查看会生成什么，不写文件
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --dry-run
```

## 初始化器会做什么

1. 扫描目标工作区本地文件和目录，识别代码仓库、技术栈线索、项目资料、UI 规范、前后端规范和测试规范。
2. 探测工具链六大槽位（CI/CD、部署运行态、配置中心、数据库、运行日志、代码托管），生成 `workflow/TOOLCHAIN_MCP_PLAN.md` 连接计划；未检出的槽位由 `/connect-toolchain` 问答补齐。
3. 生成可提交的 `workflow/team-profile.yaml`（schema 1.2）和被忽略的 `workflow/local/team-profile.local.yaml`；前者只记仓库相对路径、技术栈、分支模型、逻辑槽位和请求策略，后者用于本地绝对路径、私有端点和凭证变量映射。同时生成被忽略的 `workflow/local/rule-provenance.private.yaml`，用于在私有环境维护 37 条规则的原始来源和 SHA-256 指纹。
4. 如果必要资料缺失：
   - 交互式终端：逐项提问。
   - 非交互模式：生成 `workflow/INITIALIZATION_QUESTIONS.md`。
5. 生成跨工具入口：
   - Codex: 根 `AGENTS.md`（自动读取）+ 总入口 Skill + 21 个 `.agents/skills/workflow-*/` 分阶段 Skill（项目级 `.codex/prompts/` 不生成）
   - Claude Code: `CLAUDE.md`、`.claude/commands/`
   - Cursor: `.cursor/rules/` 和 `.cursor/commands/`
   - Copilot: `.github/copilot-instructions.md`
   - CodeBuddy: `.codebuddy/rules/agent-workflow.md` 和 `.codebuddy/commands/`
   - Kiro: `.kiro/steering/agent-workflow.md`；Trae: `.trae/instructions.md` 和兼容级 `.agents/skills/workflow-*/`
6. 不执行远程 Git 操作，不创建分支，不推送，不触发构建部署，不写数据库。

## 隐私与脱敏边界

本 starter kit 自身不应包含任何具体公司的业务资料、仓库名、内部系统地址、真实客户字段、真实 URL 或凭证。对外分发前运行：

```bash
node open-workflow-kit/bin/check-sanitized.cjs
```

目标团队自己的业务介绍、项目资料、代码、UI 文件、前后端规范和测试规范只在目标团队本地被引用；初始化器不把这些资料发送到外部服务。

## 生成后的工作方式

初始化完成后，目标团队按 `AGENTS.md` 和 `workflow/core/commands/` 推进：

1. `/connect-toolchain`（可选，首次接入建议执行）
2. `/new-feature`
3. `/01-需求讨论`
4. `/02-产品文档`
5. `/02B-UI设计`（可选追加 `/02C-HTML原型` 产出可点击原型）
6. `/03-技术架构`
7. `/04-代码实现`、`/04A-前端代码实现`、`/04B-后端代码实现`
8. `/05-代码审查`
9. `/06-测试用例`
10. `/07-测试执行`
11. `/08-验收表格`
12. `/09-验收`
13. `/10-培训文档`
14. `/11-上线邮件通知`
15. `/12-复盘总结`

业务代码修改必须先通过功能分支闸门、阶段闸门和并行开发隔离检查。涉及 UI 或前端的功能必须先完成 `/02B-UI设计` 并让 `/04A-前端代码实现` 遵循设计基线。文档分析和初始化不等于授权实现代码。

高风险写操作按 `workflow/core/execution-policy.md` 分级处理。仓库内 `team-profile.yaml` 只能请求或收紧权限，不能单独提权；生产部署/配置、DDL/DML、受保护分支写入和包发布永远不能仅凭仓库配置 auto。代执行明细脱敏写入被忽略的 `workflow/local/execution-audit.jsonl`，需共享时只提交最小化脱敏摘要。

## 维护建议

- 通用规则只改 `workflow/core`。
- 团队共享配置改 `workflow/team-profile.yaml`；本地私有配置只改 `workflow/local/team-profile.local.yaml`。
- 工具入口由初始化器或 adapter 生成，不把业务规则硬编码到单个工具里。
- 对外发布前先跑脱敏检查，再由人工复核许可证、示例和文档。

## 开源协作

- 贡献说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
- 安全报告说明见 [SECURITY.md](./SECURITY.md)。
- 行为准则见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。
- GitHub issue 和 PR 模板位于 `.github/`。

## 本地验证

```bash
cd /path/to/open-workflow-kit
npm run check
npm run check:history
npm run check:commands
npm run check:rules
npm run check:adapters
npm run check:links
```

`npm run check` 执行语法、工作树脱敏、prototype tokens、21 命令清单、37/79 规则映射、5 native/2 compatible 支持矩阵、API runner 和安装/升级 smoke；历史脱敏扫描单独由 `check:history` 执行。

## 本地打包

```bash
cd /path/to/open-workflow-kit
npm run build:release
```

该命令会在 `dist/` 下生成本地 tarball 和 `RELEASE_MANIFEST.md`。它不创建远程仓库、不 push、不打 tag、不执行 npm publish。

远程发布步骤见 [手动发布指南](./docs/manual-publish.md)。发布、push、tag、npm publish 必须由维护者手动执行。

维护者发布、接收方验收和支持边界见 [维护者交接](./docs/maintainer-handoff.md)。
不同工具的真实命令发现和 04 闸门验证见 [多工具命令发现人工验收](./docs/adapter-manual-acceptance.md)。
