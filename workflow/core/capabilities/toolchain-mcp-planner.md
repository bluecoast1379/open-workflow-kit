# Capability: toolchain-mcp-planner

- **Tier**: recommended
- **Stage**: `init-workspace`、`connect-toolchain`，也可在 `/03` 补充
- **Purpose**: 探测团队工具链（日志、构建、部署、配置、数据库、代码托管等槽位），生成并维护 MCP 连接计划，让 agent 能以最小权限接入证据链。

## 为什么需要

排查、验证、发布核查都依赖真实证据，而证据分散在团队的日志平台、CI/CD、部署运行态、配置中心和数据库里。没有连接计划时，每次都靠用户手工粘贴；有了槽位化的 MCP 计划，接入方式、权限边界和凭证要求就是显式可审的。

## 槽位模型

| 槽位 | 举例（可替换 provider） |
| --- | --- |
| runtime_logs | ELK / Loki / CloudWatch / 云日志服务 |
| ci_cd | Jenkins / GitHub Actions / GitLab CI / CircleCI |
| deploy_runtime | Kubernetes / Docker / Serverless / 自建平台 |
| config_center | Nacos / Apollo / Consul / 环境变量 |
| database | MySQL / PostgreSQL / MongoDB / 数据网关 |
| git_platform | GitHub / GitLab / Bitbucket / Gitea |

具体 provider 只存在于 `workflow/team-profile.yaml#toolchain`，不硬编码进 core。

## 输入

- 初始化器的工具链探测结果（`team-profile.yaml#toolchain`）
- 用户问答补充（常用工具菜单选择，或自由输入工具名称与地址）
- 对未知工具的调研结论（官方文档、API 形态、是否已有现成 MCP server）

## 输出

`workflow/TOOLCHAIN_MCP_PLAN.md`，每个槽位一节：

```yaml
slot: runtime_logs
detected: true | false
evidence: ["<检测到的文件或配置路径>"]
provider: "<团队实际使用的工具>"
recommendation: existing-mcp | rest-wrapper | custom-build
connect_options:
  - "<现成 MCP server 名称或包装方案>"
permission: read_only          # 默认只读
credentials_env: ["<环境变量名占位，不含真实值>"]
status: proposed | approved | connected | deferred | not-needed
```

## 阻断规则

- 任何真实凭证（token、密码、连接串）出现在计划文档或仓库中即 BLOCK；凭证只允许以环境变量名占位。
- 未经用户按执行策略批准，不得写入任何 AI 工具的 MCP 客户端配置（属 `config_write` 类别）。
- 连接默认 read_only；申请写权限必须单独列出动作清单并按执行策略审批。
- 现成 MCP server 优先；只有确认无现成方案时才提出自研包装，并给出工作量与维护成本评估。

## Adapter 示例

- **L0**: 计划文档 + 手工配置说明。
- **L1**: prompt 引导逐槽位问答并生成计划草稿。
- **L2**: slash command 读取探测结果、更新计划、输出配置片段。
- **L3**: hook 在会话开始时提示未完成的槽位连接。
- **L4**: subagent 调研未知工具并回填连接方案。

## 反模式

- 把某公司内部系统名硬编码进通用 core。
- 计划文档里写真实密钥或内网地址。
- 默认申请写权限，或把连接器当成绕过执行策略的通道。
- 未调研就臆造"现成 MCP server"；调研结论必须给出来源。
