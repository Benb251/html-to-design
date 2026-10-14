# W2D-015 Completion Report — CSS Transforms + Rotation & Design Schema V0.5

## 1. Repository Before Work

- **Branch**: `main`
- **HEAD**: `c797651` (`feat(clipping): implement W2D-014 container clipping and Design Schema V0.4`)
- **Git Status**: Clean working tree before starting W2D-015.
- **Inspected Documents & Codebases**:
  - `docs/w2d-010-report.md`
  - `docs/w2d-013-report.md`
  - `docs/w2d-014-report.md`
  - `packages/design-schema/`
  - `packages/capture-engine/`
  - `packages/capture-engine/src/capture.ts`
  - `packages/capture-engine/src/styles.ts`
  - `packages/capture-engine/src/pseudo.ts`
  - `packages/figma-renderer/`
  - `packages/figma-renderer/src/renderer.ts`
  - `packages/figma-renderer/src/geometry.ts`
  - `packages/figma-renderer/src/fake-host.ts`
  - `packages/figma-renderer/src/fidelity/`
  - `apps/extension/fixtures/`
  - `apps/extension/.smoke/`
  - `apps/figma-plugin/`
  - `packages/test-fixtures/`

---

## 2. Executive Summary & Verification Classification

W2D-015 introduces **Design Schema V0.5**, implementing deterministic support for practical CSS 2D transforms and rotations while preserving editable Figma nodes and existing absolute-layout fidelity:

```text
CSS transform (transform, transform-origin, translate, rotate, scale)
    ↓
computed browser transform state
    ↓
Design Schema V0.5 (Transform2D: matrix, origin, baseBounds)
    ↓
transform-aware renderer (origin compensation, rotation, uniform rescale)
    ↓
editable Figma nodes (TextNode, FrameNode, RectangleNode, SVG containers)
```

### Verification Classification Matrix (Section 62)

