# Capture Engine — W2D-014

Browser-only capture implementation emitting Design Schema V0.4 documents.

Public API: `captureDocument(document, options?)`, `documentRect`, `captureId`, `renderDecision`, normalization helpers, `splitBackgroundLayers`, `parseLinearGradient`, `parseRadialGradient`, `parseBackgroundGradientLayers`, `parseBoxShadows`, `createAssetRegistry`, `serializeAndSanitizeSvg`, `serializeCapture`, `countNodes`, `captureFilename`. The document must have a rendered `defaultView` and `body`. `captureDocument` returns the **normalized result of parseDesignDocument** under wire version `"0.4"`.

## Supported

- Light-DOM traversal of currently rendered normal-flow content.
- Container clipping semantics (`overflow: hidden` and `overflow: clip`) captured non-destructively on `FrameNode.clip` with per-axis fidelity (`clip: { x: boolean, y: boolean }`).
- Clipping containers with rendered descendants or pseudo-elements survive wrapper pruning even without background or border styles.
- Non-destructive descendant geometry: fully and partially clipped descendants retain their true uncropped positions and dimensions.
- Synthetic pseudo-element capture (`::before` / `::after`) into deterministic standard `text`, `rectangle`, or `frame` nodes with visual styles and clipping inheritance.
- First-class CSS gradient fill capture (`linear-gradient` and `radial-gradient`) on both real DOM nodes and synthetic pseudo-elements.
- Per-side borders: independent top, right, bottom, left width/style/color from computed styles.
- Ordered multiple box shadows and inset shadows (`inset: boolean`).
- Ordered fill stack preserving top gradient layers over underlying solid background colors.
- Standard HTML `<img>` elements captured as `type: "image"` nodes referencing validated `AssetRecord` entries in `document.assets`.
- Inline `<svg>` elements captured as `type: "svg"` nodes with sanitized markup in `inlineSvg` and an associated asset entry.
- Meaningful container frames: semantic groups, visual boxes, clipping wrappers, multi-child divs and local-opacity groups.
- Editable text from individual DOM text nodes and generated pseudo text using parent/pseudo computed typography.

## Container Clipping Support Matrix (W2D-014)

| Scenario | Status | Behavior |
| --- | --- | --- |
| `overflow: hidden` (both axes) | Supported (Exact) | Emitted as `clip: { x: true, y: true }` on container frame |
| `overflow: clip` (both axes) | Supported (Exact) | Emitted as `clip: { x: true, y: true }` on container frame |
| `overflow: visible` | Supported | No clip property attached (`clip: undefined`) |
| Partial child overflow | Supported | Full child geometry preserved; clipping handled natively |
| Fully clipped child | Supported | Child preserved in schema; visibility controlled by container clip |
| Negative child coordinates | Supported | Unclamped negative x/y retained in schema |
| Nested clipping containers | Supported | Independent `clip` behaviors preserved on each frame |
| Rounded clipping (`border-radius` + `overflow: hidden`) | Supported | Corner radius and clipping preserved without vector masks |
| Single-axis clipping (`overflow-x: hidden; overflow-y: visible`) | Supported in schema | Preserved as `{ x: true, y: false }`; renderer approximates with warning |
| Scroll containers (`overflow: auto`, `overflow: scroll`) | Deferred | Visual bounds preserved; emits `SCROLL_CONTAINER_CLIPPING_DEFERRED` |
| Non-default `overflow-clip-margin` | Deferred | Standard container bounds used; emits `OVERFLOW_CLIP_MARGIN_UNSUPPORTED` |
| CSS `clip-path` | Unsupported | Shape clipping omitted; emits `CLIP_PATH_UNSUPPORTED` |

## Bounds and Warnings

Defaults: at most 5,000 emitted nodes (including root), depth 60 and 20,000 visits. Warnings are bounded to at most one representative entry per code to prevent unbounded diagnostic payloads.
