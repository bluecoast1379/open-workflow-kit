# Visual asset provenance

The SVG files in this directory were authored deterministically for Open Workflow Kit. They contain only repository-specific text, basic SVG geometry and the documented project palette.

- No stock image, icon library, external font, remote URL, embedded bitmap, script or generated performance/community statistic is used.
- The font stack is `-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`; rendering may select the local system font without loading a network resource.
- Exact dimensions and intended use are recorded in `visual-manifest.json`.
- README commands and architecture facts remain available as text, so the images are not the sole source of essential information.
- `social-preview.svg` is the deterministic 1280×640 source. The untracked `social-preview.png` raster export is used for GitHub Repository Settings; its dimensions and checksum are recorded in `visual-manifest.json`. It stays outside the source package, and the export alone does not prove that the remote setting is active.

The asset copy describes repository behavior and documented boundaries only. It does not claim production certification, user counts, performance gains or community adoption.
