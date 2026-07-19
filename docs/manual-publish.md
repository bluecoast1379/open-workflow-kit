# 手动发布指南

agent 不得自动创建远程仓库、push commits、创建 tags 或发布 package。本指南只作为 `npm run build:release` 通过后的人工清单。

文档中的 `<version>` 与 `<reviewed-commit>` 都是占位符。只有维护者完成本页验证并真实创建远程对象后，才能在安装文档中引用它；不能因为 `package.json` 写了 1.0.1 就声称 `v1.0.1` tag、GitHub Release 或 registry package 已存在。历史 `v1.0.0` tag 不得移动。

## 当前本地发布

先校验并形成 reviewed commit，再从 clean tree 构建：

```bash
npm run check
npm run check:history
git status --short
git add <reviewed-files>
git commit -m "release: v<version>"
npm run build:release
```

`build:release` 会拒绝 dirty worktree，并把 `source_commit`、`source_tree` 与 `source_dirty: false` 写入 manifest；因此任何构建后的源码变更都必须重新提交、重新构建。

可分享的本地归档位于：

```text
dist/open-workflow-kit-<version>.tgz
```

校验信息见：

```text
dist/RELEASE_MANIFEST.md
```

## 方案 A：直接分享 tarball

适合小范围试用。维护者手动发送 `dist/*.tgz`，接收方按 `docs/shareable-install.md` 安装。

分享前必须：

- 检查 `dist/RELEASE_MANIFEST.md`；
- 用私有 denylist 扫描；
- 人工检查 tarball 文件列表；
- 确认没有私有资料、真实业务数据或凭证。

## 方案 B：发布到 Git 仓库

人工步骤：

```bash
git status
git rev-parse HEAD
git tag v<version>
git push origin <release-branch>
git push origin v<version>
```

`<release-branch>` 必须来自经维护者复核的实际分支模型；本 kit 不假设远程默认分支名。

以上命令只能由维护者手动执行。agent 只能准备说明、核查本地状态和分析用户粘贴的执行结果。

## 方案 C：发布到 package registry

人工步骤示例：

```bash
npm publish --access public
```

发布前确认：

- package 名称、license、README、files 列表正确；
- `dist/RELEASE_MANIFEST.md` 通过人工复核；
- 私有 denylist 扫描通过；
- 版本号未与已发布版本冲突。
- package、Git tag 和 release manifest 指向同一 `<reviewed-commit>`。

## 远程发布前必须完成

- 运行 `npm run check`。
- 运行 `npm run check:history`。
- 确认 `npm run check:commands`、`npm run check:rules` 和 `npm run check:adapters` 通过（它们也由 `npm run check` 调用）。
- 确认 command manifest 为 23 项，七个平台状态按当前真实证据披露；没有人工证据时保持 `native_not_yet_manually_certified`。
- 运行 Completion Contract 正例与模糊标准、非法 waiver、stale evidence 负例，确认自动完成不能越过人工验收。
- 运行 `npm run build:release`。
- 使用 `bin/check-sanitized.cjs --extra-banned <private-file>` 执行私有 denylist 扫描。
- 检查 `dist/RELEASE_MANIFEST.md`。
- 检查 tarball 内的每个文件。
- 检查 README、license、示例和安装脚本。
- 保持 push、tag、npm publish 等远程写入人工执行。
- 发布成功后才把真实 tag、commit SHA 和 registry version 回写到可分享安装说明；失败或未执行时继续使用占位符。
