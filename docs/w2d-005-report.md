# W2D-005 — Image + SVG Asset Capture

Validated 2026-10-13, Asia/Saigon. Implementation and required automated validation are complete. No commit or push was performed. Figma plugin and Figma rendering were not implemented.

## Repository before work

- Branch: `main`.
- HEAD: unavailable. The repository has no commits (unborn HEAD).
- Git status: `?? .gitignore`, `?? README.md`, `?? apps/`, `?? docs/`, `?? eslint.config.mjs`, `?? package-lock.json`, `?? package.json`, `?? packages/`, `?? tsconfig.base.json`.
- Inspected `docs/w2d-004-report.md`, `packages/design-schema`, `packages/capture-engine`, existing asset model, image/SVG placeholder behavior, extension build and smoke infrastructure before editing.
- Preserved existing architecture. No schema changes made; wire version remains `"0.1"`.

## Implemented

- Proper capture of standard HTML `<img>` elements into schema-valid `type: "image"` nodes referencing validated entries in `document.assets`.
- Proper capture of inline `<svg>` elements into schema-valid `type: "svg"` nodes containing self-contained, sanitized serialized markup in `inlineSvg` and registered SVG asset entries.
- Absolute and relative URL resolution: relative, root-relative and document-relative URLs are deterministically resolved against the document's base URL.
- Responsive image resolution: runtime selected image source from `img.currentSrc` is prioritized over static attributes.
- Local data URL capture: `data:image/...` payloads are preserved with parsed MIME types and intrinsic dimensions.
- Blob URL handling: attempt synchronous canvas materialization to portable data URLs; if inaccessible, emit `BLOB_ASSET_UNAVAILABLE` warning with rectangle placeholder box.
- Broken and unloaded image handling: broken or zero-size images emit `IMAGE_UNAVAILABLE` warning and produce rectangle geometry placeholders without generating fake assets.
- SVG computed style inlining: inlines computed visual styles (`fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-opacity`, `fill-opacity`, `opacity`) into SVG shape elements to preserve visual fidelity across CSS class styles and inherited properties.
- SVG `<defs>` and local reference preservation: local linear/radial gradients, clip paths and symbols remain intact; local `#id` URLs are preserved.
- SVG security sanitization: removes dangerous `<script>` elements, inline event handler attributes (`onclick`, `onload`, etc.) and `javascript:` URLs; emits `SVG_SANITIZED` warning.
- External SVG reference detection: detects non-local `<use>` and `<image>` references; emits `SVG_EXTERNAL_REFERENCE` warning.
- Asset deduplication: deduplicates multiple occurrences of identical image URLs, identical data URLs, and identical serialized SVGs to shared asset IDs.
- Unsupported media warnings: explicit warnings for `<canvas>` (`CANVAS_UNSUPPORTED`), `<video>`/`<audio>` (`MEDIA_UNSUPPORTED`), and `<iframe>` (`IFRAME_UNSUPPORTED`).
- Extension popup update: displays asset count (`Nodes: X · Assets: Y · Warnings: Z`).
- Focused fidelity test fixture `fidelity-assets.html` and 1x1 test PNG `dot.png` covering all 10 target scenarios.
- Expanded headless Chrome fidelity suite: 45 named checks across 6 pages.

## Asset architecture

```text
DOM <img> / <svg>
   ↓
capture-engine visitor (capture.ts & assets.ts)
   ↓
AssetRegistry (deduplication by URL / data payload / serialized SVG)
   ↓
DesignNode (ImageNode.assetId / SvgNode.assetId + SvgNode.inlineSvg)
   ↓
document.assets (AssetRecord[])
   ↓
Design Schema V0.1 document validation
```

The capture document survives JSON serialization and contains no DOM references or session-bound browser objects.

## Images

