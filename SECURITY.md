# 安全策略

## 支持版本

公开项目默认支持最新发布版本。安全修复优先进入默认分支，再由维护者手动发布。

## 报告漏洞

不要在公开 issue 中提交密钥、凭证、私有 URL、客户数据、私有源码、日志、数据库导出或生产配置。

请通过 [GitHub Private Vulnerability Reporting](https://github.com/bluecoast1379/open-workflow-kit/security/advisories/new) 私密报告安全问题，并只提供定位问题所需的最小上下文。若该入口暂不可用，不要转到公开 issue；请先通过不含敏感细节的普通消息联系维护者，索取一次性私有提交方式。

## 范围

本项目关注：

- 初始化器写入了不应写入的私有内容；
- 脱敏检查遗漏明显敏感模式；
- 生成的 adapter 削弱了 workflow 硬闸门；
- 文档引导用户执行不安全的自动远程操作。

不在范围内：

- 用户手动改坏生成文件后的误用；
- 目标团队自己的业务代码缺陷；
- 目标团队工具或插件本身的漏洞；
- 未经授权上传到 issue、PR 或讨论区的私有数据。

## 脱敏检查

发布或分享前必须运行：

```bash
npm run check
npm run check:history
npm run check:rules
npm run check:adapters
npm run check:links
npm run build:release
node bin/check-sanitized.cjs --extra-banned <private-denylist-file>
```

`private-denylist-file` 必须放在 starter kit 外部，不要提交到仓库。
