# Adapters

Adapters 是从同一套 workflow core 和 `team-profile.yaml` 生成的工具特定薄入口。

它们的职责：

- 帮当前工具找到 `AGENTS.md`、`workflow/core/` 和 `workflow/team-profile.yaml`。
- 按当前工具能力暴露 slash commands、prompts、rules 或 instructions。
- 保持工具入口轻量，不复制或改写 core 规则。

它们不能：

- 削弱 `workflow/core` 的硬闸门。
- 调用另一个工具的私有能力。
- 承诺所有工具体验完全一致。
- 写入凭证、真实客户数据、私有 URL 或生产配置。

## 各工具生成入口（官方路径已核实）

- Codex: 根 `AGENTS.md`（自动读取）+ `.agents/skills/agent-workflow/SKILL.md`；项目级 `.codex/prompts/` 官方不加载，不生成。
- Claude Code: `CLAUDE.md` + `.claude/commands/`（兼容格式；官方新推荐 skills，kit 计划后续版本切换）。
- Cursor: `.cursor/rules/*.mdc` + `.cursor/commands/*.md`（1.6+ 自定义斜杠命令）。
- GitHub Copilot: `.github/copilot-instructions.md`。
- CodeBuddy: `.codebuddy/rules/agent-workflow/RULE.mdc`。
- Kiro: `.kiro/steering/agent-workflow.md`（Kiro 也自动读取根 `AGENTS.md`）。
- Trae: `.trae/instructions.md`。

## 已验证能力矩阵（核实日期：2026-07，依据各工具官方文档）

| 工具 | 官方项目级入口 | kit 生成 | 验证状态 |
| --- | --- | --- | --- |
| Codex | 根 `AGENTS.md`；`.agents/skills/` | 根 AGENTS.md + skills | ✅ 官方文档核实 |
| Claude Code | `.claude/commands/`（兼容）；新推荐 `.claude/skills/` | commands | ✅ 官方文档核实 |
| Cursor | `.cursor/rules/` + `.cursor/commands/` | 两者 | ✅ 官方文档核实 |
| GitHub Copilot | `.github/copilot-instructions.md` + `.github/prompts/` | instructions（prompts 规划中） | ✅ 官方文档核实 |
| CodeBuddy | `.codebuddy/rules/<name>/RULE.mdc` 或根 `CODEBUDDY.md` | rules/RULE.mdc | ✅ 官方文档核实 |
| Kiro | `.kiro/steering/*.md` 或根 `AGENTS.md` | steering + 根 AGENTS.md | ✅ 官方文档核实 |
| Trae | 未见官方项目级规范 | instructions.md | ⚠️ 社区惯例 |
