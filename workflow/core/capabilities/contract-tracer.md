# Capability: contract-tracer

- **Tier**: essential
- **Stage**: `/03`, `/05`
- **Purpose**: 追踪跨服务、跨层或前后端契约，防止只看 DTO、方法签名或兼容注解就结束审查。

## 为什么需要

字段、状态、金额、身份、权限等契约可能在入口层看似兼容，但在下游过滤、默认值、持久化或页面展示处发生偏移。关键契约必须从入口追到真实终点。

## 输入

- PRD 和技术方案
- 真实 Git diff
- 受影响模块的调用链、引用关系或静态分析结果
- team-profile 中登记的跨仓、前后端或外部接口边界

## 输出

```yaml
result: PASS | WARN | BLOCK
contracts:
  - name: "<contract>"
    upstream_entry: "<file:line>"
    downstream_terminals:
      - "<file:line>"
    predicates:
      - "<file:line applies rule>"
    verdict: pass | drift | block
missing_traces:
  - "<无法追到终点的契约>"
```

## 阻断规则

- 涉及金额、身份、权限、订单、状态等关键字段但无法追到终点时阻断。
- 两个入口声称兼容但下游过滤、默认值或错误语义不同步时阻断。
- 追踪停止在第三方库或黑盒能力时，必须记录缺口并降级为 WARN。

## Adapter 示例

- **L0**: 规定关键契约不能只看 DTO。
- **L1**: prompt 要求贴出入口到终点的调用链。
- **L2**: slash command 生成契约追踪表。
- **L3**: 静态分析 hook 暴露引用链。
- **L4**: subagent 跨文件追踪终点并给出结论。

## 反模式

- 停在 DTO 或方法签名。
- 相信“兼容”字样而不查两条路径。
- 默认数据层过滤与入口层一致。
- 用单测通过替代端到端契约追踪。
