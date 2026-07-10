# Capability: impact-scope-analyzer

- **Tier**: recommended
- **Stage**: `/03`
- **Purpose**: 扫描需求影响面，覆盖仓库、API、UI、数据、配置、任务、消息、测试和发布资产。

## 为什么需要

需求遗漏通常不是单点代码问题，而是影响面没画全。架构阶段必须把调用链、仓库边界、数据边界和验证边界列清楚，后续实现和审查才有依据。

## 输入

- PRD、需求讨论和技术方案
- 本地代码、文档和 team-profile 中登记的项目资料
- 用户补充的影响端、影响仓库或接口说明

## 输出

```yaml
result: PASS | WARN
scope:
  repos: ["..."]
  apis: ["..."]
  ui_surfaces: ["..."]
  data_changes: ["..."]
  config_changes: ["..."]
  jobs_or_messages: ["..."]
  tests: ["..."]
unknowns:
  - "<需确认的影响面>"
```

## 阻断规则

本能力通常不直接阻断，但高影响未知项必须在文档中显式记录。若未知项涉及数据写入、鉴权、安全、发布或生产配置，应交给对应高风险能力处理。

## Adapter 示例

- **L0**: 在 `/03` 中固定影响面矩阵。
- **L1**: prompt 按层级提问。
- **L2**: slash command 结合代码搜索生成草稿。
- **L3**: hook 检查 04 前是否存在影响面矩阵。
- **L4**: subagent 跨仓补全影响面。

## 反模式

- 只写“改后端”或“改前端”，没有仓库和文件级边界。
- 架构阶段记录一次后，后续 diff 变化不回看。
- 忽略配置、数据脚本、定时任务和发布资产。
- 未知项不写入文档。

## 相关检查清单

- `workflow/core/checklists/validation-change-review.md`：放开/收紧校验时的空值复扫五步法与全写入路径覆盖，影响面矩阵必须包含该清单的盘点结果。