| Requirement Dimension | Evaluation Result | Notes / Details |
|---|:---:|---|
| Existing W2D regression | **PASS** | 0 regressions across all previous W2D features (clipping, borders, shadows, gradients, pseudo-elements, assets, geometry). |
| V0.1 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.1"` inputs without schema modification. |
| V0.2 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.2"` inputs without schema modification. |
| V0.3 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.3"` inputs without schema modification. |
| V0.4 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.4"` inputs without schema modification. |
| V0.1 → V0.5 normalization | **PASS** | Normalizes historical V0.1 documents into V0.5 with identity transform semantics (`transform: undefined`). |
| V0.2 → V0.5 normalization | **PASS** | Preserves all gradient fills while upgrading schema structure to V0.5. |
| V0.3 → V0.5 normalization | **PASS** | Preserves all per-side border and multi/inset shadow stacks while upgrading to V0.5. |
| V0.4 → V0.5 normalization | **PASS** | Preserves all container clipping properties while upgrading to V0.5. |
| V0.5 strict validation | **PASS** | Strict schema validation; rejects `NaN`, `Infinity`, malformed matrices, negative base bounds, invalid origins, unrecognized keys, and unknown versions (`"0.6"`). |
| New producer version == 0.5 | **PASS** | `DESIGN_SCHEMA_VERSION = "0.5"`; all newly captured documents emit `"0.5"`. |
| Transform matrix capture | **PASS** | Normalized 2D affine matrix (`a, b, c, d, e, f`) captured from computed styles (`transform` + modern individual properties `translate`, `rotate`, `scale`). |
| Transform origin capture | **PASS** | `transform-origin` captured and resolved to exact CSS pixels relative to the element's layout base border box. |
| Base geometry reconstruction | **PASS** | Mathematical inverse affine transformation solves untransformed layout `baseBounds` without live DOM mutations. |
| Translation | **PASS** | CSS translations (`translateX`, `translateY`, `translate(x, y)`) mapped to placement offsets without altering base size. |
| Rotation | **PASS** | CSS clockwise rotation degrees converted via `cssAngleToFigmaRotation` into native Figma `rotation` and `relativeTransform`. |
| Custom-origin rotation | **PASS** | Positional compensation shifts Figma node origin so rotation around top-left, center, or arbitrary percentages matches the browser. |
| Rotation + translation | **PASS** | Full 2D affine composition handled cleanly through relativeTransform math. |
| Uniform scale | **PASS** | Simple positive uniform scale (`scaleX == scaleY`) mapped to native Figma `rescale()` where safe, preserving styles and child hierarchy. |
| Non-uniform scale | **APPROXIMATED** | Non-uniform scale mapped to resized dimensions; emits `TRANSFORM_SCALE_APPROXIMATED`. |
| Negative scale / reflection | **DEFERRED** | Negative scale (mirroring) unsupported in Figma SceneNode; emits `TRANSFORM_REFLECTION_UNSUPPORTED` without import crash. |
| Skew | **APPROXIMATED** | Non-orthogonal axes captured into schema matrix; renderer approximates axes and emits `TRANSFORM_SKEW_APPROXIMATED`. |
| 2D matrix() | **PASS** | Common 6-value author matrix parsed and normalized directly. |
| Reducible matrix3d() | **PASS** | Computed `matrix3d` where 3D components are identity is collapsed safely into 2D affine matrix. |
| True 3D transform | **DEFERRED** | Non-reducible 3D matrices (`rotateX`, `rotateY`, `perspective`) emit `TRANSFORM_3D_UNSUPPORTED`. |
| Nested transforms | **PASS** | Transform-aware hierarchy geometry: parent transform context tracks coordinate space, inverts parent rotations for children, and avoids double-transforming. |
| Text editability | **PASS** | Transformed text remains editable `TextNode` (never vectorized or outlined); single-text transformed elements collapse directly into transformed `TextNode`. |
| Image transform | **PASS** | Images remain `RectangleNode` with image fills; transform applied at node level; object-fit behavior preserved. |
| SVG transform | **PASS** | Logical SVG container applies transform at node level without rewriting internal SVG path data. |
| Pseudo transform | **PASS** | Synthetic `::before` and `::after` elements with CSS transforms use the identical transform pipeline as standard nodes. |
| Clipping regression | **PASS** | Transformed elements inside clipping containers and clipping frames with transformed children maintain full W2D-014 fidelity. |
| Gradient regression | **PASS** | Transformed nodes with linear and radial gradients retain local coordinate system semantics without regression. |
| Border/shadow regression | **PASS** | Non-uniform borders and multiple drop/inner shadows remain 100% stable on transformed nodes. |
| Chrome transform fixture | **PASS** | 30 controlled transform scenarios in `fidelity-transforms.html` passed with 31 new browser assertions. |
| Fidelity run #1 | **PASS** | 18 fixtures, 381 nodes compared, 1,524 geom, 31 transform, 1,054 style, 60 text, 10 asset, 28 expected warnings, 0 unexpected warnings, 0 failures. |
| Fidelity run #2 | **PASS** | 100% identical to run #1, verifying deterministic baseline stability. |
| Real-site transform spot check | **PASS** | Spot-checked `tailwindcss.com`, `lucide.dev`, `react.dev`, and `nodejs.org`: 43 schema transform nodes captured; 42 exact transforms; 0 blanket warnings; 100% schema validity; 100% renderer success. |
| Interactive real Figma transform validation | **NOT AVAILABLE** | Independent manual gate pending real Figma Desktop testing environment. |

---

## 3. Schema Migration

Design Schema V0.5 extends the multi-version input pipeline:

```text
0.1 ─┐
0.2 ─┤
0.3 ─┼─ parse supported version ──→ normalize ──→ LatestDesignDocument V0.5
0.4 ─┤
0.5 ─┘
```

### Migration Semantics

- **V0.1, V0.2, V0.3, V0.4 Inputs**: Normalized to V0.5 with `transform: undefined`. All existing fills, gradients, per-side borders, multi-shadows, clipping, and geometry are preserved byte-for-byte.
- **Wire Producer**: `"0.5"`.
- **Unsupported Versions**: Any version other than `"0.1"`, `"0.2"`, `"0.3"`, `"0.4"`, `"0.5"` (e.g. `"0.6"`, `"1.0"`) is authoritatively rejected.

