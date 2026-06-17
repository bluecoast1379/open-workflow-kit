# Capability: verify-app

- **Tier**: recommended
- **Stage**: `/04` 结束前，`/07` 全程
- **Purpose**: 用真实执行的验证计划替代“看起来可用”，记录构建、单测、集成、浏览器或人工验证证据。

## 为什么需要

验证质量直接决定审查和交付质量。即使验证很小，也要写清命令、结果和证据；不能把未执行的测试、跳过的测试或构建通过写成业务验证通过。

## 输入

- `workflow/team-profile.yaml#repos[*].tech_stack`
- `04-代码实现.md` 中的实现范围
- 可用 CI 命令、本地脚本和人工流程
- 历史成功验证命令

## 输出

```yaml
result: PASS | WARN | BLOCK
verifications:
  - repo: "<repo>"
    method: unit | integration | e2e | manual | build-only
    command: "<实际执行命令>"
    status: pass | fail | not-run
    evidence: "<日志、截图或观察记录>"
gaps:
  - "<未执行原因>"
```

## 阻断规则

- 实现阶段结束时，所有受影响仓库都没有成功验证且无原因记录时阻断。
- 测试命令跳过测试、无断言输出或只有编译成功时，不能写成业务验证通过。
- 只能人工验证时，必须记录步骤和观察结果；否则降级为 WARN。

## Adapter 示例

- **L0**: `04-代码实现.md` 必须有验证章节。
- **L1**: prompt 根据技术栈建议验证命令。
- **L2**: slash command 执行本地验证并写入结果。
- **L3**: hook 阻止缺少验证记录的完成状态。
- **L4**: subagent 专门执行和整理验证结果。

## 反模式

- 没有证据就标记实现完成。
- 只贴日志，不写命令。
- `BUILD SUCCESS` 但测试被跳过，仍写“测试通过”。
- 用一个技术栈的验证方式套所有项目。
