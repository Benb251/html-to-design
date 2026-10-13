# Capture Engine — W2D-012

Browser-only capture implementation emitting Design Schema V0.2 documents.

Public API: `captureDocument(document, options?)`, `documentRect`, `captureId`, `renderDecision`, normalization helpers, `splitBackgroundLayers`, `parseLinearGradient`, `parseRadialGradient`, `parseBackgroundGradientLayers`, `createAssetRegistry`, `serializeAndSanitizeSvg`, `serializeCapture`, `countNodes`, `captureFilename`. The document must have a rendered `defaultView` and `body`. `captureDocument` returns the **normalized result of parseDesignDocument** under wire version `"0.2"`.

## Supported

- Light-DOM traversal of currently rendered normal-flow content.
- Synthetic pseudo-element capture (`::before` / `::after`) into deterministic standard `text`, `rectangle`, or `frame` nodes with visual styles.
- First-class CSS gradient fill capture (`linear-gradient` and `radial-gradient`) on both real DOM nodes and synthetic pseudo-elements.
- Ordered fill stack preserving top gradient layers over underlying solid background colors.
- Standard HTML `<img>` elements captured as `type: "image"` nodes referencing validated `AssetRecord` entries in `document.assets`.
- Inline `<svg>` elements captured as `type: "svg"` nodes with sanitized markup in `inlineSvg` and an associated asset entry.
- Meaningful container frames: semantic groups, visual boxes, multi-child divs and local-opacity groups.
- Editable text from individual DOM text nodes and generated pseudo text using parent/pseudo computed typography.
- CSS-pixel absolute document-origin coordinates from bounding rectangles plus captured scroll offsets.
- Solid backgrounds, uniform borders, circular pixel radii, and single outer box shadows.

## Gradient Support Matrix (W2D-012)

| Gradient Scenario | Status | Behavior |
| --- | --- | --- |
| `linear-gradient` default direction | Supported | Normalized to `180deg` (to bottom) with normalized color stops |
| Cardinal keyword directions (`to right`, etc.) | Supported | Normalized to canonical angles: top: 0°, right: 90°, bottom: 180°, left: 270° |
| Diagonal keyword directions (`to bottom right`) | Supported | Normalized using box dimensions and corner aspect-ratio angles |
| Explicit CSS angles (`45deg`, `-45deg`, `rad`, `turn`) | Supported | Normalized to canonical range `[0, 360)` |
| Multi-stop gradients (3+ stops) | Supported | Normalized stop positions in `[0, 1]` |
| Implicit/omitted stop positions | Supported | Deterministic interpolation (first stop defaults to 0, last to 1, middle evenly spaced) |
| Alpha gradient stops | Supported | Preserves stop `color.a` independently of node opacity |
| Hard stops (duplicate positions) | Supported | Preserved without deduplication for crisp transitions |
| Multi-position stops (`10% 30%`) | Supported | Decomposed into two distinct stops of identical color |
| Radial baseline (`radial-gradient(red, blue)`) | Supported | Centered (0.5, 0.5) with farthest-corner radii |
| Radial circle / ellipse | Supported | Evaluated against box dimensions |
| Radial positioned center (`at 25% 75%`, etc.) | Supported | Normalized center coordinates in `[0, 1]` |
| Gradient over solid background | Supported | Emitted as ordered fills: `[LinearGradientFill, SolidFill]` |
| Pseudo-element gradient (`::before { background: linear-gradient(...) }`) | Supported | Captured natively on synthetic pseudo node |
| Color hints (`red 10%, 30%, blue 90%`) | Approximated / warning | Stop position interpolated; emits `GRADIENT_COLOR_HINT_APPROXIMATED` |
| Modern interpolation (`in srgb`, `in oklab`) | Approximated / warning | Color stops preserved; emits `GRADIENT_INTERPOLATION_APPROXIMATED` |
| `background-clip: text` | Deferred / warning | Gradient fill omitted; emits `GRADIENT_TEXT_UNSUPPORTED` |
| Repeating gradients (`repeating-linear-gradient`) | Deferred / warning | Omitted; emits `GRADIENT_TYPE_UNSUPPORTED` |
| Conic gradients (`conic-gradient`) | Deferred / warning | Omitted; emits `GRADIENT_TYPE_UNSUPPORTED` |
| Remote CSS `background-image: url(...)` | Deferred / warning | Omitted; emits `BACKGROUND_IMAGE_UNSUPPORTED` |

## Bounds and Warnings

Defaults: at most 5,000 emitted nodes (including root), depth 60 and 20,000 visits. Warnings are bounded to at most one representative entry per code to prevent unbounded diagnostic payloads.