- **Supported**:
  - `<img>` with absolute HTTP/HTTPS URLs.
  - `<img>` with relative and root-relative URLs (resolved against document base URI).
  - `<img>` with `data:` URLs (payload validated, MIME type parsed).
  - Responsive `<img>` using `srcset` or `<picture>` (actual browser-selected `currentSrc` captured).
  - Object-fit metadata (`fit: "cover" | "contain" | "fill" | "none" | "scale-down"`).
  - Intrinsic dimensions (`width` and `height` from `naturalWidth`/`naturalHeight`).
  - Rendered CSS border-box geometry, opacity, and visual styles (borders, radius, shadow).
  - Identical image URLs and identical data URLs deduplicated to single asset records.
- **Unsupported / warned**:
  - Broken or unloaded images (`naturalWidth === 0` or missing/unresolved URL): emitted as `type: "rectangle"` with `IMAGE_UNAVAILABLE` warning; no fake asset emitted.
  - Inaccessible session `blob:` URLs: emit `BLOB_ASSET_UNAVAILABLE` warning.
  - CSS `object-position`: emits `OBJECT_POSITION_APPROXIMATED` warning if non-default.
  - CSS `background-image`: remains deferred (`BACKGROUND_IMAGE_UNSUPPORTED` warning).

## SVG

- **Supported**:
  - Inline `<svg>` captured as a single `SvgNode` with rendered document-origin geometry.
  - Serialized SVG markup stored in `node.inlineSvg` and as a registered SVG asset in `document.assets`.
  - Inlined computed visual properties for shapes (`fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-opacity`, `fill-opacity`, `opacity`).
  - Local `<defs>` with gradients, patterns, and clipPaths (`url(#id)` preserved).
  - Local `<use href="#symbol">` references.
  - Intrinsic dimensions parsed from `viewBox` or SVG `width`/`height` attributes.
  - Identical inline SVGs deduplicated to single SVG asset records.
- **Unsupported / warned**:
  - External `<use href="external.svg#icon">` and external `<image href="http://...">`: detected and warned with `SVG_EXTERNAL_REFERENCE`.
  - Embedded scripts and event handlers: removed and warned with `SVG_SANITIZED`.

## Deduplication

A capture-scoped `AssetRegistry` tracks assets using deterministic composite keys:
- Image URLs: `url:<resolved_absolute_url>`
- Data URLs: `data:<data_url_payload>`
- Inline SVGs: `svg:<serialized_svg_markup>`

When an identical key is encountered within the same capture session:
1. The existing asset ID (`asset-image-N` or `asset-svg-N`) is returned.
2. No duplicate entry is added to `document.assets`.
3. The node points to the shared asset ID.

## Security / sanitization

Untrusted page SVG markup is sanitized prior to serialization:
- All `<script>` elements are stripped.
- All event-handler attributes matching `/^on/i` (`onclick`, `onload`, `onerror`, etc.) are stripped.
- All `href` / `xlink:href` attributes starting with `javascript:` or `data:text/html` are stripped.
- When any script or event handler is removed, an explicit `SVG_SANITIZED` warning is emitted.
- Root element HTML `id` attribute is removed from SVG clones to prevent DOM ID collision and ensure cross-usage deduplication.

## Fixtures

Fixture coverage in `apps/extension/fixtures`:
1. `landing.html`: Original landing page smoke fixture.
2. `fidelity-geometry.html`: Content-box/border-box, nested boxes, fractional boxes, negative/offscreen geometry, scroll stability.
3. `fidelity-text.html`: Text ranges, padding exclusion, multiline union, whitespace modes, typography.
4. `fidelity-styles.html`: Background fills, canvas propagation, uniform borders, circular radii, single shadow, nested opacity, sRGB.
5. `fidelity-limits.html`: Unsupported limits, wrapper pruning, hidden subtrees.
6. `fidelity-assets.html`:
   - PNG image with `object-fit: cover`.
   - Relative image URL (`./dot.png`).
   - Duplicate image URL (`/dot.png`).
   - Data URL image.
   - `srcset` image (`/dot.png 1x, /dot.png 2x`).
   - Inline SVG with path/circle shapes.
   - Inline SVG styled through external CSS class.
   - SVG using `<defs>` and local `<linearGradient>`.
   - Broken image returning 404 (`/nonexistent-image-404.png`).
   - Unsupported `<canvas>` and `<video>` elements.

