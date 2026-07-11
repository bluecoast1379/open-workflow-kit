# /workflow-status

## Goal

工作流状态: 汇总 features 下所有需求的阶段状态、阻塞和下一步。

## Required Inputs

- `AGENTS.md`
- `workflow/team-profile.yaml`
- Previous stage documents under workspace-level `features/{feature}/`
- 每个 feature 的 `features/{feature}/completion/contract.yaml`（Completion Contract）、Evidence Ledger 与 run-state
- Local code, local docs, and user-provided source materials listed in team-profile

## Execution Rules

- Read local facts before writing conclusions.
- Distinguish verified facts, design intent, assumptions, and missing evidence.
- 默认使用简体中文展示工作流沟通和阶段产物；专有名词、产品名、品牌名、代码标识符、命令、文件路径、分支名、API、SDK、框架、协议、标准、错误信息和官方英文术语保留原文。
- Do not claim tests, builds, screenshots, deployments, or reviews passed unless they were actually executed.
- Git、数据库、部署、生产配置和外部写操作统一按 `workflow/core/execution-policy.md` 四层最严格结果执行；本状态命令不扩大授权。
- This stage does not authorize business code changes unless the current command is an implementation command and all gates pass.

## Required Structure

- 按 feature 汇总当前阶段、contract version/hash、source/environment fingerprint、实现 / 分支 / worktree gate。
- 聚合 blocking AC 的 PASS/FAIL/BLOCKED/NOT_RUN/STALE/WAIVED、开放 P0/P1、scope drift、自动终态与 human acceptance。
- 列出假设、依赖、decision packet、waiver 到期、证据新鲜度、预算与下一允许动作。
- 分支 / 发布流展示 team-profile 的真实值，不使用模板默认值。

## Exit Criteria

- 汇总值可由各 feature contract / ledger / run-state 重算，状态冲突显式标为 BLOCKED。
- 未运行、过期、豁免和失败均未被计入 PASS；READY / ACCEPTED / RELEASED 不混用。
- 每个阻断有具体 AC / decision、Owner 和下一动作；只读状态检查不扩大授权。
- 未发现 feature 不会被错误标为已完成；缺失或损坏的状态文件有明确诊断。



## Required Outputs

- Update or create the corresponding file under workspace-level `features/{feature}/`.
- Update workspace-level `features/{feature}/00-工作流状态.md` when stage status changes.
- Record unresolved questions and evidence gaps explicitly.