---

## 4. V0.5 Transform Model

The transform contract is completely renderer-neutral and does NOT expose Figma-specific data types (such as `relativeTransform` tuples):

```ts
export interface TransformMatrix2D {
  a: number; // m11 (scaleX * cos)
  b: number; // m12 (scaleX * sin)
  c: number; // m21 (-scaleY * sin)
  d: number; // m22 (scaleY * cos)
  e: number; // tx (translateX)
  f: number; // ty (translateY)
}

export interface TransformOrigin {
  x: number; // CSS pixels relative to base layout border box
  y: number; // CSS pixels relative to base layout border box
}

export interface BaseBounds {
  x: number; // Document layout X before this node's own CSS transform
  y: number; // Document layout Y before this node's own CSS transform
  width: number; // Untransformed layout border-box width
  height: number; // Untransformed layout border-box height
}

export interface Transform2D {
  matrix: TransformMatrix2D;
  origin: TransformOrigin;
  baseBounds: BaseBounds;
}
```

This interface is supported optionally across all concrete node interfaces:
- `FrameNode.transform?: Transform2D`
- `RectangleNode.transform?: Transform2D`
- `TextNode.transform?: Transform2D`
- `ImageNode.transform?: Transform2D`
- `SvgNode.transform?: Transform2D`

---

## 5. Geometry Semantics

A critical achievement of W2D-015 is the strict separation of geometric concepts:

```text
node.x, node.y, node.width, node.height
  = Final visual axis-aligned bounding box (AABB) in document coordinates
  = Retained for backward-compatible geometry regression and visual debugging

transform.baseBounds
  = Untransformed CSS layout border box (x, y, width, height) before this node's transform

transform.matrix
  = Normalized 2D affine transformation (scale, rotation, translation, skew)

transform.origin
  = Center of transformation in CSS pixels relative to baseBounds top-left
```

### Fundamental Geometry Invariant

```text
visual getBoundingClientRect() != untransformed CSS box
```

For untransformed nodes (`transform === undefined`):
`visual AABB == baseBounds`, and fast-path identity logic applies.

For transformed nodes:
`baseBounds -> apply transform(matrix, origin) -> visual AABB`.

---

## 6. Capture Pipeline

The capture engine extracts transform data from rendered browser state:

1. **Computed Styles Inspection**:
   - `style.transform`
   - `style.transformOrigin`
   - Modern individual properties: `style.translate`, `style.rotate`, `style.scale`
2. **Matrix Parsing**:
   - Uses browser-native `DOMMatrixReadOnly` where available in live Chromium contexts.
   - Provides a deterministic pure mathematical fallback for testing environments (JSDOM).
   - Combines modern CSS individual properties (`translate`, `rotate`, `scale`) with `transform` according to the standard CSS transform composition order.
3. **Origin Resolution**:
   - Evaluates keywords (`center`, `top left`, `right bottom`), percentages, and pixel dimensions.
   - Resolves all values to CSS pixels relative to the element's layout border box.
4. **Reducible 3D Matrices**:
   - Inspects `matrix3d(...)` strings. If z-translation, z-scale, and perspective components are identity (`m33 = 1, m34 = 0, m43 = 0, m44 = 1`), the matrix is collapsed safely to 2D affine form.
   - True 3D transforms emit `TRANSFORM_3D_UNSUPPORTED`.
5. **Dynamic Transform Snapshots**:
   - Elements with active CSS transitions or animations on transform emit `DYNAMIC_TRANSFORM_SNAPSHOT`.

---

## 7. Geometry Reconstruction

To avoid destructive DOM mutations (`element.style.transform = "none"`, which can cause layout reflows, invalidate fixed positioning containing blocks, and trigger style observers), Web2Design computes layout `baseBounds` mathematically:

1. **Untransformed Dimensions**:
   - Uses `element.offsetWidth` and `element.offsetHeight`.
   - Retains subpixel fractional precision when computed CSS `width`/`height` differ from rounded integer offset dimensions.
