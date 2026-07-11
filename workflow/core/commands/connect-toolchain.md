# /connect-toolchain

## 目标

工具链连接规划: 探测或收集团队的日志、构建、部署、配置、数据库、代码托管等工具，生成并维护 `workflow/TOOLCHAIN_MCP_PLAN.md`，按用户选择推进 MCP 连接。

## 必要输入

- `AGENTS.md`
- `workflow/team-profile.yaml`（重点读 `toolchain` 段）
- `workflow/TOOLCHAIN_MCP_PLAN.md`（初始化器已生成的探测版）
- `workflow/core/capabilities/toolchain-mcp-planner.md`
- `workflow/core/execution-policy.md`

## 执行流程

1. **读取现状**：加载 TOOLCHAIN_MCP_PLAN 中每个槽位的状态（proposed / approved / connected / deferred / not-needed）。
2. **补齐缺失槽位（问答式）**：对 `detected: false` 的槽位逐个询问用户：
   - 先给常用工具菜单（如 ci_cd: Jenkins / GitHub Actions / GitLab CI / CircleCI / 其他 / 不使用）；
   - 用户选"其他"时，让用户输入工具名称与文档/服务地址。
3. **调研未知工具**：对菜单外的工具，先调研其官方文档与 API 形态（是否有现成 MCP server、是否有 REST API 可包装、鉴权方式），调研结论必须给出来源，禁止臆造"现成 MCP server"。
4. **更新计划**：把每个槽位的推荐方案写回 TOOLCHAIN_MCP_PLAN：现成 MCP 优先（existing-mcp）→ REST 包装次之（rest-wrapper）→ 自研兜底（custom-build，附工作量评估）；权限默认 read_only；凭证只写环境变量名占位。
5. **用户选择连接节奏**：一键连接全部已批准槽位，或逐个勾选；未选槽位标记 deferred。
6. **执行连接**：为已批准槽位生成当前 AI 工具的 MCP 客户端配置片段 + 凭证环境变量说明 + 只读验证步骤（如列出工具、执行一次只读探活）。写入工具客户端配置属于 `config_write` 类别，按 execution-policy 四层最严格结果处理。

## 执行规则

- 先读取本地事实，再写结论；调研结论标注来源。
- 任何真实凭证不得写入计划文档、team-profile 或仓库；只允许环境变量名占位。
- 连接默认申请只读权限；需要写权限的槽位必须单独列动作清单并按执行策略审批。
- 本命令不授权修改业务代码，也不授权直接执行部署、数据库写入等操作——那些属于被连接工具的使用阶段，仍受执行策略约束。

## Required Structure

- 每个 toolchain slot 的现状、证据、候选 provider、官方来源、能力 /权限、连接方式、凭证变量名和风险。
- `existing-mcp / rest-wrapper / custom-build` 比较、推荐、用户决策、状态与只读 smoke test。
- 当前工具的配置位置、脱敏配置片段、回滚 / 断开方式和 execution-policy 有效结果。
- 连接后的 evidence types、capability mapping、可用 / 不可用边界与未认证声明。

## Exit Criteria

- 所有目标 slot 为 connected / deferred / not-needed / blocked 之一，无未解释 proposed 状态。
- connected slot 通过最小只读 smoke test，或明确标记未验证；不存在真实凭证入库。
- 写权限、高风险动作和生产访问没有因“已连接”而获得隐式授权。
- team-profile 与 TOOLCHAIN_MCP_PLAN 状态一致，审计记录按策略写入本地忽略文件。

## 必要输出

- 更新 `workflow/TOOLCHAIN_MCP_PLAN.md`（槽位状态、推荐方案、连接配置指引）。
- 更新 `workflow/team-profile.yaml#toolchain`（provider 与状态）。
- 若执行了连接：按执行策略脱敏记录到被 Git 忽略的 `workflow/local/execution-audit.jsonl`；不创建、不追加可提交的 `workflow/EXECUTION_AUDIT.md`。
