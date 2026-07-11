# /init-workspace

## Goal

初始化工作区: 扫描本地资料、生成 team-profile、缺资料提问，并生成当前工具 adapter。

## Required Inputs

- `AGENTS.md`
- `workflow/team-profile.yaml`
- Previous stage documents under workspace-level `features/{feature}/`
- Local code, local docs, and user-provided source materials listed in team-profile

## Execution Rules

- Read local facts before writing conclusions.
- Distinguish verified facts, design intent, assumptions, and missing evidence.
- 默认使用简体中文展示工作流沟通和阶段产物；专有名词、产品名、品牌名、代码标识符、命令、文件路径、分支名、API、SDK、框架、协议、标准、错误信息和官方英文术语保留原文。
- Do not claim tests, builds, screenshots, deployments, or reviews passed unless they were actually executed.
- Git、数据库、部署、生产配置和外部写操作统一按 `workflow/core/execution-policy.md` 四层最严格结果执行；仓库请求本身不是受信授权。
- This stage does not authorize business code changes unless the current command is an implementation command and all gates pass.

## Required Structure

- 扫描并列出工作区、仓库、语言 / 框架、真实分支、build/test、资料、工具 adapter 与缺失证据。
- 生成 team-profile：业务 / 组织、repos、branch_model、execution_policy、toolchain、testing、quality_budgets、completion_contract 与 risk policy。
- 分支与发布字段来自真实项目或明确 TODO；不得自动填入 `main/prod/test` 假设。
- adapter 生成、能力等级和认证状态分别记录；“文件已生成”不等于工具原生调用已认证。

## Exit Criteria

- team-profile 可解析，所有探测事实有来源，无法确认项保留 TODO / pending-question。
- branch model 与 execution policy 无硬编码冲突；秘密、私有 URL、客户数据未进入可提交文件。
- 所有启用工具的 adapter 已生成并通过本地结构校验，未认证工具诚实标记状态。
- 初始化没有修改业务代码、创建未授权分支或执行外部写操作。



## Required Outputs

- Update or create the corresponding file under workspace-level `features/{feature}/`.
- Update workspace-level `features/{feature}/00-工作流状态.md` when stage status changes.
- Record unresolved questions and evidence gaps explicitly.
