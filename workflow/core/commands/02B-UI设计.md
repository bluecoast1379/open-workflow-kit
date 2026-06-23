# /02B-UI设计

## Goal

UI 设计: 在 `/02-产品文档` 之后、`/03-技术架构` 之前，输出可被前端实现直接遵循的 UI/UX 设计基线、关键流程、页面清单、组件规范、平台适配、交互状态、可访问性和交付验收口径。

## Required Inputs

- `AGENTS.md`
- `workflow/team-profile.yaml`
- Workspace-level `features/{feature}/01-需求讨论.md`
- Workspace-level `features/{feature}/02-产品文档.md`
- Existing design references declared in `workflow/team-profile.yaml#source_materials.ui_specs`
- Existing frontend rules declared in `workflow/team-profile.yaml#source_materials.frontend_rules`
- Platform references relevant to the feature, such as Apple Human Interface Guidelines, Apple Design Resources, Figma handoff practices, and any project-specific Figma/GitHub design system references

## Execution Rules

- Read local facts before writing conclusions.
- Distinguish verified facts, design intent, assumptions, and missing evidence.
- 默认使用简体中文展示工作流沟通和阶段产物；专有名词、产品名、品牌名、代码标识符、命令、文件路径、分支名、API、SDK、框架、协议、标准、错误信息和官方英文术语保留原文。
- Do not claim prototypes, screenshots, design reviews, usability tests, builds, or visual QA passed unless they were actually executed.
- Remote Git refresh, branch creation, push, tag, merge, build/deploy trigger, database write, production config write, and publishing a Figma file are manual-only actions unless explicitly authorized.
- This stage does not authorize business code changes.
- If no external visual reference exists, create a written UI baseline first; do not invent polished final visuals without marking them as draft design intent.
- 默认只产出 `02B-UI设计.md` 设计文档。除非用户在本阶段明确要求生成 UI 设计图/视觉稿/原型图，否则不调用任何设计图生成工具（设计类 MCP、图像生成、Figma 文件生成、可视化/HTML 视觉稿导出等）去生成设计文件。
- For iOS/macOS/watchOS/visionOS targets, default to Apple platform conventions before custom patterns.
- For Web targets, record responsive breakpoints, keyboard behavior, accessibility rules, and component/token mapping explicitly.
- If Figma is used, document the Figma file/page/frame, component names, variants, Auto Layout/constraints, prototype links, annotations, measurements, and readiness status.
- If no Figma file is used, record wireframe descriptions, layout constraints, component inventory, state matrix, and screenshot/visual QA plan in enough detail for implementation.

## 设计图生成边界

- 默认文档优先：本阶段默认产物只有 `features/{feature}/02B-UI设计.md` 与 `features/{feature}/00-工作流状态.md` 的状态更新，用文字基线、线框描述、组件清单和状态矩阵把设计讲清楚。
- 不主动出图：未经用户在本阶段明确要求，不得调用任何设计图/视觉稿生成工具生成设计文件，也不得把臆造的高保真视觉当成既定设计。
- 显式触发才出图并留痕：仅当用户明确要求生成 UI 设计图/视觉稿/原型图时才调用相应工具；生成后在 `02B-UI设计.md` 记录使用的工具、产物清单和文件路径，并标注其为草稿设计意图还是已确认设计。
- 不削弱 04A Gate：无论是否出图，`/04A-前端代码实现` 仍以 `02B-UI设计.md` 的设计基线为准。

## Required Outputs

- Create or update workspace-level `features/{feature}/02B-UI设计.md`.
- Update workspace-level `features/{feature}/00-工作流状态.md` when stage status changes.
- Record unresolved design questions and evidence gaps explicitly.
- Record external references used and why they apply.
- Produce an implementation handoff section that `/04A-前端代码实现` must follow.

## Required Structure

The `02B-UI设计.md` output should include:

1. **设计目标与用户情境**：目标用户、核心任务、使用频率、设备情境和成功体验。
2. **参考来源与适用性**：列出参考的 iOS、macOS、Web、Figma、GitHub design system 或其他资料；说明哪些规则会采用，哪些不采用。
3. **信息架构**：导航结构、页面层级、主要入口、空状态、错误状态和设置入口。
4. **关键用户流程**：首次进入、核心创建/编辑/订阅/搜索/支付/反馈等流程；每个流程写清进入条件、关键状态和退出路径。
5. **页面清单**：页面名称、平台、主要组件、关键数据、状态、权限/合规提示、埋点候选。
6. **设计系统基线**：颜色、字体、字号层级、间距、栅格、圆角、阴影/材质、图标、动效、图片/插画、design tokens 和命名规则。
7. **组件规范**：按钮、输入、列表、卡片、导航、筛选、弹窗、权限说明、付费墙、反馈表单等组件的状态、尺寸、交互和错误处理。
8. **平台适配**：iOS、iPadOS、macOS、Web 等差异；包括导航、窗口尺寸、键盘、鼠标/触控、系统组件和平台惯例。
9. **多语言与可访问性**：文本扩展、动态字体、VoiceOver/屏幕阅读器、颜色对比、触控目标、键盘焦点、RTL 或 locale 差异。
10. **响应式与视觉 QA**：需要验证的设备/视口、截图清单、状态清单、可接受偏差和阻塞条件。
11. **04A 实现交接规范**：前端实现必须读取的设计决策、组件映射、禁止偏离项、允许实现侧调整项、偏离记录格式。
12. **待确认项**：只保留真实阻塞设计落地的问题。

## Design Reference Baseline

- Apple Human Interface Guidelines: 用作 iOS、iPadOS、macOS、watchOS、visionOS 平台交互、导航、控件、可访问性和系统一致性的基准。
- Apple Design Resources: 使用 Apple 官方 iOS/iPadOS/macOS UI kits、Figma templates、SF Symbols、SF Pro、Icon Composer 等资源确认平台视觉和资产规格。
- Figma Dev Mode / handoff practices: 使用 ready-for-dev、comments、annotations、measurements、component properties 和 prototype links 保持设计与实现同步。
- GitHub Primer Design System: 参考 design tokens、component documentation、accessibility 和可维护设计系统文档方式，尤其适合 Web 或后台类产品。
- IBM Carbon Design System: 参考开源 design system 的 foundations、Figma kit、代码组件、贡献机制和企业级可访问性文档方式。

## 04A Gate

`/04A-前端代码实现` 必须读取 `features/{feature}/02B-UI设计.md`。如果该文件缺失，或者关键页面没有 UI 设计基线，前端实现不得直接开始；只能先补齐 `/02B-UI设计`，或在 `04A` 文档中记录用户明确授权的设计豁免、影响范围和后续补齐计划。