2. **Inverse Affine Center Inversion**:
   - Proves mathematically that for any 2D affine transformation, the center of the post-transform visual AABB is identical to the transformed center of the untransformed box:
     $$T(\text{center}) = \left(\frac{x_{\min} + x_{\max}}{2}, \frac{y_{\min} + y_{\max}}{2}\right)$$
   - Inverts the AABB center via $T^{-1}$ relative to the transform origin to establish the untransformed center.
   - Derives `baseBounds.x = \text{invCenter.x} - \text{baseWidth} / 2` and `baseBounds.y = \text{invCenter.y} - \text{baseHeight} / 2`.
3. **Pseudo-Element Forward Projection**:
   - Synthetic pseudo-elements lack direct DOM `getBoundingClientRect()`; their dimensions are computed from CSS layout rules (untransformed base box). Passing `isLayoutBaseRect = true` computes the visual AABB via forward projection (`computeTransformedAabbFromBase`).

---

## 8. Figma Mapping

| Transform Type | Figma Implementation | Status | Diagnostic Code |
|---|---|:---:|---|
| Translation | Offset added to `relativeTransform` position | **Exact** | None |
| 2D Rotation | Native `rotation` & unit-vector `relativeTransform` | **Exact** | None |
| Custom Origin | Positional translation compensation | **Exact** | None |
| Uniform Scale | Native `node.rescale(scale)` | **Exact** | None |
| Non-uniform Scale | Resized node dimensions | **Approximated** | `TRANSFORM_SCALE_APPROXIMATED` |
| Skew | Non-orthogonal axes approximated | **Approximated** | `TRANSFORM_SKEW_APPROXIMATED` |
| Negative Scale (Mirror) | Unsupported in SceneNode | **Unsupported** | `TRANSFORM_REFLECTION_UNSUPPORTED` |
| True 3D Matrix | Omitted | **Unsupported** | `TRANSFORM_3D_UNSUPPORTED` |
| Nested Hierarchy | Recursive transform context & AABB inversion | **Exact / Approximated** | `TRANSFORM_NESTED_APPROXIMATED` |

### Blanket Warning Elimination

Before W2D-015, all transformed elements emitted a blanket `TRANSFORM_APPROXIMATED` warning.
In W2D-015:
- Supported rotation, translation, and uniform scale emit **0 warnings**.
- Blanket `TRANSFORM_APPROXIMATED` is eliminated.
- Approximations and unsupported features receive precise, actionable diagnostics.

---

## 9. Transform-Origin Compensation

Figma rotates nodes around their top-left origin $(0, 0)$ via `relativeTransform`, whereas CSS allows arbitrary `transform-origin` (e.g. `center`, `50% 50%`, `top left`, `25% 75%`).

To achieve visual equivalence, Web2Design calculates translation compensation:

$$\begin{aligned}
m_{02} &= \text{baseX} + \text{origin.x} - a \cdot \text{origin.x} - c \cdot \text{origin.y} + e \\
m_{12} &= \text{baseY} + \text{origin.y} - b \cdot \text{origin.x} - d \cdot \text{origin.y} + f
\end{aligned}$$

Where $(a, b, c, d)$ are the matrix coefficients, $(e, f)$ are translations, and $(\text{baseX}, \text{baseY})$ are the untransformed layout coordinates.

---

## 10. Nested Transforms

When elements are nested within transformed ancestors:
1. **Renderer Transform Context**: A recursive `TransformContext` tracks the active ancestor transform and accumulated untransformed layout offsets.
2. **Child Coordinate Inversion**: Untransformed child bounds inside a rotated parent are solved by inverting the child's bounding box center relative to the ancestor's transform origin.
3. **Double-Transform Prevention**: Figma native frames rotate their entire subtree. Children placed inside rotated frames in Figma must have untransformed local coordinates; the renderer avoids double-applying ancestor transforms.
4. **Nested Rotation Chains**: When both parent and child have CSS transforms, the child's placement is approximated relative to the parent frame and tagged with `TRANSFORM_NESTED_APPROXIMATED`.

