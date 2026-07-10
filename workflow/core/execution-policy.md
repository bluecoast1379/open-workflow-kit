# Execution Policy（分级执行策略）

本策略定义高风险写操作的执行方式。它细化（而不是放松）既有硬闸门："高风险写操作默认不交给 agent 自动执行"仍然成立；变化在于：agent 必须把命令准备到可直接执行的程度，并把"谁来执行"的选择权交给用户。

## 覆盖类别

| 类别 | 键 | 示例 |
| --- | --- | --- |
| 远程 Git 操作 | `remote_git` | fetch / pull / clone / remote update |
| 分支创建 | `branch_creation` | 创建开发分支、worktree 对应分支 |
| 推送与合并 | `push_tag_merge` | push / tag / merge / 删除远端分支 |
| 数据库结构变更 | `db_ddl` | 建表、加列、索引变更 |
| 数据库数据变更 | `db_dml` | 订正、补数、批量更新 |
| 生产配置写入 | `production_config_write` | 配置中心发布、生产环境变量 |
| 构建部署触发 | `build_deploy_trigger` | 触发流水线、部署、回滚 |
| 工具客户端配置写入 | `config_write` | MCP 客户端配置、编辑器全局配置 |

## 三种模式

| 模式 | 含义 |
| --- | --- |
| `ask`（默认） | agent 给出完整命令/配置 + 风险说明，用户**每次**选择"agent 执行"或"我手动执行"；选 agent 执行则执行并写审计日志。 |
| `manual` | agent 只给命令与说明，永不代执行；适合团队想锁死的类别。 |
| `auto` | 常设授权：agent 可不再逐次询问，但每次执行前仍必须输出风险说明，执行后仍必须写审计日志。仅当团队在 `team-profile.yaml#execution_policy` 显式配置后生效。 |

各类别模式配置在 `workflow/team-profile.yaml#execution_policy.categories`；未配置的类别按 `default_mode` 处理；无法归类的写操作一律按 `ask` 处理。

## ask 模式的呈现格式（强制）

agent 请求执行任何覆盖类别的操作时，必须一次性给出：

1. **命令/配置全文**：可直接复制执行，不允许伪代码。
2. **目的**：这次执行解决什么问题。
3. **爆炸半径**：影响哪些分支/库表/环境/下游，最坏情况是什么。
4. **回滚方式**：如何撤销；不可回滚必须显式写"不可回滚"。
5. **前置证据**：为什么现在执行是安全的（相关检查能力的结论）。

然后由用户选择：**agent 执行 / 我手动执行 / 暂不执行**。用户选手动时，agent 等待用户回贴执行结果再继续。

## 审计日志

用户批准的每次代执行都追加到 `workflow/EXECUTION_AUDIT.md`：

```markdown
## <ISO 时间> | <类别> | <ask|auto>
- 命令: `<执行的命令>`
- 目的: <一句话>
- 授权: 用户本次批准 / team-profile 常设授权
- 结果: 成功 / 失败（含关键输出摘要）
- 回滚方式: <记录>
```

## auto 模式的额外约束

- 只能通过编辑 `team-profile.yaml` 显式开启，agent 不得建议性地代填。
- `production_config_write` 与 `build_deploy_trigger` 即使配置为 auto，首次执行仍必须 ask 一次并确认团队理解风险。
- 审计日志缺失时，auto 权限视为失效，回退 ask。

## 与既有表述的关系

core 文档与能力文件中"必须人工执行 / manual-only"的表述，统一按本策略解释：默认 `ask`（用户每次选择执行者），团队可收紧为 `manual` 或放宽为 `auto`。任何 adapter、插件、MCP 连接器都不得绕过本策略。
