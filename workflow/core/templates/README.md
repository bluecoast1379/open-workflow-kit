# Templates

These templates are intentionally generic. Target teams should specialize them through `workflow/team-profile.yaml` and feature documents, not by hard-coding private company data into core files.

- `team-profile.template.yaml`: 可提交、可分享的团队契约模板，不得包含绝对路径、私有端点或凭证。
- `trusted-execution-policy.template.yaml`: 仓库外受信策略模板，应放在仓库外并通过 `OPEN_WORKFLOW_TRUST_POLICY` 引用。
- `api-test-plan.example.json`: 不含凭证的机器可读 API 测试计划示例。
- `api-test-plan.md` / `ui-test-plan.md`: 测试双轨计划模板。
- `00-workflow-status.md` / `stage-document.md`: 阶段状态与阶段产物骨架。
- `prototype-page.html`: 可选的单文件交互原型骨架。
