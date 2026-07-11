# Templates

模板保持通用，团队通过 `workflow/team-profile.yaml` 与 feature 文档具体化；不得把私有公司数据、绝对路径、内部端点、客户数据或凭证硬编码到 core。

## 工作区与治理

- `team-profile.template.yaml`：业务 / 组织、仓库、真实分支模型、执行策略、工具链、测试、质量预算、Completion Contract 和 risk packs。
- `trusted-execution-policy.template.yaml`：仓库外受信策略模板，通过 `OPEN_WORKFLOW_TRUST_POLICY` 引用。
- `00-workflow-status.md`：阶段 + Definition of Done 状态，区分自动就绪、人工签收和发布。
- `stage-document.md`：事实 / 假设 / 决策、范围、AC、质量预算、Required Structure 与 Exit Criteria 骨架。

## 验证与原型

- `completion-contract.template.yaml`：从目标、领域、范围、质量预算、AC、自治预算到治理签名边界的可执行完成契约骨架。
- `environment-manifest.template.yaml`：绑定 runtime、dependency、service、dataset、model 与 tool 版本；不适用项必须写明原因。
- `findings-manifest.template.yaml`：显式绑定代码审查、缺陷或风险登记快照；空数组表示“已检查且无 finding”，不是“未提供”。
- `completion-run-state.template.yaml` / `completion-decision-packet.template.json` / `completion-evidence-entry.template.json`：checkpoint、停止决策与 append-only 证据的格式样例。Decision packet 必须通过 `../schemas/completion-decision-packet.schema.json`，不得临时增删字段规避结构验证。
- `api-test-plan.example.json`：schema 1.1、无凭证的机器可读 API 计划，含显式断言、capture 和 bounded retry。
- `api-test-plan.md` / `ui-test-plan.md`：API / UI 双轨测试计划；用例必须引用 `AC-###`。
- `prototype-page.html`：可选的单文件交互原型骨架，受 design tokens / components 约束。

## 约束

- 分支名与发布流来自 team-profile；模板不假设 `main/prod/test`。
- Evidence Ledger 为 append-only；模板中的 PASS 只能是状态占位，不得生成伪证据。
- Completion Contract、source、environment、fixture 或 tool 指纹变化后，受影响证据必须 STALE。
- target workspace 可以专用化模板，但不能降低 execution-policy、blocking AC、证据新鲜度或 anti-cheating 约束。
