# Agent Workflow Starter Kit

一个可分发给其他团队的通用研发工作流 starter kit。它把工作流拆成三层：

- `workflow/core`: 工具无关的流程、阶段、闸门、模板和检查能力。
- `workflow/team-profile.yaml`: 目标团队的机器可读配置，由初始化器根据本地资料生成。
- `workflow/adapters`: 各智能体工具的薄入口，只调用当前工具自己的能力。

核心原则：同一套 workflow core，多工具 adapter 分层增强；不承诺所有工具体验完全一致。

## 一键初始化

在目标团队的项目根目录运行：

```bash
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target .
```

也可以使用 shell wrapper：

```bash
/path/to/open-workflow-kit/install.sh . --tools codex,claude,cursor
```

如果你拿到的是 Git 地址或 npm 包地址，见 [Shareable Install](./docs/shareable-install.md)。

常用参数：

```bash
# 指定工具入口
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --tools codex,claude,cursor

# 工具名支持 trea 别名，会自动归一为 trae
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --tools codex,trea,codebuddy

# 非交互模式，缺失资料会写入 workflow/INITIALIZATION_QUESTIONS.md
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --yes

# 只查看会生成什么，不写文件
node /path/to/open-workflow-kit/bin/init-workspace.cjs --target . --dry-run
```

## 初始化器会做什么

1. 扫描目标工作区本地文件和目录，识别代码仓库、技术栈线索、项目资料、UI 规范、前后端规范和测试规范。
2. 生成 `workflow/team-profile.yaml`，只记录本地路径、工具选择、技术栈和缺失项，不上传任何资料。
3. 如果必要资料缺失：
   - 交互式终端：逐项提问。
   - 非交互模式：生成 `workflow/INITIALIZATION_QUESTIONS.md`。
4. 生成跨工具入口：
   - Codex: `AGENTS.md`、`.codex/prompts/`
   - Claude Code: `CLAUDE.md`、`.claude/commands/`
   - Cursor: `.cursor/rules/`
   - Copilot: `.github/copilot-instructions.md`
   - CodeBuddy / Kiro / Trae: 各自 `instructions.md`
5. 不执行远程 Git 操作，不创建分支，不推送，不触发构建部署，不写数据库。

## 隐私与脱敏边界

本 starter kit 自身不应包含任何具体公司的业务资料、仓库名、内部系统地址、真实客户字段、真实 URL 或凭证。对外分发前运行：

```bash
node open-workflow-kit/bin/check-sanitized.cjs
```

目标团队自己的业务介绍、项目资料、代码、UI 文件、前后端规范和测试规范只在目标团队本地被引用；初始化器不把这些资料发送到外部服务。

## 生成后的工作方式

初始化完成后，目标团队按 `AGENTS.md` 和 `workflow/core/commands/` 推进：

1. `/new-feature`
2. `/01-需求讨论`
3. `/02-产品文档`
4. `/03-技术架构`
5. `/04-代码实现`、`/04A-前端代码实现`、`/04B-后端代码实现`
6. `/05-代码审查`
7. `/06-测试用例`
8. `/07-测试执行`
9. `/08-验收表格`
10. `/09-验收`
11. `/10-培训文档`
12. `/11-上线邮件通知`
13. `/12-复盘总结`

业务代码修改必须先通过功能分支闸门、阶段闸门和并行开发隔离检查。文档分析和初始化不等于授权实现代码。

## 维护建议

- 通用规则只改 `workflow/core`。
- 团队特化配置只改 `workflow/team-profile.yaml`。
- 工具入口由初始化器或 adapter 生成，不把业务规则硬编码到单个工具里。
- 对外发布前先跑脱敏检查，再由人工复核许可证、示例和文档。

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

远程发布步骤见 [Manual Publish Guide](./docs/manual-publish.md)。发布、push、tag、npm publish 必须由维护者手动执行。

维护者发布、接收方验收和支持边界见 [Maintainer Handoff](./docs/maintainer-handoff.md)。
