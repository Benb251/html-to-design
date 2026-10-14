# Capture Engine — W2D-015

Browser-only capture implementation emitting Design Schema V0.5 documents.

Public API: `captureDocument(document, options?)`, `documentRect`, `captureId`, `renderDecision`, `processElementTransform`, `reconstructBaseBounds`, `resolveTransformOrigin`, `classifyTransform`, normalization helpers, `splitBackgroundLayers`, `parseLinearGradient`, `parseRadialGradient`, `parseBackgroundGradientLayers`, `parseBoxShadows`, `createAssetRegistry`, `serializeAndSanitizeSvg`, `serializeCapture`, `countNodes`, `captureFilename`. The document must have a rendered `defaultView` and `body`. `captureDocument` returns the **normalized result of parseDesignDocument** under wire version `"0.5"`.

## Supported

- Light-DOM traversal of currently rendered normal-flow content.
- CSS 2D transforms and rotation: computed styles (`transform`, `transform-origin`, modern individual `translate`, `rotate`, `scale`) parsed and normalized to 2D affine `Transform2D` contract.
- Non-destructive geometry reconstruction: solves layout `baseBounds` mathematically from visual AABB, matrix, and transform-origin without mutating live DOM styles.
- Subpixel fractional precision: retains fractional CSS box dimensions when offset dimensions are rounded integers.
- Container clipping semantics (`overflow: hidden` and `overflow: clip`) captured non-destructively on `FrameNode.clip` with per-axis fidelity (`clip: { x: boolean, y: boolean }`).
- Non-destructive descendant geometry: fully and partially clipped descendants retain their true uncropped positions and dimensions.
- Synthetic pseudo-element capture (`::before` / `::after`) into deterministic standard `text`, `rectangle`, or `frame` nodes with visual styles, transform, and clipping inheritance.
- First-class CSS gradient fill capture (`linear-gradient` and `radial-gradient`) on both real DOM nodes and synthetic pseudo-elements.
- Per-side borders: independent top, right, bottom, left width/style/color from computed styles.
- Ordered multiple box shadows and inset shadows (`inset: boolean`).
- Ordered fill stack preserving top gradient layers over underlying solid background colors.
- Standard HTML `<img>` elements captured as `type: "image"` nodes referencing validated `AssetRecord` entries in `document.assets`.
- Inline `<svg>` elements captured as `type: "svg"` nodes with sanitized markup in `inlineSvg` and an associated asset entry.
- Meaningful container frames: semantic groups, visual boxes, clipping wrappers, transformed wrappers, multi-child divs and local-opacity groups.
- Editable text from individual DOM text nodes and generated pseudo text using parent/pseudo computed typography.

## CSS 2D Transform Support Matrix (W2D-015)

| Scenario | Status | Behavior |
| --- | --- | --- |
| 2D Rotation (`rotate(deg)`) | Supported (Exact) | Reconstructed to baseBounds + affine matrix; no blanket warning |
| Custom `transform-origin` | Supported (Exact) | Resolved to CSS pixels relative to base bounds top-left |
| 2D Translation (`translateX`, `translateY`, `translate(x, y)`) | Supported (Exact) | Preserved in matrix `e, f`; base size intact |
| Rotation + Translation | Supported (Exact) | Exact affine composition |
| Simple Uniform Scale (`scale(s)`) | Supported (Exact) | Emitted in matrix; rendered via native Figma rescale |
| 2D `matrix(a, b, c, d, e, f)` | Supported (Exact) | Normalized directly into 6-value affine matrix |
| Reducible `matrix3d` | Supported (Exact) | Collapsed safely to 2D affine matrix if z-components are identity |
| Non-uniform Scale (`scale(sx, sy)`) | Approximated | Resized dimensions in renderer; emits `TRANSFORM_SCALE_APPROXIMATED` |
| Skew (`skewX`, `skewY`) | Approximated | Non-orthogonal axes approximated; emits `TRANSFORM_SKEW_APPROXIMATED` |
| Negative Scale / Mirror (`scaleX(-1)`) | Unsupported in Figma SceneNode | Emits `TRANSFORM_REFLECTION_UNSUPPORTED` without import crash |
| True 3D (`rotateX`, `rotateY`, `perspective`) | Unsupported | Emits `TRANSFORM_3D_UNSUPPORTED` |
| Active Animation Snapshot | Snapshot | Captures computed instantaneous state; emits `DYNAMIC_TRANSFORM_SNAPSHOT` |
| Single-text transformed elements | Supported | Collapsed directly into editable transformed `TextNode` |

## Bounds and Warnings

Defaults: at most 5,000 emitted nodes (including root), depth 60 and 20,000 visits. Warnings are bounded to at most one representative entry per code to prevent unbounded diagnostic payloads.
