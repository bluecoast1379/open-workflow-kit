# Capability: security-reviewer

- **Tier**: recommended
- **Stage**: `/05`
- **Purpose**: 审查凭证、认证、授权、隐私、审计、配置和生产影响面，补足功能测试覆盖不到的安全风险。

## 为什么需要

安全回归往往不会在普通功能测试中暴露。需要独立检查明文凭证、权限谓词、隐私字段、审计字段、配置来源和高风险文件改动。

## 输入

- 真实 Git diff
- `workflow/team-profile.yaml#risk_policy`
- 当前团队的合规、隐私和安全要求
- 运行或测试证据

## 输出

```yaml
result: PASS | WARN | BLOCK
findings:
  - severity: P0 | P1 | P2 | P3
    category: credential | auth | privacy | audit | config | dependency
    evidence: "<file:line 或验证证据>"
    recommendation: "..."
```

## 阻断规则

- 明文凭证、私有 token、生产配置或真实敏感数据进入仓库时阻断。
- 删除或放宽授权、访问控制、数据脱敏、审计记录且无明确需求依据时阻断。
- 高风险配置文件被改动但没有发布影响说明时阻断。

## Adapter 示例

- **L0**: 在代码审查模板中固定安全章节。
- **L1**: prompt 按安全分类逐项审查。
- **L2**: slash command 扫描高风险文件和敏感模式。
- **L3**: pre-commit 或 pre-review hook 阻断敏感内容。
- **L4**: subagent 专门做安全边界审查。

## 反模式

- 只看功能是否可用，不看权限是否变宽。
- 将本地 `.env`、token 或私有 URL 写进示例。
- 以“测试环境能跑”为理由跳过审计字段。
- 忽略依赖升级和构建配置带来的生产影响。

## 相关检查清单

- `workflow/core/checklists/language-pitfalls-java.md`：Java 技术栈的语言级恒真/恒假与拆箱空指针专项（team-profile 技术栈含 Java 时启用）。
