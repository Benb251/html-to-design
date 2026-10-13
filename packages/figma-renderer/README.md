# @web2design/figma-renderer — W2D-012

Pure TypeScript rendering engine that translates validated Web2Design Design Schema documents into editable Figma node hierarchies.

## Philosophy

**Fidelity before semantics. Absolute layout before Auto Layout. Deterministic before AI.**

The renderer converts absolute document-origin CSS pixel coordinates into Figma parent-local coordinates, mapping schema visual properties directly to native Figma nodes without Auto Layout inference or external network dependencies.

## Architecture

```text
Versioned DesignDocument (V0.1 or V0.2)
        ↓
normalizeDesignDocument(doc)  [V0.1 normalized to V0.2]
        ↓
renderDesignDocument(doc, host, options)
        ↓
FigmaRendererHost (minimal adapter boundary)
        ↓
Native SceneNode Hierarchy:
  Web2Design — <Page Title> (FrameNode)
   ├── FrameNode (nested frames with parent-local offsets)
   ├── RectangleNode (fills, strokes, cornerRadius, dropShadow)
   ├── TextNode (editable text, font cache, deterministic fallback)
   ├── RectangleNode + ImagePaint (embedded base64 / remote URL)
   ├── FrameNode / Vector (native SVG via createNodeFromSvg)
   └── Gradient Fills (native GRADIENT_LINEAR & GRADIENT_RADIAL paints)
```

## Supported Node & Style Mappings

| Schema Entity | Figma Target | Implementation Notes |
|---|---|---|
| `frame` | `FrameNode` | Fixed dimensions, `layoutMode = "NONE"`, default fills cleared, parent-local coordinates. |
| `rectangle` | `RectangleNode` | Solid fills, linear/radial gradient fills, strokes, uniform/per-corner radius, single outer drop shadow. |
| `text` | `TextNode` | Editable characters, font resolver & cache, deterministic fallback, font size, line height, letter spacing, horizontal alignment, local opacity. |
| `image` | `RectangleNode` (Image fill) | Data URLs, embedded base64, and remote image URLs. `cover` → `FILL`, `contain` → `FIT`. Placeholders created on network or decode failures. |
| `svg` | `FrameNode` / vectors | Native SVG import via `host.createNodeFromSvg()`. Scaled to captured dimensions. Fallback placeholder on syntax failure. |
| `solid` fill | `SolidPaint` (`SOLID`) | RGB color + paint opacity. |
| `linear-gradient` fill | `GradientPaint` (`GRADIENT_LINEAR`) | Affine 2x3 matrix mapping CSS angle and non-square aspect ratio to Figma unit coordinate space; normalized color stops. |
| `radial-gradient` fill | `GradientPaint` (`GRADIENT_RADIAL`) | Affine 2x3 matrix mapping normalized center and ellipse radii to Figma unit coordinate space; normalized color stops. |

## Gradient Fill Mapping (W2D-012)

### Linear Gradient Transform Math
Figma linear gradient paints use a 2x3 affine matrix `[[a, b, tx], [c, d, ty]]` in unit coordinate space:
- Direction vector for CSS angle $\alpha$ (0deg = up): $D = (\sin\alpha, -\cos\alpha)$
- Gradient line length in pixels: $L = |W\sin\alpha| + |H\cos\alpha|$
- Start handle in normalized coordinates: $(sx, sy) = (0.5 - \frac{L\sin\alpha}{2W}, 0.5 + \frac{L\cos\alpha}{2H})$
- Affine transform components: $a = \frac{L\sin\alpha}{W}, b = -\frac{L\cos\alpha}{H}, c = -b, d = a, tx = sx, ty = sy$
- Correctly handles landscape, portrait, square, cardinal, diagonal, and arbitrary angles.

### Radial Gradient Transform Math
Figma radial gradient paints use an affine matrix mapping center $(cx, cy)$ and normalized radii $(rx, ry)$:
- Matrix: `[[rx, 0, cx], [0, ry, cy]]`
- Supports circles, ellipses, and off-center radial gradients.

### Layer Ordering
In CSS, gradients are painted over solid background colors. In Figma Plugin API, `fills[0]` is drawn first (bottommost) and `fills[length - 1]` is on top. The renderer reverses top-to-bottom schema fills to Figma's bottom-to-top paint array, guaranteeing solid colors stay beneath gradients.

## Host Boundary (`FigmaRendererHost`)

The renderer interacts with Figma strictly through a lightweight host adapter interface:
- `createFrame()`, `createRectangle()`, `createText()`
- `createNodeFromSvg(svg)`, `createImage(bytes)`, `createImageAsync(url)`
- `base64Decode(data)`, `loadFontAsync(fontName)`, `listAvailableFontsAsync()`
- `appendRoot(rootNode)`, `setSelection(nodes)`, `scrollAndZoomIntoView(nodes)`, `getViewportCenter()`

In tests, `FakeFigmaHost` provides in-memory node structures. In production, `createFigmaHost()` delegates directly to Figma's global API.

## Fidelity Regression Suite

Run with `npm run fidelity` (or `npm run fidelity:update`):
- 15 fixtures (7 canonical schema fixtures + 8 Chrome browser captures including `fidelity-gradients`).
- Evaluates geometry, hierarchy, text, fills (solid and native linear/radial gradients), borders, radii, shadows, images, SVGs, and assets.
