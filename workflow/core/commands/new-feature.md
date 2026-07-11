# /new-feature

## Goal

初始化功能工作流: 创建工作区级 features/{feature}/ 容器、状态文件和截图目录。

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

- 规范化且稳定的 feature ID / slug、显示名称、Owner 与初始目标。
- 创建 `features/{feature}/`、`00-工作流状态.md`、draft `completion/contract.yaml`、`completion/environment.yaml`、`completion/findings.yaml`、`completion/evidence/`、`completion/run-state.yaml` 与截图目录。
- 初始 contract 明确为 draft，必须包含 schema/version、scope、governance、attestation、anchor 与 anti-cheating 默认值；environment/findings placeholder 必须填写后才能签发 permit 或运行。
- 检查同名 feature、跨 feature 路径冲突和已有未完成工作；不得覆盖历史产物。

## Exit Criteria

- feature 容器唯一且结构完整，状态页 / contract / environment / findings / run-state 对同一 feature ID 与版本一致。
- Evidence Ledger 为 append-only 预留位置，没有伪造 PASS 或执行时间。
- workspace 文档与目标代码仓库分离；未触发实现、分支、发布或外部写操作。
- 下一允许阶段和缺失输入被明确列出。



## Required Outputs

- Update or create the corresponding file under workspace-level `features/{feature}/`.
- Update workspace-level `features/{feature}/00-工作流状态.md` when stage status changes.
- Record unresolved questions and evidence gaps explicitly.
