# Capability: release-safety-checker

- **Tier**: essential
- **Stage**: `/05`, `/07`, `/11`
- **Purpose**: 对比发布候选分支与生产基线，确保发布范围与文档一致，防止无关提交进入生产。

## 为什么需要

从集成分支、测试分支或污染分支派生发布候选，是范围泄漏的常见原因。发布安全判断必须默认按“整条分支可能上线”处理，用生产基线差异核查代替主观判断。

## 输入

- `workflow/team-profile.yaml#branch_model.production_branch`
- 发布候选分支名
- `02-产品文档.md` 和 `04-代码实现.md` 中登记的发布范围
- 用户手动刷新后的本地 Git 引用或明确标记的本地缓存引用
- `workflow/team-profile.yaml#risk_policy.high_risk_files`

## 输出

```yaml
result: PASS | WARN | BLOCK
checks:
  - name: production_is_ancestor
    status: pass | block
    detail: "生产基线是否为发布候选祖先"
  - name: commit_count
    status: pass | warn | block
    detail: "<N> commits ahead"
  - name: file_diff_count
    status: pass | warn | block
    detail: "<N> files changed"
  - name: high_risk_files_touched
    status: pass | block
    files: ["..."]
overall_risk: P0 | P1 | P2 | P3
blocked_reason: "..."
recommended_action: "从生产基线重建干净分支，只带入本期登记提交。"
```

## 阻断规则

- 生产基线不是发布候选祖先时阻断。
- 提交数或文件范围显著超过文档登记范围时阻断。
- 高风险文件被修改但未进入发布范围说明时阻断。
- 未由用户手动刷新远端引用时，必须标记“本地缓存引用，未经远端刷新确认”。

## Adapter 示例

- **L0**: 在发布清单中写明标准 Git 检查项。
- **L1**: checklist 提供命令，由用户手动执行并粘贴结果。
- **L2**: slash command 对本地已有 refs 做只读核查。
- **L3**: 发布前 hook 遇到阻断项时失败。
- **L4**: subagent 专门做发布范围核查并返回 Go / No-Go。

## 反模式

- 用“测试通过”替代发布分支干净性核查。
- 只相信分支名，不做祖先关系和 diff 检查。
- 只看当前工作树，不看生产基线到发布候选的全量差异。
- 明知分支污染仍继续作为上线候选。