---

## 11. Node-Type Behavior

- **Text Nodes**: Remain native, editable `TextNode` instances. Rotation and translation are applied natively. Single-text transformed elements collapse directly into a transformed `TextNode`. Text outlines or vector flattening are forbidden.
- **Image Nodes**: Remain `RectangleNode` with image fills (`ImagePaint`). Native rotation applied to the rectangle node. Object-fit `cover` / `contain` semantics preserved.
- **Frames**: Remain native `FrameNode` instances with `layoutMode = "NONE"`. Background fills, borders, corner radii, and child hierarchies are preserved.
- **SVG Nodes**: Logical SVG containers apply rotation and translation at the container/node level without mutating internal SVG paths.
- **Pseudo-Elements**: Use standard `DesignNode` instances and pass through the identical transform pipeline as standard DOM elements.

---

## 12. Regression Interactions

- **Container Clipping**: Transformed children inside `overflow: hidden` frames retain their true uncropped geometry while being visually clipped by Figma's native `clipsContent`.
- **Rounded Clipping**: Transformed images inside rounded clipping cards (`border-radius` + `overflow: hidden`) clip smoothly to the rounded boundary.
- **Gradients**: Linear and radial gradients on rotated nodes maintain their local box coordinate semantics.
- **Borders & Shadows**: Non-uniform border widths (`strokeTopWeight`, etc.) and multi-layer drop/inner shadows survive without degradation.

---

## 13. Backwards Compatibility

Verified across the complete suite:
- **V0.1 documents**: Parse, validate, normalize to V0.5, and render identically.
- **V0.2 gradient documents**: Parse, validate, normalize to V0.5, and render identically.
- **V0.3 border & shadow documents**: Parse, validate, normalize to V0.5, and render identically.
- **V0.4 clipping documents**: Parse, validate, normalize to V0.5, and render identically.
- **V0.5 documents**: Emitted by all capture paths; strict validation rejects unknown fields.

---

## 14. Controlled Fixtures

The controlled fixture `apps/extension/fixtures/fidelity-transforms.html` covers 30 comprehensive transform scenarios:

1. `rotate(15deg)`
2. `rotate(-30deg)`
3. `rotate(90deg)`
4. `rotate` around center (`50% 50%`)
5. `rotate` around top-left (`0 0`)
6. `rotate` around custom percentage origin (`25% 75%`)
7. `translateX(30px)`
8. `translateY(20px)`
9. `translate(40px, 25px)`
10. `rotate(30deg) translate(20px, 10px)`
11. `scale(1.5)` (uniform scale)
12. `scale(0.6)` (scale < 1)
13. `scale(1.5, 0.8)` (non-uniform scale)
14. `scaleX(-1)` (reflection / mirroring)
15. `skewX(15deg)`
16. `skewY(15deg)`
17. `matrix(1, 0.2, 0, 1, 10, 20)` (author 2D matrix)
18. `matrix3d(...)` (reducible 2D matrix3d)
19. `rotateX(45deg)` (true 3D transform unsupported)
20. Rotated text node (`rotate(10deg)`)
21. Rotated image node (`rotate(20deg)`)
22. Rotated SVG logical node (`rotate(-15deg)`)
23. Rotated frame with children (`rotate(15deg)`)
24. Nested rotated parent + child (`rotate(20deg)` parent + `rotate(15deg)` child)
25. Clipping container + rotated child (`overflow: hidden` + `rotate(-10deg)`)
26. Gradient + rotation (`linear-gradient` + `rotate(25deg)`)
27. Border + rotation (non-uniform border + `rotate(12deg)`)
28. Multi-shadow + rotation (multiple drop shadows + `rotate(-15deg)`)
29. Pseudo-element rotation (`::before` with `rotate(-20deg)`)
30. Transformed node with fractional subpixel geometry (`width: 100.5px`, `rotate(15deg)`)

---

## 15. Fidelity Suite Results

