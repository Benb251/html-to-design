# @web2design/figma-renderer — W2D-015

Pure TypeScript rendering engine that translates validated Web2Design Design Schema documents into editable Figma node hierarchies.

## Philosophy

**Fidelity before semantics. Absolute layout before Auto Layout. Deterministic before AI.**

The renderer converts absolute document-origin CSS pixel coordinates into Figma parent-local coordinates, mapping schema visual properties directly to native Figma nodes without Auto Layout inference or external network dependencies.

## Architecture

```text
Versioned DesignDocument (V0.1, V0.2, V0.3, V0.4, or V0.5)
        ↓
normalizeDesignDocument(doc)  [Upgraded to latest V0.5]
        ↓
renderDesignDocument(doc, host, options)
        ↓
FigmaRendererHost (minimal adapter boundary)
        ↓
Native SceneNode Hierarchy:
  Web2Design — <Page Title> (FrameNode)
   ├── FrameNode (nested frames, clipsContent = true/false, rotation / relativeTransform)
   ├── RectangleNode (fills, strokes, cornerRadius, drop/inner shadows, rotation)
   ├── TextNode (editable text, font cache, deterministic fallback, rotation)
   ├── RectangleNode + ImagePaint (embedded base64 / remote URL, rotation)
   ├── FrameNode / Vector (native SVG via createNodeFromSvg, container transform)
   ├── Gradient Fills (native GRADIENT_LINEAR & GRADIENT_RADIAL paints)
   ├── Non-Uniform Strokes (native individual strokeTopWeight / strokeRightWeight...)
   ├── Shadow Effects (native DROP_SHADOW & INNER_SHADOW effect stacks)
   └── Transform-aware Placement (origin compensation, exact rotation, uniform rescale)
```

## Supported Node & Style Mappings

| Schema Entity | Figma Target | Implementation Notes |
|---|---|---|
| `frame` | `FrameNode` | Fixed dimensions, `layoutMode = "NONE"`, default fills cleared, parent-local coordinates. |
| CSS 2D Rotation | Native `rotation` / `relativeTransform` | Mapped via explicit sign conversion helper (`cssAngleToFigmaRotation`), with origin compensation. |
| Transform Origin Compensation | `relativeTransform` Translation | Compensates for CSS `transform-origin` differences so target visual placement is exact. |
| Uniform Scale (`scaleX == scaleY`) | Native `rescale(scale)` | Scaled proportionally via native Figma `rescale()` where safe, preserving styles and child hierarchy. |
| Non-uniform Scale | Resized node dimensions + Warning | Approximates size; emits `TRANSFORM_SCALE_APPROXIMATED`. |
| Skew (`skewX`, `skewY`) | `relativeTransform` + Warning | Non-orthogonal axes approximated; emits `TRANSFORM_SKEW_APPROXIMATED`. |
| Reflection (`scaleX(-1)`) | Unsupported + Warning | Emits `TRANSFORM_REFLECTION_UNSUPPORTED` without import crash. |
| Nested Transforms | Recursive Transform Context | Traverses parent-relative transforms without double-applying; inverts parent transforms for children. |
| Container Clipping (`clip.x && clip.y`) | `FrameNode.clipsContent = true` | Both-axis clipping maps natively to Figma FrameNode clipping without cropping child geometry. |
| Single-Axis Clipping (`clip.x !== clip.y`) | `FrameNode.clipsContent = true` + Warning | Figma exposes a single boolean; approximates containment fidelity and emits `AXIS_CLIP_APPROXIMATED`. |
| Unclipped Container (`!clip.x && !clip.y`) | `FrameNode.clipsContent = false` | Default unclipped descendant behavior. |
| `rectangle` | `RectangleNode` | Solid fills, linear/radial gradient fills, strokes, uniform/per-corner radius, multiple drop/inner shadows, rotation. |
| `text` | `TextNode` | Editable characters, font resolver & cache, deterministic fallback, font size, line height, letter spacing, horizontal alignment, local opacity, rotation. |
| `image` | `RectangleNode` (Image fill) | Data URLs, embedded base64, and remote image URLs. `cover` → `FILL`, `contain` → `FIT`. Placeholders created on network or decode failures. |
| `svg` | `FrameNode` / vectors | Native SVG import via `host.createNodeFromSvg()`. Scaled to captured dimensions. Container transform applied. |
| `solid` fill | `SolidPaint` (`SOLID`) | RGB color + paint opacity. |
| `linear-gradient` fill | `GradientPaint` (`GRADIENT_LINEAR`) | Affine 2x3 matrix mapping CSS angle and non-square aspect ratio to Figma unit coordinate space; normalized color stops. |
| `radial-gradient` fill | `GradientPaint` (`GRADIENT_RADIAL`) | Affine 2x3 matrix mapping normalized center and ellipse radii to Figma unit coordinate space; normalized color stops. |
| Uniform borders | `strokes` + `strokeWeight` | Single shared solid paint and scalar stroke weight. |
| Non-uniform border widths | Native individual stroke weights | Compatible solid borders map directly to `strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight`, `strokeLeftWeight`. |
| Mixed border colors | Primary color paint + diagnostic | Figma exposes a single strokes paint array per node; uses primary side color and emits `BORDER_COLOR_APPROXIMATED`. |
| Border styles (`dashed`, `dotted`) | Native `dashPattern` | Approximated using native dash patterns; emits `BORDER_STYLE_APPROXIMATED`. |
| Multiple drop shadows | Native `DROP_SHADOW` effects | Preserves original CSS top-to-bottom stack order. |
| Inset box shadows | Native `INNER_SHADOW` effects | Preserves offset, blur, spread, and independent alpha. |

## Host Boundary (`FigmaRendererHost`)

The renderer interacts with Figma strictly through a lightweight host adapter interface:
- `createFrame()`, `createRectangle()`, `createText()`
- `createNodeFromSvg(svg)`, `createImage(bytes)`, `createImageAsync(url)`
- `base64Decode(data)`, `loadFontAsync(fontName)`, `listAvailableFontsAsync()`
- `appendRoot(rootNode)`, `setSelection(nodes)`, `scrollAndZoomIntoView(nodes)`, `getViewportCenter()`

In tests, `FakeFigmaHost` provides in-memory node structures and supports `clipsContent: boolean`, `rotation: number`, `relativeTransform: Transform`, and `rescale(scale: number)`. In production, `createFigmaHost()` delegates directly to Figma's global API.

## Fidelity Regression Suite

Run with `npm run fidelity`:
- 18 fixtures (7 canonical schema fixtures + 11 Chrome browser captures including `fidelity-transforms` and `fidelity-clipping`).
- Evaluates geometry, hierarchy, text, fills, non-uniform strokes, radii, drop and inner shadows, container clipping, transforms/rotations, images, SVGs, and assets.
