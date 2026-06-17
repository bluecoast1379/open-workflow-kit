# Capability: deployment-readiness-checker

- **Tier**: recommended
- **Stage**: `/07`, `/11`
- **Purpose**: 区分构建成功、启动成功、部署生效和路由可达，避免把任一单点成功误写成“已上线可用”。

## 为什么需要

常见误判是：构建通过就认为部署成功，或测试环境无报错就认为新代码已经生效。部署有效性必须拆成至少四层证据：构建产物、进程 / 实例启动、目标环境加载到新版本、代表性入口可达。

## 输入

- `workflow/team-profile.yaml#repos[*]`
- 发布或测试目标环境说明
- 构建、启动、部署、路由或健康检查命令
- `/07-测试执行` 或 `/11-上线邮件通知` 的执行证据

## 输出

```yaml
result: PASS | WARN | BLOCK
checks:
  - name: build_artifact
    status: pass | fail | not-run
    evidence: "<命令、日志或产物路径>"
  - name: instance_started
    status: pass | fail | not-run
    evidence: "<启动日志、健康检查或进程证据>"
  - name: deployed_version_effective
    status: pass | fail | not-run
    evidence: "<版本、commit、包名或页面资源证据>"
  - name: representative_route_reachable
    status: pass | fail | not-run
    evidence: "<API、页面、静态资源或探针结果>"
blocked_reason: "..."
```

## 阻断规则

- 新接口、新页面或新任务没有任何可达性证据时，阻断上线结论。
- 构建成功但启动失败、实例未替换、路由未命中或版本无法确认时，不得写“部署已生效”。
- 只能做人工验证时，必须记录执行人、步骤、时间和观察结果；否则降级为 WARN。

## Adapter 示例

- **L0**: 在上线检查清单中固定四层证据。
- **L1**: prompt 要求用户粘贴构建、启动、版本和可达性结果。
- **L2**: slash command 根据 team-profile 生成环境检查表。
- **L3**: hook 阻止缺少可达性证据的上线状态变更。
- **L4**: subagent 专门整理部署证据并给出 Go / No-Go。

## 反模式

- 把 `build success` 写成“部署成功”。
- 只看旧接口可达，不检查新入口。
- 404 时只猜测代码问题，不区分未部署、路由未配置、上下文路径错误和权限拦截。
- 没有版本证据就声称目标环境已加载新代码。
