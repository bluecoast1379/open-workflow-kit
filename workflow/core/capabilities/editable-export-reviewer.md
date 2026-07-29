# Editable Export Reviewer

## 目的

检查 02C 与 02D 是否共享同一 prototype model/provenance，是否对页面、可见文本、主要组件与属性逐项给出 mapped/loss/unknown，并把文件生成、结构校验和真实客户端可编辑性分开记录。

## 输入

- `features/{feature}/prototype/model.json`
- `features/{feature}/prototype/provenance.json`
- `features/{feature}/prototype/exports/{target}/runs/{run_id}/report.json`
- 对应 Figma、Sketch 或 Axure 的脱敏 client evidence

## 阻断条件

- model/provenance/report hash 不一致。
- entity 或 property coverage 不守恒，或任一 unknown 大于 0。
- 以 raster、单一不可拆分 vector 或 mock 代替真实客户端可编辑证据。
- Figma/Sketch 在 client PASS 前标记 SUPPORTED，或 Axure bridge 标记 native `.rp`/SUPPORTED。
- report、README 与实际 artifact 对能力或损失的表述不一致。

## 输出

输出 mapping report、逐项 loss report、client evidence freshness 与 capability/execution 判定；未执行真实客户端时保持 `NOT_VERIFIED`。
