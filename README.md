# Open Workflow Kit

一个可分发给其他团队的通用研发工作流 kit。它把工作流拆成三层：

- `workflow/core`: 工具无关的流程、阶段、闸门、模板、检查能力和检查清单。
- `workflow/team-profile.yaml`: 目标团队的机器可读配置，由初始化器根据本地资料生成。
- `workflow/adapters`: 各智能体工具的薄入口，只调用当前工具自己的能力。

核心原则：同一套 workflow core，多工具 adapter 分层增强；不承诺所有工具体验完全一致。

## 核心能力（v0.5 引入，v0.6 安全加固，v0.7 生命周期治理）

| 能力块 | 说明 |
| --- | --- |
| 20 个检查能力 + 6 个事故模式清单 | `workflow/core/capabilities/` 定义检查契约；`workflow/core/checklists/` 把真实交付事故的脱敏教训展开为逐项清单（校验变更复扫、数据一致性、分支卫生、测试盲区、第三方集成、Java 陷阱） |
| 工具链 MCP 连接计划 | 初始化时自动探测 CI/CD、部署、配置中心、数据库、日志、代码托管六大槽位，生成 `workflow/TOOLCHAIN_MCP_PLAN.md`；`/connect-toolchain` 问答补齐并按"现成 MCP 优先、只读默认"推进连接 |
| 分级执行策略 | 高风险写操作（远程 Git、建分支、push、DB DDL/DML、生产配置、构建部署）默认"每次询问"：agent 出完整命令 + 风险说明 + 回滚方式，用户选择"agent 执行 / 手动执行"，代执行写入审计日志。见 `workflow/core/execution-policy.md` |
| 测试双轨自动化 | 接口轨：用户提供密钥/地址/账号后 agent 真实调用断言；功能轨：浏览器自动化 MCP 点击断言截图（Web/H5），小程序走 miniprogram-automator 指引。见 `workflow/core/testing-automation-guide.md` |
| 生命周期治理（v0.7） | `--upgrade` 自动清理旧版适配器残留（kit 指纹校验，用户自定义内容保留）并永不覆盖 team-profile；内置 `npm run check:history` 全历史凭证扫描（掩码输出）；79 条清单条目稳定 ID（VCR/DCR/BH/TBS/TIR/LPJ）可跨文档引用；Claude skills 官方推荐格式入口 |
| HTML 可点击原型 | `/02C-HTML原型` 显式阶段：强制先提取 design tokens + 组件清单，产出前端开发级单文件可点击原型（微路由 + 四态），`ui-baseline-reviewer` 用 tokens 反查卡关 |

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
npx --yes --package "git+https://github.com/bluecoast1379/open-workflow-kit.git#v0.7.0" agent-workflow-init --target . --tools codex,claude,cursor

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
3. 生成 `workflow/team-profile.yaml`（schema 1.1，含分级执行策略、工具链槽位、测试双轨配置），只记录本地路径、工具选择、技术栈和缺失项，不上传任何资料。
4. 如果必要资料缺失：
   - 交互式终端：逐项提问。
   - 非交互模式：生成 `workflow/INITIALIZATION_QUESTIONS.md`。
5. 生成跨工具入口：
   - Codex: 根 `AGENTS.md`（自动读取）+ `.agents/skills/agent-workflow/`（项目级 `.codex/prompts/` 官方不加载，不生成）
   - Claude Code: `CLAUDE.md`、`.claude/commands/`
   - Cursor: `.cursor/rules/` 和 `.cursor/commands/`
   - Copilot: `.github/copilot-instructions.md`
   - CodeBuddy: `.codebuddy/rules/agent-workflow/RULE.mdc`；Kiro: `.kiro/steering/agent-workflow.md`；Trae: `.trae/instructions.md`
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

高风险写操作（远程 Git、创建分支、push、tag、merge、数据库 DDL/DML、构建部署、生产配置写入）按 `workflow/core/execution-policy.md` 分级处理：默认每次询问——agent 给出完整命令与风险说明，用户选择"agent 执行 / 手动执行"；用户批准的代执行记入 `workflow/EXECUTION_AUDIT.md` 审计日志。团队可在 `team-profile.yaml` 把任意类别收紧为 manual（永不代执行）或放宽为 auto（常设授权，仍需风险声明与审计）。

## 维护建议

- 通用规则只改 `workflow/core`。
- 团队特化配置只改 `workflow/team-profile.yaml`。
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
```

该命令会执行脚本语法检查、starter kit 脱敏检查和临时目录 smoke test。

## 本地打包

```bash
cd /path/to/open-workflow-kit
npm run build:release
```

该命令会在 `dist/` 下生成本地 tarball 和 `RELEASE_MANIFEST.md`。它不创建远程仓库、不 push、不打 tag、不执行 npm publish。

远程发布步骤见 [手动发布指南](./docs/manual-publish.md)。发布、push、tag、npm publish 必须由维护者手动执行。

维护者发布、接收方验收和支持边界见 [维护者交接](./docs/maintainer-handoff.md)。
