# 多工具命令发现人工验收

本清单用于在真实 Codex、Claude Code、Cursor、GitHub Copilot、CodeBuddy、Kiro、Trae 中验证命令发现、参数传递和硬闸门。自动 conformance 或生成文件存在只说明结构一致，不代表真实工具已经认证。

## 验收环境

每个平台和客户端形态单独记录一行，禁止填写私有仓库、客户、内部 URL、凭证或生产数据：

| 字段 | 记录 |
| --- | --- |
| 工具 / 客户端形态 | `<例如 Kiro IDE / Kiro CLI>` |
| 工具版本 | `<version>` |
| 操作系统 | `<OS>` |
| 验收日期 | `<YYYY-MM-DD>` |
| kit 版本 / commit | `<version or commit>` |
| 安装方式 | `<local path / tarball / Git package>` |

## 安装与自动检查

在不含真实业务数据的临时工作区执行，`<tool>` 替换为当前工具：

```bash
agent-workflow-init --target . --tools <tool> --yes
```

确认：

- `AGENTS.md`、`workflow/core/command-manifest.yaml` 和 `workflow/team-profile.yaml` 已生成。
- 初始化没有执行远程 Git、创建分支、push、部署或数据库写入。
- `node workflow/bin/check-command-manifest.cjs` 通过。
- `node workflow/bin/check-support-matrix.cjs` 通过。
- kit 仓库中的 `node test/adapter-conformance.cjs` 通过。

## 发现入口

| 工具 | 操作 | 预期结果 |
| --- | --- | --- |
| Codex CLI / IDE | 打开 `/` Skills 列表，或使用 `/skills`、`$workflow-04` | 可按编号、slug 或中文展示名找到 `04-代码实现` |
| Claude Code | 输入 `/0` | 可模糊看到 `.claude/commands/` 中的编号阶段 |
| Cursor | 在 Agent 输入框输入 `/0` | 可看到 `.cursor/commands/` 中的编号阶段 |
| GitHub Copilot | 在支持 Prompt Files 的 IDE 打开 Prompt 选择器；再测试该版本是否支持 `/workflow-04` | 可按 slug/描述找到对应 `.prompt.md`；不支持 slash 的客户端必须如实记录 Prompt picker 路径 |
| CodeBuddy | 输入 `/0` | 可看到 `.codebuddy/commands/` 中的编号阶段及描述 |
| Kiro IDE | 输入 `/workflow-04` 或在 `/` 菜单搜索 | `inclusion: manual` 的 `.kiro/steering/` 阶段可发现 |
| Kiro CLI | 输入 `/workflow-04` | `.kiro/skills/` 中的阶段 Skill 可发现 |
| Trae | 打开 Settings > Skills & Commands，并在输入框 `/` 面板搜索 `04` | `.trae/commands/` 和项目 Skills 中可发现对应阶段 |
| Trae 中文发行版兼容检查 | 在明确使用该发行版时检查 `.trae-cn/` | 单独记录结果；不得用兼容镜像结果代替 `.trae/` 主路径认证 |

GitHub Copilot Prompt Files 目前可能受 IDE、版本和预览设置影响；应记录实际的 Prompt picker 或 slash 发现路径，不能用“文件已生成”代替。Kiro IDE 与 Kiro CLI 必须作为两条独立证据。Codex Desktop 需要从实际 Skills UI 检查，而不是仅查看磁盘目录。

## 行为验收

1. 选择需求讨论命令并附加一个合成功能名，确认 agent 读取对应 `workflow/core/commands/` 文件、`AGENTS.md` 和 `workflow/team-profile.yaml`。
2. 选择新增命令（如 `define-done` 或 `deliver-until-done`，以当前 manifest 为准），确认新命令无需手工补 adapter 即可发现。
3. 在 `main/master/prod/test` 或未登记功能分支的临时 Git 仓库中选择 `04-代码实现`。
4. 预期 agent 明确阻断代码修改，并说明缺少功能分支或阶段准入项。
5. 确认选择命令本身没有绕过 Git、实现阶段、完成契约或高风险执行策略。
6. CodeBuddy 额外确认命令没有因 `allowed-tools` 获得宽泛命令权限。
7. Codex 额外确认未显式选择阶段 Skill 时，不会仅因聊天中出现“代码实现”四字而自动进入 04。
8. Trae 额外确认 `.trae-cn/` 兼容镜像不会与 `.trae/` 主入口产生重复或冲突命令。

## 结果记录

| 检查项 | 通过 / 失败 / 不适用 | 证据说明 |
| --- | --- | --- |
| 官方项目路径被加载 |  |  |
| 模糊搜索可发现 |  |  |
| Manifest 全命令数量一致 |  |  |
| 参数或功能名传递 |  |  |
| core/profile 实际读取 |  |  |
| 04 负例被阻断 |  |  |
| 完成契约与自主循环闸门未降级 |  |  |
| 无越权工具能力 |  |  |
| 安装与升级无异常 |  |  |

## 回写规则

- 只有当前工具/客户端的上述项目全部通过，才可在 `workflow/adapters/support-matrix.yaml` 对应项追加脱敏后的 `manual_acceptance_evidence`。
- 证据使用可被检查器解析的行内数组，例如 `manual_acceptance_evidence: ["Kiro IDE <version> | 2026-07-11 | <public-or-sanitized-evidence>"]`。
- 证据至少包含工具版本、日期和公开 issue/PR 或本地脱敏报告路径，不粘贴业务截图和内部路径。
- `native_verified` 必须有当前发布版本的证据；旧版本验收不能自动沿用。
- Kiro IDE 与 CLI、Copilot 不同 IDE、Trae 主路径与 `.trae-cn` 兼容路径都应注明客户端边界。
- 自动 conformance 绝不自动写入 `manual_acceptance_evidence`，也绝不自动把状态升级为 `native_verified`。
