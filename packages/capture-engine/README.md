# Capture Engine — W2D-005

Browser-only capture implementation; Design Schema remains browser-independent and unchanged.

Public API: `captureDocument(document, options?)`, `documentRect`, `captureId`, `renderDecision`, normalization helpers, `createAssetRegistry`, `serializeAndSanitizeSvg`, `serializeCapture`, `countNodes`, `captureFilename`. The document must have a rendered `defaultView` and `body`. `captureDocument` returns the **normalized result of parseDesignDocument**. `serializeCapture` validates again before producing pretty JSON.

## Supported

- Light-DOM traversal of currently rendered normal-flow content, including offscreen elements with positive rendered geometry.
- Standard HTML `<img>` elements captured as `type: "image"` nodes referencing validated `AssetRecord` entries in `document.assets`.
- Inline `<svg>` elements captured as `type: "svg"` nodes with deterministic, sanitized serialized markup in `inlineSvg` and an associated asset entry in `document.assets`.
- Meaningful container frames: semantic groups, visual boxes, multi-child divs and local-opacity groups. Plain inline/text wrappers are flattened.
- Editable text from individual DOM text nodes using Range geometry and the parent element's computed typography.
- CSS-pixel absolute document-origin coordinates from bounding rectangles plus captured scroll offsets.
- Solid backgrounds, uniform borders, circular pixel radii, and single outer box shadows.
- Group opacity applied once, not copied multiplicatively into descendants.
- Safe omission of live form values, including password/textarea/select content.

## Asset Support Matrix

| Asset Scenario | Status | Behavior |
| --- | --- | --- |
| `<img>` absolute URL | Supported | Captured as `ImageNode`, references `AssetRecord` with `type: "url"`, resolved source, intrinsic dimensions and MIME type |
| `<img>` relative / root-relative URL | Supported | Resolved deterministically against document base URI |
| `<img>` data URL | Supported | Preserved as `type: "data-url"`, MIME type parsed from header |
| `<img>` srcset / `<picture>` | Supported | Captures runtime selected resource via `currentSrc` |
| `blob:` image | Best effort / warning | Materialized to data URL via canvas if readable; emits `BLOB_ASSET_UNAVAILABLE` and placeholder if unreadable |
| Broken / unloaded image | Warning | Omitted from asset table; captured as rectangle box with `IMAGE_UNAVAILABLE` warning |
| Inline `<svg>` | Supported | Captured as `SvgNode` with self-contained `inlineSvg` and registered SVG asset |
| CSS-styled inline SVG | Supported | Inlines computed shape styles (`fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `opacity`) |
| SVG local `<defs>` | Supported | Preserves local definitions and local `#id` gradient/pattern/clip references |
| SVG external references | Warning | Detects external `<use>` or `<image>` URLs; emits `SVG_EXTERNAL_REFERENCE` warning |
| SVG script / event sanitization | Supported | Strips `<script>` tags, inline `on*` handlers and `javascript:` URLs; emits `SVG_SANITIZED` warning |
| Asset deduplication | Supported | Deduplicates identical image URLs, identical data URLs, and identical serialized SVGs |
| CSS `background-image` | Deferred | Omitted with `BACKGROUND_IMAGE_UNSUPPORTED` warning |
| `<canvas>` | Deferred | Omitted with `CANVAS_UNSUPPORTED` warning; empty box placeholder captured |
| `<video>` / `<audio>` | Deferred | Omitted with `MEDIA_UNSUPPORTED` warning; empty box placeholder captured |
| `<iframe>` | Deferred | Omitted with `IFRAME_UNSUPPORTED` warning; empty box placeholder captured |

## Bounds and Warnings

Defaults: at most 5,000 emitted nodes (including root), depth 60 and 20,000 visits. Options may select up to 10,000 nodes/depth 80. Reaching a bound returns validated **partial output with warnings**, never claims a complete page.

Warnings are deterministic and deduplicated by code, with a feature identifier and the first affected emitted node where possible. References to pruned/skipped nodes are removed before schema validation.
