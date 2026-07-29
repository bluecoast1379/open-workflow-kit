# 可编辑原型交付

HTML 是默认原型。先用 `/02C-HTML原型` 生成同源 `model.json`、`provenance.json` 与 `index.html`；只有用户明确选择 target 时才运行 02D。

## 命令

```bash
node workflow/bin/render-html-prototype.cjs \
  --workspace . \
  --feature account-export \
  --model ./model-input.json

node workflow/bin/export-editable-prototype.cjs \
  --workspace . \
  --feature account-export \
  --target sketch
```

Figma local plugin ID 写入被 Git 忽略的 `features/{feature}/prototype/exports/figma/local-config.json`：

```json
{"plugin_id":"local-development-plugin-id"}
```

```bash
node workflow/bin/export-editable-prototype.cjs \
  --workspace . \
  --feature account-export \
  --target figma \
  --config features/account-export/prototype/exports/figma/local-config.json
```

## Figma 人工验证（8 步）

1. 在 Figma Desktop 打开目标本地/团队文件；预期当前 PageNode 可见。
2. 选择 Plugins → Development → Import plugin from manifest；定位 current run 的 `figma/manifest.json`。
3. 运行 development plugin；预期 current PageNode 新增一个 `OWK` committed root Frame。
4. 展开 root；预期每个产品 page 都是 root 的 direct-child Frame，未新增 PageNode。
5. 选择内部 text node 并修改文案；预期可独立编辑，不是 raster/vector flatten。
6. 选择内部 frame/component 并修改布局或尺寸；预期其他节点仍可独立选择。
7. 保存、关闭并重开；预期修改仍存在，same-run 再运行不产生重复 root。
8. 在 `exports/figma/client-evidence/{run_id}.json` 记录 Figma 版本、OS、日期、model hash、`client_validation_status=PASS` 与脱敏证据；失败则记录 FAIL 和恢复动作。

## Sketch 人工验证（8 步）

1. 在 macOS 启动合同记录版本的 Sketch。
2. 打开 current run 的 `prototype.sketch`；预期无 archive/schema 错误。
3. 核对 pages/artboards 数量与 report；预期完全一致。
4. 选择一个 artboard；预期可独立调整 frame。
5. 选择一个 text layer 并修改；预期可独立编辑。
6. 选择一个 shape 或 symbol 并修改尺寸/样式；预期非整屏扁平对象。
7. 保存、关闭并重开；预期修改仍存在。
8. 记录 Sketch 版本、macOS、日期、model hash 与脱敏证据；失败则保留 previous current 并按 reason code 重建。

## Axure bridge 人工验证（8 步）

1. 确认同 model hash 的 Figma client evidence 为 PASS 且非 STALE。
2. 在 Figma 选择需要交付的产品 page Frames。
3. 运行官方 Axure plugin for Figma 并复制；预期 plugin 报告可复制对象。
4. 在 Axure RP 打开目标本地文件。
5. 粘贴；预期形成 editable widgets/groups，不是单一图片。
6. 修改一个文本与一个布局属性；预期两者可保存。
7. 保存、关闭并重开；预期修改仍存在。
8. 记录 Figma/Axure/plugin 版本、OS、日期和脱敏证据；report 必须保持 `delivery_mode=BRIDGE_ONLY`、`native_rp=false`、capability=`DEGRADED`（client PASS 后）。

## 失败恢复

- `BLOCKED_NO_BASELINE`：重新执行 02C 生成 model/provenance，不解析历史 HTML。
- `BLOCKED_LOCAL_PLUGIN_ID`：在 ignored local config 补 plugin ID 后重试。
- `BLOCKED_FIGMA_BASELINE`：先完成同 model hash 的 Figma client 验证。
- `EXPORT_FAILED`：修复 report 所列阶段后以同一输入重试；HTML 和 previous current 不会被覆盖。
- `UNSAFE_PATH` / `SYMLINK_BOUNDARY`：移除路径穿越或 prototype symlink，使用工作区内受控相对路径。
