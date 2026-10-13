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

## Coordinate Conversion

The Design Schema stores **absolute document-origin CSS pixels**. Figma nested node coordinates are **parent-local**.
The renderer recursively calculates:
```text
localX = child.absoluteX - parent.absoluteX
localY = child.absoluteY - parent.absoluteY
```
The root frame itself is placed centered around the Figma viewport center without altering internal coordinates.

## Traceability

Every generated SceneNode preserves source metadata using Figma plugin data:
- `web2design:id`: Source `DesignNode.id`
- `web2design:type`: Source `DesignNode.type`
- `web2design:sourceTag`: Source HTML tag when present
- `web2design:schemaVersion`: Schema version (root frame)

## Tests

```bash
npm test -w @web2design/figma-renderer
npm run typecheck -w @web2design/figma-renderer
npm run build -w @web2design/figma-renderer
```
