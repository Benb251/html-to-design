# Capture Engine — W2D-017

Browser-only capture implementation emitting Design Schema V0.7 documents.

Public API: `captureDocument(document, options?)`, `analyzeFlexContainer`, `predictAutoLayoutGeometry`, `analyzeInlineTextFlow`, `collectRichTextFlow`, `hasIndependentBoxSemantics`, `documentRect`, `captureId`, `renderDecision`, `processElementTransform`, `reconstructBaseBounds`, `resolveTransformOrigin`, `classifyTransform`, normalization helpers, `splitBackgroundLayers`, `parseLinearGradient`, `parseRadialGradient`, `parseBackgroundGradientLayers`, `parseBoxShadows`, `createAssetRegistry`, `serializeAndSanitizeSvg`, `serializeCapture`, `countNodes`, `captureFilename`. The document must have a rendered `defaultView` and `body`. `captureDocument` returns the **normalized result of parseDesignDocument** under wire version `"0.7"`.

## High-Confidence Auto Layout Inference (W2D-017)

Web2Design captures exact rendered geometry first, and then conditionally adds semantic Flexbox metadata for high-confidence containers:

```text
Rendered browser layout
        ↓
absolute geometry capture   ← always preserved
        +
semantic Flexbox metadata   ← when confidently inferable
        ↓
Design Schema V0.7
        ↓
renderer inference guard
        ↓
high-confidence case → native Figma Auto Layout
ambiguous case       → existing absolute layout
```

### Supported Flexbox Subset

- `display: flex` and `inline-flex`
- `flex-direction: row` (horizontal) and `column` (vertical)
- `flex-wrap: nowrap`
- Fixed numeric pixel `gap`, `row-gap`, and `column-gap`
- `justify-content: flex-start`, `start`, `center`, `flex-end`, `end`, `space-between`
- `align-items: flex-start`, `start`, `center`, `flex-end`, `end`, `stretch`
- Child `align-self: stretch`
- Child `flex-grow: 1` (mapped to `grow: true` / native `layoutGrow = 1`)
- Child `position: absolute` (mapped to `positioning: "absolute"` / native `layoutPositioning = "ABSOLUTE"`)

### Rejection & Deferral Rules

Any Flexbox container that cannot be mapped into native Auto Layout with guaranteed geometric fidelity falls back unchanged to absolute positioning, emitting a structured diagnostic warning:

- `AUTO_LAYOUT_WRAP_DEFERRED`: `flex-wrap: wrap` or `wrap-reverse`.
- `AUTO_LAYOUT_REVERSE_DEFERRED`: `flex-direction: row-reverse` or `column-reverse`.
- `AUTO_LAYOUT_MARGIN_DEFERRED`: Non-zero flow-child margins that affect item spacing.
- `AUTO_LAYOUT_ORDER_DEFERRED`: Visual item reordering via CSS `order`.
- `AUTO_LAYOUT_BASELINE_DEFERRED`: `align-items: baseline` or child `align-self: baseline`.
- `AUTO_LAYOUT_GROW_RATIO_DEFERRED`: Arbitrary fractional or multi-item `flex-grow` ratios (`> 1`).
- `AUTO_LAYOUT_POSITION_OFFSET_DEFERRED`: Relative-positioned flow children with non-zero offsets.
- `AUTO_LAYOUT_GEOMETRY_MISMATCH`: Predicted semantic positions deviate by $> 0.5\text{px}$ from browser layout positions.
- `GRID_LAYOUT_SEMANTICS_DEFERRED`: `display: grid` or `inline-grid` (CSS Grid semantics deferred).

### Geometry Prediction Guard

Before exporting Auto Layout metadata, `analyzeFlexContainer` executes pure deterministic geometry prediction (`predictAutoLayoutGeometry`):
1. Calculates expected flow coordinates using container dimensions, computed padding (including border insets via `strokesIncludedInLayout`), gap, and alignment.
2. Checks transformed children using layout `baseBounds` rather than rotated visual AABBs.
3. Compares predicted coordinates against actual captured coordinates.
4. Requires error $\le 0.5\text{px}$ across all flow children. Mismatched containers reject inference and fall back to absolute layout.

## Rich Text Flow Capture (W2D-016)

The capture engine collapses continuous browser inline text flows into **one unified `TextNode`** with ordered character style ranges (`runs`):
- Single-TextNode rich text paragraph flows with native ranged font size, family, weight, style, color, spacing, decoration, and hyperlinks.
- Rich text children integrate naturally as flow items inside Auto Layout frames.

## Supported Features

- Light-DOM traversal of currently rendered normal-flow content in a single pass without redundant queries.
- CSS 2D transforms and rotation: computed styles normalized to 2D affine `Transform2D` contract.
- Non-destructive geometry reconstruction: solves layout `baseBounds` mathematically from visual AABB.
- Container clipping semantics (`overflow: hidden` and `overflow: clip`) captured non-destructively on `FrameNode.clip`.
- Synthetic pseudo-element capture (`::before` / `::after`) into deterministic standard nodes.
- First-class CSS gradient fill capture (`linear-gradient` and `radial-gradient`).
- Per-side borders, box shadows, and inset shadows.
- HTML `<img>` elements captured as `type: "image"` nodes.
- Inline `<svg>` elements captured as `type: "svg"` nodes.
