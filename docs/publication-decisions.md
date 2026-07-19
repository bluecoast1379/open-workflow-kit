# 发布决策

Open Workflow Kit 可以进行本地验证和本地打包。远程发布仍必须人工执行。

当前源代码目标为 1.0.1 修复候选。历史 `v1.0.0` tag 已存在且保持不可变；这不表示 1.0.1 Git tag、GitHub Release 或 registry package 已经存在。

## 必要决策

| 决策 | 选项 | 当前建议 |
| --- | --- | --- |
| License | Apache-2.0 / MIT / proprietary | Apache-2.0 |
| 发布渠道 | GitHub / npm / 内部包仓 / tarball | GitHub + tarball |
| 贡献模型 | 关闭 / 仅 issue / 接收 PR / 需要 CLA | 接收 issue 和 PR 模板 |
| 支持范围 | best-effort / paid / internal-only | best-effort |
| 安全报告 | 私有邮箱 / GitHub private advisory / 内部渠道 | GitHub private advisory（具体入口见 `SECURITY.md`） |
| 发布产物 | 只提交源码 / 允许提交 dist | 默认不提交 dist |
| Adapter 认证 | 自动 conformance / 本版本真实客户端人工验收 | 自动 conformance 必须通过；人工证据缺失时公开标注 `native_not_yet_manually_certified` |
| 完成状态 | 自动完成 / 人工验收 / 发布 | 三者分离；runner 只到 `READY_FOR_HUMAN_ACCEPTANCE` |

## 首次外部试用建议

- 使用 Apache-2.0。
- 先完成源码、tarball 与 commit SHA 的一致性核查，再由维护者决定是否创建新的 `v1.0.1` tag；不得移动历史 `v1.0.0`。
- 接收 issue 和 PR，但要求脱敏。
- 不承诺生产级支持。
- 公开 README 中明确：初始化器只扫描本地资料并写入本地生成文件，不执行远程 Git、分支、部署或数据库动作。

## 公开发布前

1. 运行 `npm run check`。
2. 运行 `npm run check:history`。
3. 运行 `npm run build:release`。
4. 使用 Open Workflow Kit 仓库外部的私有 denylist 扫描。
5. 人工检查全部可分发文件和 `dist/RELEASE_MANIFEST.md`。
6. 确认 23 个命令、七个平台 adapter 和 Completion Contract 正负例均按当前口径通过。
7. 由维护者手动创建干净 release tag；只有创建成功后才在安装文档中引用。

agent 不得执行 publish、push、tag 或远程仓库创建动作。

手动命令示例维护在 `docs/manual-publish.md`。
