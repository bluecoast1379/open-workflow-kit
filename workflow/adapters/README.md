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
