# 可分享安装方式

本文面向拿到源码 checkout、经审核 commit、发布归档或 registry package 的接收团队。不要引用尚未真实创建的 tag，也不要在团队环境中跟随浮动默认分支。

## 从本地 tarball 安装

维护者先运行 `npm run build:release`，接收方再在目标工作区安装：

```bash
npm install ../releases/open-workflow-kit-<version>.tgz --save-dev
npx agent-workflow-init \
  --target . \
  --tools codex,claude,cursor,copilot,codebuddy,kiro,trae \
  --yes
```

安装前核对发布 manifest 中的 SHA-256；安装后仍要执行本页验收，不能只凭归档名信任版本。

## 从 Git commit 安装

只有已知仓库地址与已审核 commit SHA 时才使用：

```bash
npm install "git+https://github.com/<owner>/open-workflow-kit.git#<audited-commit-sha>" --save-dev
npx agent-workflow-init --target . --tools codex,claude,cursor --yes
```

`<owner>` 与 `<audited-commit-sha>` 必须替换为实际公开仓库和完整审核结果。历史 `v1.0.0` tag 只代表对应旧提交，不能替代当前 1.0.1 修复候选的审核结果；若后续使用 `v1.0.1` tag，必须先核对 tag 指向的 commit 与 release manifest。

## 从 package registry 安装

只有 registry 中确有该版本时才使用：

```bash
npm install open-workflow-kit@<published-version> --save-dev
npx agent-workflow-init --target . --tools codex,claude,cursor --yes
```

不要把 README 中的版本目标当成 registry 已发布证明。

## 会生成什么

- `workflow/team-profile.yaml`
- `workflow/local/team-profile.local.yaml`（本地私有，Git 忽略）
- `workflow/local/rule-provenance.private.yaml`（本地私有，Git 忽略）
- `workflow/core/` 与 `workflow/adapters/`
- `workflow/bin/` 中的 contract、evidence、DoD、adapter、规则、链接和 API 检查器
- `workflow/INSTALL_REPORT.md`
- 必要时的 `workflow/INITIALIZATION_QUESTIONS.md`
- 每个选中工具的 manifest-driven adapter，例如 `.agents/skills/`、`.claude/commands/`、`.cursor/commands/`、`.github/prompts/`、`.codebuddy/commands/`、`.kiro/` 或 `.trae/`

Command manifest 当前有 23 项。Trae 与 Trae CN 都从项目根 `.trae/commands/` 读取同一套入口。

## 安全边界

初始化器不会拉取远程代码、创建或切换分支、push、merge、触发构建/部署、发布 package、写数据库或修改生产配置。它只读取和写入本地目标工作区。绝对路径、私有端点、账号、凭证映射和原始审计只能进入被忽略的 `workflow/local/`。

安装 package 不等于授权 `run-until-done`。运行 Completion Contract Oracle 前，仍需人工冻结 Contract、通过实现闸门，填写版本化 environment manifest 和当前显式 findings snapshot，复核 `--print-required-specs`，由 Agent 不可写 trust boundary 中的 Owner Ed25519 key 签发同时绑定两者的短期 execution permit，并从仓库外提供独立 attestation key 环境变量。

## 安装验收

```bash
node workflow/bin/check-command-manifest.cjs
node workflow/bin/check-support-matrix.cjs
node workflow/bin/check-completion-contract.cjs --help
```

接收方确认：

- 七个平台（或所选子集）的项目入口与 23 个 manifest 命令一致；
- support matrix 中当前状态仍为 `native_not_yet_manually_certified`，除非有本版本真实工具证据；
- 升级没有覆盖 `workflow/team-profile.yaml` 或用户自定义文件；
- 初始化没有产生远程或生产写操作；
- 创建 feature 后能初始化并 lint Completion Contract；
- 初始化同时生成 environment/findings draft，且 placeholder、过期 snapshot 或开放 P0/P1 finding 会阻断运行；
- 自动完成、人工验收和发布授权被当作三个不同边界。

完整接收方清单见 [维护者交接](./maintainer-handoff.md)，真实客户端发现验证见 [多工具人工验收](./adapter-manual-acceptance.md)。
