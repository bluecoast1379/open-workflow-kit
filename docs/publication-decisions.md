# 发布决策

starter kit 可以进行本地验证和本地打包。远程发布仍必须人工执行。

## 必要决策

| 决策 | 选项 | 当前建议 |
| --- | --- | --- |
| License | Apache-2.0 / MIT / proprietary | Apache-2.0 |
| 发布渠道 | GitHub / npm / 内部包仓 / tarball | GitHub + tarball |
| 贡献模型 | 关闭 / 仅 issue / 接收 PR / 需要 CLA | 接收 issue 和 PR 模板 |
| 支持范围 | best-effort / paid / internal-only | best-effort |
| 安全报告 | 私有邮箱 / GitHub private advisory / 内部渠道 | GitHub private advisory 或维护者私有渠道 |
| 发布产物 | 只提交源码 / 允许提交 dist | 默认不提交 dist |

## 首次外部试用建议

- 使用 Apache-2.0。
- 先发布源码仓库和 Git tag。
- 接收 issue 和 PR，但要求脱敏。
- 不承诺生产级支持。
- 公开 README 中明确：初始化器只读本地资料，不执行远程 Git、分支、部署或数据库动作。

## 公开发布前

1. 运行 `npm run check`。
2. 运行 `npm run build:release`。
3. 使用 starter kit 外部的私有 denylist 扫描。
4. 人工检查全部可分发文件和 `dist/RELEASE_MANIFEST.md`。
5. 由维护者手动创建干净 release tag。

agent 不得执行 publish、push、tag 或远程仓库创建动作。

手动命令示例维护在 `docs/manual-publish.md`。