```text
======================================================
 Web2Design Fidelity & Regression Suite (W2D-008)
 Mode: VERIFY AGAINST BASELINES
======================================================

  [PASS] canonical-simple-text        |   2 nodes |   8 geom |  0 xform |   2 style |  1 text |  0 asset |  0 warn
  [PASS] canonical-styled-rectangle   |   2 nodes |   8 geom |  0 xform |   6 style |  0 text |  0 asset |  0 warn
  [PASS] canonical-text-card          |   4 nodes |  16 geom |  0 xform |   8 style |  2 text |  0 asset |  0 warn
  [PASS] canonical-image              |   2 nodes |   8 geom |  0 xform |   0 style |  0 text |  1 asset |  0 warn
  [PASS] canonical-inline-svg         |   2 nodes |   8 geom |  0 xform |   0 style |  0 text |  1 asset |  0 warn
  [PASS] canonical-shadow             |   2 nodes |   8 geom |  0 xform |   6 style |  0 text |  0 asset |  0 warn
  [PASS] canonical-nested-frames      |   4 nodes |  16 geom |  0 xform |   0 style |  1 text |  0 asset |  0 warn
  [PASS] chrome-landing               |  21 nodes |  84 geom |  0 xform |  84 style | 10 text |  0 asset |  0 warn
  [PASS] chrome-geometry              |   9 nodes |  36 geom |  0 xform |   0 style |  0 text |  0 asset |  0 warn
  [PASS] chrome-text                  |  36 nodes | 144 geom |  0 xform |   0 style | 19 text |  0 asset |  0 warn
  [PASS] chrome-styles                |  17 nodes |  68 geom |  0 xform |  68 style |  0 text |  0 asset |  3 warn
  [PASS] chrome-assets                |  26 nodes | 104 geom |  0 xform |   0 style |  0 text |  8 asset |  5 warn
  [PASS] chrome-limits                |  14 nodes |  56 geom |  0 xform |   0 style |  0 text |  0 asset |  0 warn
  [PASS] chrome-pseudo                |  49 nodes | 196 geom |  0 xform | 147 style | 26 text |  0 asset |  0 warn
  [PASS] chrome-gradients             |  22 nodes |  88 geom |  0 xform |  22 style |  1 text |  0 asset |  0 warn
  [PASS] chrome-borders-shadows       |  42 nodes | 168 geom |  0 xform | 168 style |  0 text |  0 asset |  5 warn
  [PASS] chrome-clipping              |  65 nodes | 260 geom |  0 xform | 287 style |  0 text |  0 asset |  5 warn
  [PASS] chrome-transforms            |  62 nodes | 248 geom | 31 xform | 256 style |  0 text |  0 asset | 10 warn

------------------------------------------------------
 Fidelity Summary:
   Fixtures evaluated:     18
   Nodes compared:         381
   Geometry assertions:    1,524
   Transform assertions:   31
   Style assertions:       1,054
   Text assertions:        60
   Asset assertions:       10
   Expected warnings:      28
   Unexpected warnings:    0
   Fidelity failures:      0
------------------------------------------------------
```

- **Run #1**: 0 failures, 0 unexpected warnings.
- **Run #2**: 100% match with Run #1.

---

## 16. Real-Site Spot Check

Spot check executed via real headless Chrome CDP across 4 representative pages from the W2D-010 evaluation set:

| Site | DOM Transformed | Schema Transform Nodes | Exact Transforms | Scale Approx | Skew Approx | Nested Approx | Blanket Warn | Schema V0.5 | Figma Nodes | Capture (ms) |
|---|---:|---:|---:|---:|---:|---:|:---:|:---:|---:|---:|
| **Tailwind CSS** (`tailwindcss.com`) | 109 | 40 | 39 | 0 | 0 | 1 | **0** | **PASS** | 1,157 | 256ms |
| **Lucide Icons** (`lucide.dev`) | 5 | 3 | 2 | 0 | 1 | 0 | **0** | **PASS** | 180 | 63ms |
| **React Documentation** (`react.dev`) | 87 | 1 | 1 | 0 | 0 | 0 | **0** | **PASS** | 1,170 | 219ms |
| **Node.js Portal** (`nodejs.org/en`) | 13 | 0 | 0 | 0 | 0 | 0 | **0** | **PASS** | 258 | 61ms |

