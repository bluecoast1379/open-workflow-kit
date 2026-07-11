# /02C-HTML原型

## 目标

HTML 可点击原型: 在 `/02-产品文档` 与 `/02B-UI设计` 基线之上，产出**前端开发级别**的单文件可点击 HTML 原型，让团队在实现前用真实交互对齐需求，替代"天马行空"的自由发挥出图。

## 必要输入

- `AGENTS.md`
- `workflow/team-profile.yaml`（重点读 `source_materials.ui_specs` 与 `source_materials.frontend_rules`）
- 工作区级 `features/{feature}/02-产品文档.md`
- 工作区级 `features/{feature}/02B-UI设计.md`（缺失时先补齐 02B 或记录用户明确豁免）
- 工作区级 `features/{feature}/completion/contract.yaml`（Completion Contract）
- `workflow/design/tokens.css` 与 `workflow/design/components.md`（design 基线三件套，见下）
- `workflow/core/templates/prototype-page.html`（骨架模板）

## Design 基线三件套（原型的前置闸门）

原型必须被机器可读的设计基线约束，禁止凭感觉发挥。首次执行本命令或基线过期时，先产出/更新：

1. **`workflow/design/tokens.css`**：从团队 UI 规范提取 CSS 自定义属性——颜色、字号层级、间距、圆角、阴影、栅格断点。没有 UI 规范时，用问答收集（品牌主色、中性色基调、密度、目标端）后生成初版，标注"草稿 tokens 待确认"。
2. **`workflow/design/components.md`**：组件清单——按钮、输入、表格、卡片、导航、弹窗等的命名、状态与使用约束；有组件库的直接映射组件库命名。
3. **`workflow/design/page-patterns.md`**：页面模式——列表页、详情页、表单页、结果页的标准布局骨架。

## 原型产出要求（前端开发级）

- 产物：`features/{feature}/prototype/index.html`，**单文件自包含**（内嵌 tokens CSS 与最小 JS），双击即可在浏览器打开演示。
- 可点击：内置微型 hash 路由实现页面跳转；核心流程（进入 → 操作 → 结果）可以真实点过去。
- 四态齐全：关键页面覆盖正常态、空态、错误态、加载态，用可见开关切换演示。
- 全部视觉取值来自 `tokens.css` 的 CSS 变量：**禁止出现 token 之外的硬编码颜色、字号、间距**；组件写法必须匹配 `components.md` 清单。
- 每屏顶部注释锚点：对应 PRD 章节号与 02B 页面清单编号，方便评审逐屏对照。
- 移动端优先的响应式（若目标端含移动）；文本超长、小屏溢出场景要能演示。

## 卡关（ui-baseline-reviewer 反查）

原型完成后按 `ui-baseline-reviewer` 能力执行 tokens 反查：

- 扫描原型中的颜色/字号/间距取值，出现 token 之外的硬编码即 BLOCK，列出违规行。
- 组件命名不在 `components.md` 清单内且无新增说明即 BLOCK。
- 页面清单与 02B 不一致（多页、少页、流程断链）记为 WARN 并列差异。

## 执行规则

- 本阶段不授权修改业务代码；原型只写在 `features/{feature}/prototype/`。
- 未真实打开验证过的交互不得写成"可点击"；至少记录一次浏览器打开与关键流程点击的验证结果（有浏览器自动化 MCP 时截图存证到 `features/{feature}/screenshots/`）。
- 原型是沟通产物不是实现代码：不引入框架、构建步骤或外部 CDN 依赖。

## Required Structure

- 原型文件顶部记录 feature、PRD / 02B / Completion Contract 版本与 `AC-###` 映射。
- 页面、组件、design tokens、核心路由、四态、响应式、长文本 / 小屏、键盘与 accessibility 演示完整。
- 每个交互演示都有进入条件、用户动作、预期反馈、失败 / 恢复和对应 AC；纯静态跳转不得冒充业务已实现。
- 验证记录包含真实浏览器 / 视口、关键点击路径、截图或等价证据与已知偏差。

## Exit Criteria

- 02B 与 design 基线闸门通过；页面 / 流程无未解释的多页、少页或断链。
- token / component 反查无 BLOCK；不存在外部 CDN、构建依赖或业务代码写入。
- 核心流程在目标视口真实打开并点击验证，四态切换、恢复路径和可访问性关键行为可演示。
- 原型与 `AC-###` 可追溯，且明确标为设计验证证据而非实现 / 测试 PASS。

## 必要输出

- `features/{feature}/prototype/index.html`（及必要的分页面文件）。
- 更新 `features/{feature}/02B-UI设计.md`：登记原型路径与 tokens 反查结论。
- 更新 `features/{feature}/00-工作流状态.md`。

## 04A 交接

`/04A-前端代码实现` 必须同时读取 `02B-UI设计.md` 与本原型；实现与原型的偏离必须在 04A 文档记录原因。
