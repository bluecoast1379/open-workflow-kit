# Capability: ux-human-factor-reviewer

- **Tier**: recommended（有用户界面、通知或行为引导时 required）
- **Stage**: `/02`, `/02B`, `/06`, `/09`
- **Purpose**: 把体验直觉拆成任务、认知、信任、恢复、可访问性与反暗黑模式的可验收约束。

## 输入

- 用户任务、02B 设计、交互原型、AC 与真实界面
- accessibility 标准和人工体验 rubric

## 输出

```yaml
result: PASS | WARN | BLOCK
tasks: [{name: "...", success_rate: "...", time_limit: "...", recovery: "..."}]
states: [{state: "loading | empty | error | offline | permission", verdict: "..."}]
human_gates: [{ac_id: "AC-...", owner: "...", rubric: []}]
```

## 阻断规则

- 关键任务没有成功 / 失败条件、错误恢复或 human gate rubric 时 BLOCK。
- 强迫、误导、隐藏成本 / 退出、利用脆弱用户等 dark pattern 命中时 BLOCK。
- 适用 accessibility 标准的 P0/P1 缺陷未关闭时 BLOCK。

## 反模式

- “感觉流畅”但没有反馈时延、完成时间或观察 rubric。
- 只验 happy path，不验空、错、慢、离线和权限状态。
- 用功能可用替代可理解、可恢复和值得信任。