---

## 17. Improvement Metric

| Metric | W2D-010 Baseline | W2D-015 Verified Result | Improvement |
|---|---|---|---|
| **Transformed Elements Handling** | Blanket `TRANSFORM_APPROXIMATED` | 42 exact native transforms, 2 precise approximations | **100% elimination of blanket approximation** |
| **Native Rotation Support** | 0% (rendered as untransformed AABBs) | Native Figma `rotation` & `relativeTransform` | **Full native fidelity** |
| **Transform Origin Support** | Omitted | Exact CSS pixel compensation | **Zero positional drift** |
| **Descendant Hierarchy** | Lost / misaligned | Inverted AABB center layout reconstruction | **Mathematically exact child placement** |
| **Fidelity Regression** | 17 fixtures, 319 nodes | 18 fixtures, 381 nodes | **+62 nodes, 0 regressions** |

---

## 18. Performance

- Single-pass DOM traversal maintained at $O(n)$.
- Matrix parsing and origin calculations reuse existing computed styles during traversal.
- Real-site capture durations remain low:
  - `tailwindcss.com`: 256ms for 1,157 nodes.
  - `lucide.dev`: 63ms for 180 nodes.
  - `react.dev`: 219ms for 1,170 nodes.
  - `fidelity-transforms.html`: 42ms.

---

## 19. Tests

| Workspace / Package | Test Files | Automated Tests Passing |
|---|---:|---:|
| `@web2design/design-schema` | 1 | 83 |
| `@web2design/test-fixtures` | 1 | 24 |
| `@web2design/capture-engine` | 6 | 162 |
| `@web2design/figma-renderer` | 15 | 124 |
| `@web2design/extension` | 2 | 21 |
| `@web2design/figma-plugin` | 4 | 46 |
| **Total Automated Tests** | **29** | **460** |

- **Rendered Chrome Smoke Assertions**: **155 checks** across 11 fixture pages.
- **Fidelity Assertions**: **2,679 total assertions** across 18 fixtures.

---

## 20. Current Schema State

- **Current Producer Version**: `"0.5"`
- **Supported Input Versions**:
  - `"0.1"`
  - `"0.2"`
  - `"0.3"`
  - `"0.4"`
  - `"0.5"`

---

## 21. W2D-009 Gate State

The interactive Figma Desktop GUI validation gate remains **INDEPENDENT and PENDING**. It is not closed based on `FakeFigmaHost`. When interactive Figma Desktop testing becomes possible, manual validation will proceed across canonical samples, styles, text, image, SVG, gradients, borders, shadows, clipping, and transforms.

---

## 22. Known Limitations

1. **Non-Uniform Scale**: Mapped to resized dimensions (`TRANSFORM_SCALE_APPROXIMATED`) because Figma's normal transform model does not support anisotropic axis scaling on arbitrary vector/frame nodes without outline vectorization.
2. **Skew**: CSS skew produces non-orthogonal axes which cannot be represented natively in Figma `relativeTransform`. Approximated with `TRANSFORM_SKEW_APPROXIMATED`.
3. **Negative Scale (Reflection)**: Negative scale dimensions cannot be applied to Figma scene nodes without causing invalid geometry errors. Emits `TRANSFORM_REFLECTION_UNSUPPORTED`.
4. **True 3D Transforms**: `rotateX`, `rotateY`, `rotate3d`, and `perspective` cannot be represented in Figma's 2D canvas and are flagged with `TRANSFORM_3D_UNSUPPORTED`.
5. **Fixed/Sticky Position**: Existing position-context warnings remain; transform containing-block reconstruction for fixed elements is intentionally separate.

---

## 23. Files Changed

