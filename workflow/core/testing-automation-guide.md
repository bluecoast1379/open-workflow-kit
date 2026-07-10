# 测试自动化接入指引（testing-automation-guide）

本指引配合 `automated-test-runner` 能力使用，覆盖接口测试轨与功能测试轨的接入方式。所有工具名均为通用生态选项，团队按 `workflow/team-profile.yaml#testing` 实际登记。

## 1. 接口测试轨（API）

无需额外工具：agent 直接用 HTTP 客户端（curl / 脚本）按 `api-test-plan` 逐用例调用断言。

接入准备（一次性）：

1. 用户准备测试数据：环境地址、鉴权密钥、测试账号、业务前置数据。
2. 凭证写入 `workflow/local/test-credentials.env`（示例见文末），并确认该路径被 `.gitignore` 覆盖；agent 发现该文件被纳入版本控制时必须先阻断。
3. 在 `team-profile.yaml#testing.api_track.environment_allowlist` 登记允许的环境与 Base URL；生产地址不登记即默认禁止。

## 2. 功能测试轨（Web / H5）

推荐通过浏览器自动化 MCP 执行（如 Playwright MCP、Chrome DevTools MCP 或所用 AI 工具内置的浏览器工具）：

1. 在所用 AI 工具中配置浏览器自动化 MCP（属 `config_write`，按执行策略确认）。
2. agent 按 `ui-test-plan` 执行：导航 → 定位元素 → 点击/填写 → 断言文案或元素 → 截图存证到 `features/{feature}/screenshots/`。
3. H5 场景先把视口设为移动尺寸（如 375×812）再执行；同时读取控制台错误与失败网络请求作为附加证据。
4. 断言优先用页面结构/文本（快照类工具），截图用于人工复核；只截图不断言不算通过。

## 3. 功能测试轨（微信小程序）

小程序没有浏览器入口，自动化走微信官方 `miniprogram-automator`（挂接微信开发者工具）。约束：需要本机安装并打开微信开发者工具，CI 环境难以运行，因此定位为**本地半自动化**。

接入步骤：

1. 微信开发者工具 → 设置 → 安全设置 → 开启"服务端口"（自动化依赖该端口）。
2. 项目内安装依赖：`npm i -D miniprogram-automator`。
3. 脚本骨架（agent 按 ui-test-plan 生成到 `workflow/local/miniprogram-tests/`，本地运行）：

```js
const automator = require('miniprogram-automator');

(async () => {
  const miniProgram = await automator.launch({
    projectPath: '<小程序项目根目录>',   // 或用 automator.connect({ wsEndpoint }) 连接已打开的工具
  });
  const page = await miniProgram.reLaunch('/pages/index/index');
  await page.waitFor(500);

  const btn = await page.$('.submit-btn');          // 选择器定位
  await btn.tap();                                   // 模拟点击
  await page.waitFor(500);

  const toast = await page.$('.result-text');
  const text = await toast.text();
  if (!text.includes('<期望文案>')) throw new Error(`断言失败: ${text}`);

  await miniProgram.screenshot({ path: 'features/<feature>/screenshots/mp-001.png' });
  await miniProgram.close();
})();
```

4. 运行：`node workflow/local/miniprogram-tests/<case>.js`；结果与截图回填 `ui-test-plan` 执行记录。
5. 局限声明：需真机验证的能力（支付、部分授权弹窗）自动化覆盖不到，保留人工用例并在计划中显式标注。

## 4. 原生 App（槽位）

登记为能力槽位：依赖 computer-use / 系统级自动化类工具，各平台差异大，暂不作为 kit 默认能力；有条件的团队在 `team-profile.yaml#testing.ui_track` 自行登记方案。

## 5. 凭证文件示例

`workflow/local/test-credentials.env`（**不入库**）：

```env
TEST_BASE_URL=https://test.example.internal
TEST_APP_KEY=<粘贴>
TEST_APP_SECRET=<粘贴>
TEST_ACCOUNT=<测试账号>
TEST_PASSWORD=<粘贴>
```

安全规则：该文件路径必须在 `.gitignore`；证据里的敏感字段一律脱敏；发现真实凭证进入文档或提交历史，按 `automated-test-runner` 阻断规则处理。
