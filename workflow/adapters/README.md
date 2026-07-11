# Adapters

Adapters 是从同一套 workflow core、`command-manifest.yaml` 和 `team-profile.yaml` 生成的工具特定薄入口。目标不是让七个平台长得完全一样，而是让用户都能从各自官方的项目级发现入口模糊找到同一条命令，并最终执行同一个 core contract。

它们只负责：

- 帮当前工具找到 `AGENTS.md`、`workflow/core/` 和 `workflow/team-profile.yaml`。
- 从 manifest 为每一条命令生成 slash command、skill 或 prompt file。
- 保持入口轻量，不复制或改写 core 规则。
- 明确区分“生成结构通过”“真实工具人工验收通过”。

它们不能：

- 削弱 `workflow/core` 的硬闸门或执行策略。
- 把命令/Skill 被选择解释为代码修改、高风险写入或发布授权。
- 把仓库内 profile 当成高危 `auto` 的唯一信任源。
- 承诺不同 IDE、CLI 和版本的 UI 行为完全一致。
- 因为文件存在就把 `verification_status` 改成 `native_verified`。

## 支持口径

当前为 7 个官方项目级 adapter：Codex、Claude Code、Cursor、GitHub Copilot、CodeBuddy、Kiro、Trae。

“官方项目级 adapter”只表示项目路径和发现机制有官方依据，不表示当前发布版本已经在真实工具中认证。发布前，七个平台都必须保持 `native_not_yet_manually_certified`；只有完成 kit 仓库中的 `docs/adapter-manual-acceptance.md` 并回填当前版本证据后，才能标记 `native_verified`。

| 工具 | 主要发现方式 | Manifest 命令入口 |
| --- | --- | --- |
| Codex | Desktop `/` 的 Skills 分组；CLI/IDE 用 `/skills`、`$<skill>` | `.agents/skills/{skill_slug}/SKILL.md` |
| Claude Code | `/` 命令模糊选择 | `.claude/commands/{id}.md` |
| Cursor | Agent 输入框 `/` 命令模糊选择 | `.cursor/commands/{id}.md` |
| GitHub Copilot | Prompt 选择器；部分 IDE 支持 `/` prompt 调用 | `.github/prompts/{skill_slug}.prompt.md` |
| CodeBuddy | `/` 命令模糊选择 | `.codebuddy/commands/{id}.md` |
| Kiro IDE | `inclusion: manual` steering 出现在 `/` 菜单 | `.kiro/steering/{skill_slug}.md` |
| Kiro CLI | workspace Skill 自动成为 slash command | `.kiro/skills/{skill_slug}/SKILL.md` |
| Trae / Trae CN | Settings > Skills & Commands；`/` command panel | `.trae/commands/{id}.md` |

GitHub Copilot Prompt Files 仍可能受 IDE、版本或预览开关影响，因此它的 `invocation_style` 是 `prompt_fuzzy`。Codex 是 `skill_picker_fuzzy`：Desktop 可在 `/` 面板选择 Skill，但不支持项目级字面 `/01-需求讨论` 命令；CLI/IDE 使用 `/skills` 或 `$skill`。Kiro IDE 与 CLI 是两条不同的官方发现路径，必须分别验收。Trae CN 的项目命令与国际版一样读取 `.trae/commands/`。Cursor 和 Trae 也扫描开放标准 `.agents/skills/`，因此与 Codex 共存时可能在 Skills 分组额外显示 Codex 阶段 Skill；不能把这一跨客户端可见性误写成 Trae/Cursor 自己重复生成。

官方路径依据：Codex 的 [Build skills](https://learn.chatgpt.com/docs/build-skills) 与 [Slash commands](https://learn.chatgpt.com/docs/reference/slash-commands) 说明 enabled Skills 会进入 slash 列表；Kiro 的 [Slash commands](https://kiro.dev/docs/chat/slash-commands/) 与 [Steering](https://kiro.dev/docs/steering/) 说明 `inclusion: manual` steering 会进入 `/` 菜单，[Kiro CLI slash commands](https://kiro.dev/docs/cli/reference/slash-commands/) 说明 `.kiro/skills/` Skill 会自动成为 slash command；Trae 的 [Skills](https://docs.trae.ai/ide/skills) 与 [Changelog](https://www.trae.ai/changelog) 记录项目级 Skills、Skills & Commands 和 `.trae/commands/`。

## 单一事实源

所有命令 ID、中文标题、描述、参数提示、Skill slug 和实现闸门标记来自 `workflow/core/command-manifest.yaml`。初始化器必须遍历 `manifest.commands`，不能硬编码命令数量，也不能让某个平台漏生成新命令。

生成入口如下：

- Codex：根 `AGENTS.md`、总入口 Skill、每命令 Skill 和 `agents/openai.yaml` 展示元数据；`invocation_style` 为 `skill_picker_fuzzy`，不生成项目级 `.codex/prompts/`。
- Claude Code：`CLAUDE.md`、每命令 `.claude/commands/`、总入口 Skill。
- Cursor：始终规则和每命令纯 Markdown `.cursor/commands/`。
- GitHub Copilot：仓库指令和每命令 `.github/prompts/*.prompt.md`。
- CodeBuddy：项目规则和每命令 `.codebuddy/commands/`；命令禁止模型隐式调用，且不声明宽泛 `allowed-tools`。
- Kiro：始终 steering、每命令 manual steering、每命令 CLI Skill。
- Trae：每命令只生成 `.trae/commands/`；总工作流 Skill 单独保留，不生成重复阶段 Skill 或 `.trae-cn/` 项目镜像。

## 自动一致性与人工验收

`test/adapter-conformance.cjs` 会在临时目录逐工具安装，然后验证：

- 每条 manifest 命令都存在对应入口；
- 入口引用正确的 core command、`AGENTS.md` 和 team profile；
- 命令描述和参数提示来自 manifest；
- 没有遗留路径或宽泛越权声明；
- 删除任一命令入口会被反例校验捕获；
- support matrix 不会在缺少人工证据时接受 `native_verified`。

这仍不是 UI 真机验收。目标工作区可运行：

```bash
node workflow/bin/check-support-matrix.cjs
```

kit 仓库发布前还应运行：

```bash
node test/adapter-conformance.cjs
```
