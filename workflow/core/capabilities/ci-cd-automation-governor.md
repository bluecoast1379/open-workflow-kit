# Capability: ci-cd-automation-governor

- **Tier**: recommended（命中 CI/CD、部署、密钥或发布风险时升级为 required）
- **Stage**: `/03`, `/04`, `/07`, `/11`; revisit in `/12`
- **Purpose**: 让 CI/CD 遵循项目自己的分支、环境、授权和回滚契约，自动化提升可复现性而不静默发布错误版本。

## 为什么需要

风险不来自“自动化本身”，而来自错误基线、未审查范围、不同 commit 的绿灯、秘密泄漏、不可回滚和越权部署。CI 可在可复现检查成熟后尽早启用；CD 的自动化等级必须由 team-profile、执行策略、真实发布历史和恢复能力共同决定。

## Automation Maturity Model

```yaml
level_0_manual:
  when: "首次发布前或尚无可复现 build/test"
  allowed: ["local validation", "documented deployment runbook"]
  blocked: ["unapproved deployment", "production secret write"]

level_1_ci_only:
  when: "已有可复现 build/test"
  allowed: ["CI checks on branch-model declared development/integration refs", "artifact creation without deployment"]
  blocked: ["automatic production deployment"]

level_2_manual_cd:
  when: "已有稳定发布且回滚已定义"
  allowed: ["policy-approved deployment job", "release artifact bound to verified commit"]
  blocked: ["unattended production deployment unless execution policy permits"]

level_3_guarded_auto_cd:
  when: "多次稳定发布、CI 可信、回滚演练通过，且受信策略允许"
  allowed: ["automatic non-production preview", "guarded production promotion from declared release source"]
  required: ["protected refs", "required checks", "environment protection", "tested rollback", "audit trail"]
```

## Branch Flow Contract

Automation MUST read, not invent:

- `team-profile#branch_model.production_branch`
- `integration_branch`, `development_branch_base`, `testing_branch`
- `feature_branch_rule`, `protected_branches`, `release_flow`, `test_branch_policy`

不同仓库可采用 trunk-based、GitFlow、environment branches 或自定义模型。若字段缺失或互相矛盾，结论为 BLOCK 并要求补齐 profile；不得回退到 `main/prod/test` 等默认假设。

## Inputs

- `workflow/team-profile.yaml#branch_model`, `#risk_policy`, `#execution_policy`
- Completion Contract 的范围、质量预算、允许动作与 source fingerprint
- Target repository build/test scripts and workflow files
- Runtime / deployment provider docs, secret inventory, rollback history
- `/03`, `/07`, `/11` 的真实证据

## Outputs

```yaml
result: PASS | WARN | BLOCK
automation_level: 0 | 1 | 2 | 3
branch_model_snapshot:
  production_ref: "<from team-profile>"
  integration_ref: "<from team-profile or null>"
  release_flow: "<from team-profile>"
ci:
  required_checks: []
  evidence: []
cd:
  deployment_mode: none | manual-gated | guarded-auto
  source_ref: "<declared release source>"
  target_environment: "<declared environment>"
  release_commit: "<sha>"
  rollback_plan: "<path>"
authorization:
  effective_policy: "<four-layer strictest result>"
blocked_reason: "..."
```

## Blocking Rules

- team-profile 未定义或矛盾时阻断分支 / 发布自动化，不猜默认分支。
- 部署来源不符合 `branch_model.release_flow`，或可从任意开发 ref 直接进入生产时阻断。
- 必跑检查缺失、失败、过期或不绑定 release commit 时阻断。
- secrets 出现在源码、工作流文档、提交的 `.env`、日志、截图或 prompt 时阻断。
- `/07` 未对 release commit 达到自动验收就绪，或回滚 / 数据恢复未定义时阻断生产部署。
- 任何远程 Git、protected ref、生产配置 / 部署动作必须使用 `execution-policy` 四层最严格结果；不能把 “manual-gated” 误读为永远人工，也不能把仓库请求当受信授权。
- 项目尚无代码时降级 WARN，只输出计划，不创建虚假 workflow 或发布证据。

## Anti-Patterns

- 把某种个人项目分支流写成通用规则。
- CI 通过的 commit 与被推广 commit 不一致。
- 首次稳定发布和回滚演练前静默开启生产 auto-deploy。
- 为了匹配模板新建无业务含义的 testing branch。
- 把“工作流文件存在”当成“平台规则已生效”。
