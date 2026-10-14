# Web2Design Compact Acceptance Corpus (W2D-018)

This directory contains the 8 standalone acceptance scenarios covering all major capabilities of Web2Design V0.7 for interactive Figma Desktop validation.

## Scenarios Overview

| Scenario | Name | Schema | Nodes | File | Primary Test Objective |
|---|---|---|---|---|---|
| **A** | Canonical Sample Document | `0.7` | 2 | [`scenario-A-canonical-sample.json`](./scenario-A-canonical-sample.json) | Root frame creation, Viewport centering, Basic image asset, Traceability metadata |
| **B** | Normal Style & Typography Hierarchy | `0.7` | 20 | [`scenario-B-style-text-hierarchy.json`](./scenario-B-style-text-hierarchy.json) | Nested frames, Card hierarchy, Typography line-height, Solid fills, Rounded corners |
| **C** | Images & Inline SVG Vectors | `0.7` | 26 | [`scenario-C-images-svg.json`](./scenario-C-images-svg.json) | ImagePaint fills, object-fit cover/contain, Native SVG vector containers, Asset registry |
| **D** | Gradients, Non-Uniform Borders & Shadows | `0.7` | 42 | [`scenario-D-gradients-borders-shadows.json`](./scenario-D-gradients-borders-shadows.json) | GRADIENT_LINEAR, GRADIENT_RADIAL, Per-side stroke weights, DROP_SHADOW stacks, INNER_SHADOW |
| **E** | Container Clipping & CSS 2D Transforms | `0.7` | 62 | [`scenario-E-clipping-transforms.json`](./scenario-E-clipping-transforms.json) | clipsContent = true, CSS 2D rotation, relativeTransform translation, Origin compensation |
| **F** | Single-TextNode Rich Text Paragraph Spans | `0.7` | 77 | [`scenario-F-rich-text-ranges.json`](./scenario-F-rich-text-ranges.json) | Single TextNode, Ranged bold/italic/weight, Ranged colors/sizes, Hyperlink URL ranges, Font fallback |
| **G** | Native Semantic Auto Layout (V0.7) | `0.7` | 212 | [`scenario-G-auto-layout.json`](./scenario-G-auto-layout.json) | layoutMode HORIZONTAL/VERTICAL, itemSpacing & padding, primary/counter alignments, layoutGrow & layoutAlign, layoutPositioning ABSOLUTE |
| **H** | Actual Real-World Chrome Capture (react.dev) | `0.7` | 793 | [`scenario-H-real-chrome-capture.json`](./scenario-H-real-chrome-capture.json) | 1,023 nodes, 131 Auto Layout frames, Complex real-world layouts, Unpacked extension capture, Zero skipped nodes |

## How to Use in Figma Desktop

1. In Figma Desktop, create a disposable Design file (e.g. `Web2Design-Acceptance`).
2. Open Plugins -> Development -> Import plugin from manifest... -> select `apps/figma-plugin/dist/manifest.json`.
3. Launch **Web2Design** from Plugins -> Development -> Web2Design.
4. Open any scenario `.json` file from this corpus folder, copy its contents, paste into the plugin textarea, and click **Validate & Prepare** then **Import to Figma**.
5. Inspect the resulting canvas against the criteria in `docs/w2d-018-manual-checklist.md`.