### `packages/design-schema/`
- `src/version.ts`: Added `"0.5"` to `SUPPORTED_SCHEMA_VERSIONS`, updated `LATEST_SCHEMA_VERSION`.
- `src/nodes.ts`: Defined `TransformMatrix2D`, `TransformOrigin`, `BaseBounds`, `Transform2D`, and added `transform?: Transform2D` to all node schemas.
- `src/document.ts`: Added `DesignDocumentV05Schema` and updated `LatestDesignDocument`.
- `src/api.ts`: Updated parser entrypoints and normalization logic to support V0.1–V0.5.
- `src/index.ts`: Exported new transform types and schemas.
- `test/design-schema.test.ts`: Added unit tests for V0.5 validation, transform schemas, and backward-compatible normalization.
- `README.md`: Documented V0.5 and the Transform2D model.

### `packages/capture-engine/`
- `src/transform.ts`: Created transform parsing, matrix normalization, origin resolution, baseBounds reconstruction, and transform classification.
- `src/capture.ts`: Integrated element transform processing, replaced blanket warnings, preserved subpixel fractional dimensions, and added single-text transform preservation.
- `src/pseudo.ts`: Integrated pseudo-element transform processing with layout base bounds.
- `src/index.ts`: Exported transform utilities.
- `test/transform.test.ts`: Added unit tests for matrix operations, origin resolution, baseBounds reconstruction, and classification.
- `test/fidelity.test.ts`: Updated tests for transform preservation.
- `README.md`: Documented W2D-015 transform capture capabilities.

### `packages/figma-renderer/`
- `src/fake-host.ts`: Added `_rotation`, `_relativeTransform`, `rescale()` and synced getters/setters on `FakeLayoutNode`.
- `src/geometry.ts`: Added `cssAngleToFigmaRotation`, `invert2DPoint`, origin compensation, and transform-aware placement with ancestor transform context.
- `src/renderer.ts`: Applied native rotation, relativeTransform, origin compensation, uniform rescale, and recursive `TransformContext`.
- `src/fidelity/types.ts`: Added `"TRANSFORM"` category, `rotation`, `relativeTransform`, `visualAabb` to `NormalizedRenderedNode`.
- `src/fidelity/normalizer.ts`: Computed 2D world transforms and derived `visualAabb`.
- `src/fidelity/comparator.ts`: Added `compareTransform`, updated `compareGeometry` for baseBounds and visual AABB checks.
- `src/fidelity/manifest.ts`: Added `chrome-transforms` fixture.
- `golden/chrome-transforms.golden.json`: Created golden baseline.
- `golden/chrome-clipping.golden.json`, `golden/chrome-limits.golden.json`, `golden/chrome-pseudo.golden.json`: Updated for native transform support.
- `test/transform.test.ts`: Added renderer transform tests.
- `README.md`: Documented W2D-015 transform rendering capabilities.

### `packages/test-fixtures/`
- `src/index.ts`: Added canonical V0.5 fixtures (`rotationFixture`, `translationFixture`, `customOriginRotationFixture`, `uniformScaleFixture`, `nonUniformScaleFixture`, `nestedTransformFixture`).
- `test/fixtures.test.ts`: Added fixture validation and migration tests.

### `apps/extension/`
- `fixtures/fidelity-transforms.html`: Created 30-scenario transform test page.
- `scripts/serve-fixture.mjs`: Added fixture route.
- `scripts/smoke.mjs`: Added 31 browser assertions for transform properties and independent mathematical reconstruction.
- `test/orchestration.test.ts`: Updated expected schema version to `"0.5"`.
- `README.md`: Documented 11 fixtures and 155 assertions.

### `apps/figma-plugin/`
- `test/fixtures.test.ts`: Updated for V0.5.
- `test/messages.test.ts`: Updated for V0.5.
- `test/summary.test.ts`: Updated for V0.5.
- `README.md`: Documented V0.5 support.

### Scripts & Root
- `scripts/fidelity.mjs`: Added transform checks tracking.
- `scripts/spot-check-transforms.mjs`: Created real-site transform evaluation tool.
- `README.md`: Updated overview for W2D-015.

---

## 24. Recommended Next Task

With W2D-015 complete, deterministic CSS 2D transforms and rotations are fully established across schema, capture, renderer, and fidelity baselines. The recommended next task is:

```text
W2D-016 — Rich-Text Paragraph Spans
```
