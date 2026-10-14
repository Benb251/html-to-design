# @web2design/figma-renderer — W2D-017

Pure TypeScript rendering engine that translates validated Web2Design Design Schema documents into editable Figma node hierarchies.

## Philosophy

**Fidelity before semantics. Auto Layout is an enhancement, not a replacement for absolute-layout fidelity. Deterministic before AI.**

The renderer converts absolute document-origin CSS pixel coordinates into Figma parent-local coordinates. For high-confidence semantic containers (`layout: { type: "flex", ... }`), it maps the container into native editable Figma Auto Layout with exact child alignment and sizing. For containers without semantic metadata or with ambiguous layouts, it falls back unconditionally to absolute layout (`layoutMode = "NONE"`).

## Architecture

```text
Versioned DesignDocument (V0.1, V0.2, V0.3, V0.4, V0.5, V0.6, or V0.7)
        ↓
normalizeDesignDocument(doc)  [Upgraded to latest V0.7]
        ↓
renderDesignDocument(doc, host, options)
        ↓
FigmaRendererHost (minimal adapter boundary)
        ↓
Native SceneNode Hierarchy:
  Web2Design — <Page Title> (FrameNode)
   ├── FrameNode (Auto Layout: HORIZONTAL / VERTICAL, or layoutMode = NONE fallback)
   ├── RectangleNode (fills, strokes, cornerRadius, drop/inner shadows, rotation)
   ├── TextNode (single editable text node with ranged styles, font cache, per-run fallback)
   ├── RectangleNode + ImagePaint (embedded base64 / remote URL, rotation)
   ├── FrameNode / Vector (native SVG via createNodeFromSvg, container transform)
   ├── Gradient Fills (native GRADIENT_LINEAR & GRADIENT_RADIAL paints)
   ├── Non-Uniform Strokes (native individual strokeTopWeight / strokeRightWeight...)
   ├── Shadow Effects (native DROP_SHADOW & INNER_SHADOW effect stacks)
   └── Transform-aware Placement (origin compensation, exact rotation, uniform rescale)
```

## Native Auto Layout Rendering Strategy (W2D-017)

For `FrameNode` instances with `layout`:
1. **Deterministic Application Sequence**:
   - Create native `FrameNode` and set fixed outer dimensions, fills, strokes, corner radii, and effects.
   - If borders are present, set `strokesIncludedInLayout = true` so strokes match CSS border box geometry without shifting inner padding.
   - Configure Auto Layout properties:
     - `layoutMode`: `"HORIZONTAL"` or `"VERTICAL"`.
     - `itemSpacing`: semantic gap in pixels.
     - `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`: semantic padding in pixels.
     - `primaryAxisAlignItems`: `"MIN"` (start), `"CENTER"` (center), `"MAX"` (end), or `"SPACE_BETWEEN"` (space-between).
     - `counterAxisAlignItems`: `"MIN"` (start), `"CENTER"` (center), `"MAX"` (end), or `"MIN"` (stretch fallback).
     - `primaryAxisSizingMode` / `counterAxisSizingMode`: `"FIXED"` or `"AUTO"`.
   - Create children in DOM flow order.
   - Configure child layout properties:
     - `layoutPositioning = "ABSOLUTE"` for absolute overlay/badge children (`positioning: "absolute"`).
     - `layoutGrow = 1` for growing children (`grow: true`).
     - `layoutAlign = "STRETCH"` for stretching children (`stretch: true`).
   - Normal flow children rely on native Figma Auto Layout placement (their positions are not overwritten with absolute coordinates).
   - Absolute children receive their parent-local coordinates directly.
   - Post-layout 2D transforms and rotation are applied without degrading Auto Layout.

2. **Absolute Layout Fallback**:
   - If `node.layout === undefined`, the frame renders with `layoutMode = "NONE"`.
   - Every child is positioned using parent-local absolute coordinates.
   - Output is 100% bit-equivalent to W2D-016.

## Supported Node & Style Mappings

| Schema Entity | Figma Target | Implementation Notes |
|---|---|---|
| `frame` (with `layout`) | Native Auto Layout `FrameNode` | Mapped to `layoutMode`, `itemSpacing`, `padding*`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `strokesIncludedInLayout`. |
| `frame` (without `layout`) | Absolute `FrameNode` | Fixed dimensions, `layoutMode = "NONE"`, parent-local coordinates. |
| Flow Child | Native Auto Layout Child | Participates in flow; supports `layoutGrow = 1` and `layoutAlign = "STRETCH"`. |
| Absolute Child | Native Absolute Child | Set to `layoutPositioning = "ABSOLUTE"` inside Auto Layout frame; retains local x/y. |
| Rich Text Runs (`runs`) | Native Text Ranges | Mapped via native ranged methods (`setRangeFontName`, `setRangeFontSize`, `setRangeFills`, etc.) on a single `TextNode`. |
| Hyperlinks | `HyperlinkTarget` | Safe URLs (`http:`, `https:`, `mailto:`, `tel:`) mapped to native Figma hyperlink ranges. |
| CSS 2D Rotation | Native `rotation` / `relativeTransform` | Mapped via explicit sign conversion helper (`cssAngleToFigmaRotation`), with origin compensation. |
