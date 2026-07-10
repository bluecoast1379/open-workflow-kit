# 接口测试计划（api-test-plan）

> 由 `/06-测试用例` 生成、`/07-测试执行` 按 `automated-test-runner` 能力执行。
> 凭证与真实测试数据写入本地未跟踪文件（默认 `workflow/local/test-credentials.env`），**禁止**写入本文档或提交进仓库。

## 环境

| 项 | 值 |
| --- | --- |
| 目标环境 | <test / staging，必须在 team-profile#testing.environment_allowlist 内> |
| Base URL | <环境地址> |
| 鉴权方式 | <token / signature / cookie / oauth，说明获取步骤> |
| 凭证来源 | `workflow/local/test-credentials.env` 中的变量名清单 |
| 生产防护 | 目标为生产环境时本计划不得执行（默认 BLOCK） |

## 测试数据准备

| 数据项 | 来源 | 说明 |
| --- | --- | --- |
| 测试账号 | <env 变量名> | <角色/权限> |
| 业务前置数据 | <构造方式> | <如需先创建订单/单据，写清构造步骤> |

## 用例矩阵

| 用例号 | 场景 | 方法与端点 | 入参要点 | 断言（状态码/业务码/关键字段） | 类型 |
| --- | --- | --- | --- | --- | --- |
| API-001 | <正常流> | POST /api/... | ... | 200 且 code=0 且 data.id 非空 | 正向 |
| API-002 | <参数缺失> | POST /api/... | 缺 <字段> | 4xx 或业务错误码 <码> | 负向 |
| API-003 | <权限边界> | GET /api/... | 用低权限账号 | 拒绝且无数据泄漏 | 权限 |
| API-004 | <重复提交> | POST /api/... | 同参数连发 2 次 | 第二次幂等（不重复创建） | 幂等 |

> 用例设计须对照 `workflow/core/checklists/test-blind-spots.md` 十类盲区逐类核对。

## 执行记录（由 /07 回填）

| 用例号 | 结果 | 证据（脱敏摘要） | 备注 |
| --- | --- | --- | --- |
| API-001 | pass / fail / not-run | <请求响应摘要，敏感字段打码> | |
