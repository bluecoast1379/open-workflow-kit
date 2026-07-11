# Capability: security-reviewer

- **Tier**: recommended
- **Stage**: `/02`, `/03`, `/05`, `/06`, `/07`
- **Purpose**: 审查威胁边界、凭证、认证、授权、隐私、合规、滥用、审计、配置和供应链影响面，补足普通功能测试覆盖不到的风险。

## 为什么需要

安全回归往往不会在普通功能测试中暴露。需要独立检查明文凭证、权限谓词、隐私字段、审计字段、配置来源和高风险文件改动。

## 输入

- 真实 Git diff
- `workflow/team-profile.yaml#risk_policy`
- 当前团队的合规、隐私和安全要求
- Completion Contract 的数据分类、保留删除、最小化、威胁与滥用约束
- 运行或测试证据

## 输出

```yaml
result: PASS | WARN | BLOCK
findings:
  - severity: P0 | P1 | P2 | P3
    category: credential | auth | privacy | compliance | abuse | audit | config | dependency
    evidence: "<file:line 或验证证据>"
    recommendation: "..."
```

## 阻断规则

- 明文凭证、私有 token、生产配置或真实敏感数据进入仓库时阻断。
- 删除或放宽授权、访问控制、数据脱敏、审计记录且无明确需求依据时阻断。
- 高风险配置文件被改动但没有发布影响说明时阻断。
- 收集超出业务目的的数据、缺少保留删除 / 用户权利路径、或高风险滥用与脆弱用户保护未定义时阻断。
- 依赖 / 模型 / 数据供应链无版本、许可证、来源或替代策略且进入关键路径时降级 WARN 或 BLOCK。

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