## Tests

- Automated test suite: **195 tests passing across 8 files** (up from 182):
  - `@web2design/extension`: 21 passing tests.
  - `@web2design/capture-engine`: 105 passing tests (40 capture + 52 fidelity + 13 asset capture).
  - `@web2design/design-schema`: 53 passing tests.
  - `@web2design/test-fixtures`: 16 passing tests.
- Rendered-browser CDP fidelity suite: **45 named checks across 6 fixture pages** (up from 34 checks across 5 pages).

## Validation

| Command | Result |
| --- | --- |
| `npm run build` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0 |
| `npm test` | PASS, exit 0 (195 unit tests) |
| `npm run smoke -w @web2design/extension` | PASS, exit 0 (45 fidelity checks / 6 fixture pages) |

## Manual verification

```text
Automated unit/integration tests:
PASS (195 tests)

W2D-004 fidelity regression:
PASS (34 previous fidelity checks remain 100% passing)

W2D-005 rendered asset validation:
PASS (11 new asset fidelity checks, 45 total)

Manifest V3:
PASS (dist build verified with valid MV3 manifest and scripts)

Interactive final extension reload:
NOT AVAILABLE (headless environment)

Real clipboard:
NOT RETESTED (verified in W2D-003 sanity; headless tests stub clipboard)

Real downloaded JSON file:
NOT TESTED (headless environment does not provide physical Save As user completion)
```

## Schema changes

```text
Schema changes: None
```

Design Schema version remains `"0.1"`. The existing `AssetRecordSchema`, `ImageNodeSchema`, and `SvgNodeSchema` fully support all W2D-005 requirements without modification.

## Manifest permission changes

```text
Manifest permission changes: None
```

Permissions remain: `"activeTab"`, `"scripting"`, `"clipboardWrite"`. No host permissions or broad origins were added.

## Known limitations

- Bitmap bytes of remote image URLs are referenced by resolved URL rather than embedded base64 (by architectural design for V0.1).
- Session `blob:` URLs that fail canvas read are warned rather than fetched via remote hacks.
- CSS `background-image` is not yet captured into image assets (deferred).
- `<canvas>` rasterization is not yet implemented (deferred).
- `<video>`, `<audio>`, and `<iframe>` media extraction are not implemented (deferred).
- External SVG `<use>` symbol references pointing to third-party SVG files emit warnings rather than deep-fetching remote resources.

## Files changed

- `packages/capture-engine/src/assets.ts` (new): asset registry, MIME detection, blob materialization, and SVG serialization/sanitization.
- `packages/capture-engine/src/capture.ts`: integration of image and SVG capture, unsupported media handling, asset table output.
- `packages/capture-engine/src/index.ts`: export asset helpers.
- `packages/capture-engine/test/assets.test.ts` (new): 13 unit tests for image and SVG asset capture.
- `packages/capture-engine/test/capture.test.ts`: updated placeholder test for canvas/media/iframe.
- `apps/extension/src/popup.ts`: added asset count to popup details.
- `apps/extension/fixtures/dot.png` (new): 1x1 PNG fixture for local testing.
- `apps/extension/fixtures/fidelity-assets.html` (new): comprehensive fixture covering all 10 asset scenarios.
- `apps/extension/fixtures/README.md`: documented fidelity-assets fixture.
- `apps/extension/scripts/serve-fixture.mjs`: added fidelity-assets and dot.png serving.
- `apps/extension/scripts/smoke.mjs`: added fidelity-assets fixture and 11 assertions (45 total checks).
- `apps/extension/README.md`, `packages/capture-engine/README.md`, `README.md`: updated documentation.
- `docs/w2d-005-report.md` (new): this report.

## Recommended next step

The codebase is ready for:

**W2D-006 — Figma Plugin shell**

No corrective W2D-005 asset work is required. The media portion of M1 Capture is complete and validated against Design Schema V0.1.
