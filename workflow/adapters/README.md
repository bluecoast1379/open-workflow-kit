# Adapters

Adapters 是从同一套 workflow core 和 `team-profile.yaml` 生成的工具特定薄入口。

它们只负责：

- 帮当前工具找到 `AGENTS.md`、`workflow/core/` 和 `workflow/team-profile.yaml`。
- 按当前工具能力暴露 slash commands、skills、rules 或 instructions。
- 保持入口轻量，不复制或改写 core 规则。

它们不能：

- 削弱 `workflow/core` 的硬闸门或执行策略。
- 把仓库内 profile 当成高危 auto 的唯一信任源。
- 调用另一个工具的私有能力。
- 承诺所有工具体验完全一致。
- 写入凭证、真实客户数据、私有 URL 或生产配置。

## 对外支持口径

- **5 个原生 adapter**：Codex、Claude Code、Cursor、GitHub Copilot、CodeBuddy。
- **2 个兼容入口**：Kiro、Trae。

命令发现能力分为三类：

- `slash_fuzzy`：输入 `/` 后模糊选择项目命令，适用于 Claude Code、Cursor、CodeBuddy。
- `skill_fuzzy`：从项目 Skills 中按编号或描述选择，适用于 Codex；Trae 按兼容级 Skill 入口提供。
- `instruction_reference`：读取规则后引用 core command，适用于暂未提供项目命令发现入口的工具。

生成了工具特定文件不等于已完成原生验收。任何工具只有在官方加载路径、阶段/能力调用、core/profile 加载、闸门不降级、install/upgrade smoke 和真实工具人工验收全部通过后，才能标记 `native_verified`。详细状态见 `support-matrix.yaml`。

## 生成入口

- Codex: 根 `AGENTS.md` + 总入口 Skill + 21 个 `.agents/skills/workflow-*/` 分阶段 Skill；每个阶段包含 `agents/openai.yaml` 中文展示信息，不生成项目级 `.codex/prompts/`。
- Claude Code: `CLAUDE.md` + `.claude/commands/` + `.claude/skills/agent-workflow/SKILL.md`。
- Cursor: `.cursor/rules/*.mdc` + `.cursor/commands/*.md`。
- GitHub Copilot: `.github/copilot-instructions.md`。
- CodeBuddy: `.codebuddy/rules/agent-workflow.md` + `.codebuddy/commands/*.md` + 根 `AGENTS.md`；命令不声明宽泛 `allowed-tools`。
- Kiro: `.kiro/steering/agent-workflow.md` + 根 `AGENTS.md`（compatible）。
- Trae: `.trae/instructions.md` + `.agents/skills/workflow-*/` + 根 `AGENTS.md`（compatible）；不生成未经确认的 `.trae/commands/`。

所有阶段名称、描述、参数提示、Skill slug 和实现闸门标记来自 `workflow/core/command-manifest.yaml`。adapter 只能引用对应 core command，不能各自维护一份阶段定义。

## 验收要求

每个工具的验收记录必须包含：工具版本、核实日期、官方路径来源、安装/升级结果、一个阶段命令的真实调用、core/profile 实际加载证据和硬闸门反例。缺任一项时不得写 `native_verified`。

目标工作区可直接运行：

```bash
node workflow/bin/check-support-matrix.cjs
```
