# 多工具命令发现人工验收

本清单用于在真实 Claude Code、Cursor、CodeBuddy、Codex、Trae 中验证命令发现和硬闸门。生成文件存在只代表自动一致性通过，不代表真实工具已经认证。

## 验收环境

每位验收人记录以下信息，禁止填写私有仓库、客户、内部 URL、凭证或生产数据：

| 字段 | 记录 |
| --- | --- |
| 工具 | `<Claude Code / Cursor / CodeBuddy / Codex / Trae>` |
| 工具版本 | `<version>` |
| 操作系统 | `<OS>` |
| 验收日期 | `<YYYY-MM-DD>` |
| kit 版本 / commit | `<v0.9.0 or commit>` |
| 安装方式 | `<local path / tarball / Git package>` |

## 安装

在不含真实业务数据的临时工作区执行，`<tool>` 替换为当前工具：

```bash
agent-workflow-init --target . --tools <tool> --yes
```

确认：

- `AGENTS.md`、`workflow/core/command-manifest.yaml` 和 `workflow/team-profile.yaml` 已生成。
- 初始化过程没有执行远程 Git、创建分支、push、部署或数据库写入。
- `node workflow/bin/check-command-manifest.cjs` 通过。
- `node workflow/bin/check-support-matrix.cjs` 通过。

## 发现入口

| 工具 | 操作 | 预期结果 |
| --- | --- | --- |
| Claude Code | 输入 `/0` | 可模糊看到编号阶段，例如 `01-需求讨论`、`04-代码实现` |
| Cursor | 在 Agent 输入框输入 `/0` | 可看到 `.cursor/commands/` 中的编号阶段 |
| CodeBuddy | 输入 `/0` | 可看到 `.codebuddy/commands/` 中的编号阶段及描述 |
| Codex CLI/IDE | 输入 `$workflow-04` 或 `/skills` | 可看到 `04-代码实现 代码实现总览`；Desktop 从 Skills 入口检查 |
| Trae | 打开 Skills/命令发现入口并搜索 `workflow-04` | 支持 Agent Skills 的版本应发现对应 Skill；如未发现，记录具体版本和界面行为，不改写为通过 |

## 行为验收

1. 选择 `01-需求讨论`，输入合成的功能名，确认 agent 读取 `workflow/core/commands/01-需求讨论.md`。
2. 在 `main/master/prod/test` 或未登记功能分支的临时 Git 仓库中选择 `04-代码实现`。
3. 预期 agent 明确阻断代码修改，并说明缺少功能分支或 04 准入项。
4. 确认命令选择本身没有绕过 Git、实现阶段和高风险执行策略。
5. CodeBuddy 额外确认命令没有因 `allowed-tools` 获得宽泛命令权限。
6. Codex 额外确认没有显式选择阶段 Skill 时，不会仅因聊天中出现“代码实现”四字而自动进入 04。

## 结果记录

| 检查项 | 通过 / 失败 / 不适用 | 证据说明 |
| --- | --- | --- |
| 入口文件加载 |  |  |
| 模糊搜索可发现 |  |  |
| 参数或功能名传递 |  |  |
| core/profile 实际读取 |  |  |
| 04 负例被阻断 |  |  |
| 无越权工具能力 |  |  |
| 安装与升级无异常 |  |  |

## 回写规则

- 只有上述项目全部通过，才可在 `workflow/adapters/support-matrix.yaml` 的对应工具下追加脱敏后的 `manual_acceptance_evidence`。
- 证据使用可被检查器解析的行内数组，例如 `manual_acceptance_evidence: ["CodeBuddy <version> | 2026-07-11 | <public-or-sanitized-evidence>"]`。
- 证据至少包含工具版本、日期和公开 issue/PR 或本地脱敏报告路径，不粘贴业务截图和内部路径。
- `native_verified` 必须有当前发布版本的证据；旧版本验收不能自动沿用。
- Trae 在 slash panel 项目导入约定未确认前保持 `compatible`，即使 Agent Skills 可用也不能宣称与 Claude Code `/` 体验一致。
