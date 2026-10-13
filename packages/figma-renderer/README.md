# @web2design/figma-renderer

Pure TypeScript rendering engine that translates validated Web2Design V0.1 documents into editable Figma node hierarchies.

## Philosophy

**Fidelity before semantics. Absolute layout before Auto Layout. Deterministic before AI.**

The renderer converts absolute document-origin CSS pixel coordinates into Figma parent-local coordinates, mapping schema visual properties directly to native Figma nodes without Auto Layout inference or external network dependencies.

## Architecture

```text
Validated DesignDocument
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
   └── FrameNode / Vector (native SVG via createNodeFromSvg)
```

## Supported Node Mappings

| Schema Node | Figma Target | Implementation Notes |
|---|---|---|
| `frame` | `FrameNode` | Fixed dimensions, `layoutMode = "NONE"`, default fills cleared, parent-local coordinates. |
| `rectangle` | `RectangleNode` | Solid fills, strokes, uniform/per-corner radius, single outer drop shadow. |
| `text` | `TextNode` | Editable characters, font resolver & cache, deterministic fallback, font size, line height, letter spacing, horizontal alignment, local opacity. |
| `image` | `RectangleNode` (Image fill) | Data URLs, embedded base64, and remote image URLs. `cover` → `FILL`, `contain` → `FIT`. Placeholders created on network or decode failures. |
| `svg` | `FrameNode` / vectors | Native SVG import via `host.createNodeFromSvg()`. Scaled to captured dimensions. Fallback placeholder on syntax failure. |

Synthetic pseudo-elements (`::before` / `::after`) captured in W2D-011 require **zero renderer specialization**: they map directly onto existing `frame`, `rectangle`, and `text` nodes, with parent-relative coordinates and standard styles applied transparently.

## Host Boundary (`FigmaRendererHost`)

The renderer interacts with Figma strictly through a lightweight host adapter interface rather than global mocks:
- `createFrame()`
- `createRectangle()`
- `createText()`
- `createNodeFromSvg(svg)`
- `createImage(bytes)`
- `createImageAsync(url)`
- `base64Decode(data)`
- `loadFontAsync(fontName)`
- `listAvailableFontsAsync()`
- `appendRoot(rootNode)`
- `setSelection(nodes)`
- `scrollAndZoomIntoView(nodes)`
- `getViewportCenter()`

In tests, `FakeFigmaHost` provides in-memory node structures. In production, `createFigmaHost()` delegates directly to Figma's global API.

## Coordinate Conversion & Reconstruction

The Design Schema stores **absolute document-origin CSS pixels**. Figma nested node coordinates are **parent-local**.
The renderer recursively calculates:
```text
localX = child.absoluteX - parent.absoluteX
localY = child.absoluteY - parent.absoluteY
```
The root frame itself is placed centered around the Figma viewport center without altering internal coordinates.

In the fidelity normalizer, global geometry is reconstructed recursively:
```text
child.absoluteX = parent.absoluteX + child.localX
child.absoluteY = parent.absoluteY + child.localY
```
This enables exact verification that rendered positions match original document-origin coordinates across arbitrarily deep nesting.

## Traceability

Every generated SceneNode preserves source metadata using Figma plugin data:
- `web2design:id`: Source `DesignNode.id`
- `web2design:type`: Source `DesignNode.type`
- `web2design:sourceTag`: Source HTML tag when present
- `web2design:schemaVersion`: Schema version (root frame)

## W2D-008 — Fidelity & Regression Suite

Web2Design features an automated regression pipeline that traces supported nodes from controlled browser captures through Design Schema into normalized rendered Figma scenes.

```text
controlled HTML fixture
        ↓
Chrome rendered capture
        ↓
Design Schema V0.1
        ↓
Figma renderer
        ↓
normalized Figma scene (NormalizedRenderedNode)
        ↓
fidelity assertions / golden baseline
```

### Taxonomy of Fidelity Categories
- `GEOMETRY`: Local and reconstructed absolute `x`, `y`, `width`, `height`.
- `HIERARCHY`: Node mapping, parent-child relations, child count and ordering.
- `TEXT`: Characters, font family, style, size, line height, letter spacing, alignment.
- `FILL`: Solid RGB colors, fill alpha, and absence of accidental default fills.
- `BORDER`: Uniform border stroke width, color, and alpha.
- `RADIUS`: Uniform and individual 4-corner radii (`topLeft`, `topRight`, `bottomRight`, `bottomLeft`).
- `SHADOW`: `DROP_SHADOW` offsets, blur radius, spread radius, color, and alpha.
- `IMAGE`: `RECTANGLE` target, `ImagePaint`, scale modes (`FILL` for cover, `FIT` for contain).
- `SVG`: Native vector container generation and target geometry.
- `WARNING`: Exact match against expected warning matrix for captured/approximated features.
- `ASSET`: Correct asset decoding and relationship resolution.

### Explicit Tolerances
- **Geometry Epsilon**: `0.1` px (CSS / Figma points)
- **Color Epsilon**: `0.01` (RGB/A channel 0..1 scale)
- **Opacity Epsilon**: `0.01`
- **Radius / Shadow Epsilon**: `0.1` px

### Central Fixture Manifest
All 13 fixtures (7 canonical schema fixtures + 6 real Chrome smoke captures) are defined in `src/fidelity/manifest.ts`:
1. `canonical-simple-text`: Typography, coordinates, leaf text node.
2. `canonical-styled-rectangle`: Solid fill, border, corner radius.
3. `canonical-text-card`: Card container, corner radius, nested text layers.
4. `canonical-image`: Remote URL asset, `cover` scale mode.
5. `canonical-inline-svg`: Native vector icon with circle SVG markup.
6. `canonical-shadow`: Outer drop shadow effect with blur and spread.
7. `canonical-nested-frames`: 3-tier deep frame hierarchy with parent-relative coordinates.
8. `chrome-landing`: Real capture of `landing.html` (hero, cards, typography, buttons).
9. `chrome-geometry`: Fractional/subpixel positions and deep nesting.
10. `chrome-text`: Multiline text, headings, alignment tokens, and letter-spacing.
11. `chrome-styles`: Fills, borders, radii, shadow, and local/nested opacity.
12. `chrome-assets`: Data URLs, remote images, object-fit `cover`/`contain`, inline SVG.
13. `chrome-limits`: Gracefully omitted unsupported features with explicit warnings.

### Developer Commands
```bash
# Run cross-pipeline regression suite against golden snapshots
npm run fidelity

# Explicitly update golden baseline snapshots (never done automatically)
npm run fidelity:update

# Run Vitest test suite (includes all fidelity unit & integration tests)
npm test -w @web2design/figma-renderer
```

### Machine-Readable Output
The runner writes a deterministic report to `packages/figma-renderer/dist/fidelity-report.json`:
```json
{
  "fixtures": 13,
  "nodesCompared": 141,
  "geometryChecks": 564,
  "styleChecks": 174,
  "textChecks": 33,
  "assetChecks": 10,
  "warningsExpected": 8,
  "warningsUnexpected": 0,
  "failures": 0
}
```

### What This Suite Does NOT Prove
- This suite verifies **semantic and geometric structural fidelity** at the Figma API / SceneNode representation level.
- It does **not** perform pixel-by-pixel raster diffing between Chrome and Figma, because Chrome (Blink) and Figma use completely different font rasterization and text layout engines.
- Real interactive Figma GUI visual equivalence remains manual/E2E validation (W2D-009).
- **Interactive Figma fidelity sanity in W2D-008**: `NOT AVAILABLE` (headless CLI environment).
