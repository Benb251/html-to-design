# W2D-007 — Schema → Figma Node Renderer

Validated 2026-10-13, Asia/Saigon. Implementation, test suites, building pipeline, and verification are complete. No push was performed. Auto Layout inference, CSS Grid reconstruction, and components were intentionally not implemented and remain out of scope for V0.1.

---

## 1. Repository before work

- **Branch**: `main`
- **HEAD**: `68bff44 feat(figma-plugin): implement Figma plugin shell (W2D-006)`
- **Git status**: Clean baseline committed before starting W2D-007.
- **Inspected Sources**:
  - `docs/w2d-006-report.md`
  - `apps/figma-plugin/`
  - `packages/design-schema/` (Types: `DesignDocument`, `FrameNode`, `RectangleNode`, `TextNode`, `ImageNode`, `SvgNode`, `VisualStyle`, `TextStyle`, `AssetRecord`)
  - `packages/test-fixtures/` (7 representative fixtures)
  - `apps/extension/.smoke/` (6 real Chrome extension capture files)
  - Installed `@figma/plugin-typings` (`^1.141.0`)

---

## 2. Implemented

- Established new dedicated package `packages/figma-renderer`:
  - `src/types.ts`: `FigmaRendererHost`, `RenderResult`, `RendererWarning`, `RenderOptions`.
  - `src/warnings.ts`: `WarningCollector` tracking per-node warnings without mutating original document.
  - `src/geometry.ts`: parent-local coordinate conversion (`localX = child.x - parent.x`, `localY = child.y - parent.y`) and viewport-centered root placement.
  - `src/colors.ts`: deterministic translation from schema `Color` to Figma `RGB`, `RGBA`, and `SolidPaint`.
  - `src/styles.ts`: visual styles mapper for fills, strokes, uniform/per-corner radii, outer drop shadows, and local opacity.
  - `src/fonts.ts`: `FontManager` with per-import caching, candidate fallback stack traversal, weight/italic matching, and deterministic `FONT_FALLBACK` warning.
  - `src/images.ts`: image fill creation for data URLs, embedded base64, and remote URLs; `object-fit` mapping to Figma `scaleMode` (`cover` → `FILL`, `contain` → `FIT`); recoverable placeholder fallback on failure.
  - `src/svg.ts`: native editable SVG vector import via `createNodeFromSvg`, aspect-ratio scaling to captured bounding box, and fallback placeholder on parse failure.
  - `src/renderer.ts`: main `renderDesignDocument` orchestrator, recursive hierarchy traversal, readable layer naming, source ID traceability via `setPluginData`, selection/viewport framing, and transactional rollback on fatal errors.
  - `src/index.ts`: public exports.
- Lightweight host adapter boundary (`FigmaRendererHost`):
  - In-memory `FakeFigmaHost` for unit/integration tests without mocking global `figma`.
  - Production `createFigmaHost()` in `apps/figma-plugin/src/host.ts` delegating to Figma API.
- Integrated renderer into `apps/figma-plugin`:
  - Extended typed message protocol (`import-document`, `import-started`, `import-success`, `import-error`).
  - Added session state tracking in plugin main (`currentValidatedDoc`, `isImporting` guard preventing duplicate imports).
  - Extended plugin UI: "Import to Figma" action button, loading state, created layer count display, and renderer warning lists.
  - Updated development plugin manifest with network access permissions for user-captured image assets.
- Automated tests:
  - 57 tests in `packages/figma-renderer` covering geometry, colors, styles, fonts, images, SVG, full render flow, and all 7 representative fixtures plus real Chrome smoke captures.
  - 2 new tests in `apps/figma-plugin` covering import protocol handling and state isolation (32 total).

---

## 3. Renderer Architecture

```text
Captured Web2Design JSON
        ↓
authoritative validation (safeParseDesignDocument)
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

The renderer depends only on `@web2design/design-schema` and the minimal `FigmaRendererHost` interface. It does not consume DOM, Chrome APIs, or UI state.

---

## 4. Node Mapping

| Schema Node | Figma Target | Implementation Notes |
|---|---|---|
| `frame` | `FrameNode` | Fixed width/height, `layoutMode = "NONE"`, default white fill cleared, parent-local position, local opacity, fills, strokes, radius, shadow, child order preserved. |
| `rectangle` | `RectangleNode` | Fixed dimensions, solid fills, uniform border/stroke, uniform or per-corner radius, single outer drop shadow, local opacity. |
| `text` | `TextNode` | Editable text (`characters`), font size, line height (`PIXELS`), letter spacing (`PIXELS`), horizontal alignment (`LEFT`, `CENTER`, `RIGHT`, `JUSTIFIED`), text color fill, `textAutoResize = "NONE"` resized to captured bounding box. |
| `image` | `RectangleNode` (Image fill) | Rendered as Rectangle with `ImagePaint` fill. Source data decoded from data URL / base64 or fetched from remote URL. If image fails to load, renders placeholder fill and emits `IMAGE_LOAD_FAILED`. |
| `svg` | `FrameNode` / Vector layers | Imported natively using `figma.createNodeFromSvg(inlineSvg)`. Vector hierarchy preserved. Scaled to captured dimensions. If syntax is invalid, renders placeholder rectangle and emits `SVG_IMPORT_FAILED`. |

---

## 5. Coordinate Strategy

- **Design Schema Coordinates**: Absolute document-origin CSS pixels (`x: number`, `y: number`).
- **Figma Coordinates**: Parent-local pixels.
- **Conversion Rule**:
  ```text
  localX = child.absoluteX - parent.absoluteX
  localY = child.absoluteY - parent.absoluteY
  ```
  Computed recursively at every hierarchy level. Absolute coordinates are never naively copied to nested Figma nodes.
- **Root Placement**:
  The root frame is placed centered around the Figma viewport center (`figma.viewport.center`):
  ```text
  root.x = Math.round(viewportCenter.x - root.width / 2)
  root.y = Math.round(viewportCenter.y - root.height / 2)
  ```
  The root's internal coordinate origin `(0, 0)` directly corresponds to the document origin.

---

## 6. Styling

- **Solid Fills**: Converted via `toFigmaSolidPaint()`. Fills alpha and node opacity are kept separate.
- **Borders**: Uniform solid borders mapped to Figma strokes (`strokes = [solidPaint]`, `strokeWeight = border.width`). Non-solid border styles (dashed, dotted) render as solid and emit `BORDER_STYLE_APPROXIMATED`.
- **Corner Radius**: Numeric radii map to `node.cornerRadius`. Asymmetric per-corner radii map to `node.topLeftRadius`, `topRightRadius`, `bottomRightRadius`, `bottomLeftRadius`. Equal 4-corner objects simplify to uniform `cornerRadius`.
- **Drop Shadows**: Supported single outer shadow maps to Figma `DROP_SHADOW` effect with offset, blur, spread, and RGBA color. Inset shadows emit `BOX_SHADOW_INSET_UNSUPPORTED` and are omitted. Multiple shadows render the first shadow and emit `MULTIPLE_BOX_SHADOWS_APPROXIMATED`.
- **Opacity**: Schema `node.opacity` maps directly to Figma `node.opacity`. Ancestor opacity is not multiplied into descendants.

---

## 7. Fonts

- **Font Caching**: `FontManager` caches loaded fonts in a `Set<string>` to avoid redundant round-trips to `loadFontAsync()`.
- **Resolver**: Parses `[fontFamily, ...fontFallbacks]`, cleans quotes, matches against `host.listAvailableFontsAsync()`, and finds the closest matching style for the requested `fontWeight` and `fontStyle`.
- **Deterministic Fallback**: If no candidate family exists in Figma's available fonts, loads the default font (`Inter Regular`), applies text, and emits `FONT_FALLBACK` with the source node ID. Fonts are never downloaded from the internet.

---

## 8. Images

- **Embedded & Data URLs**: Base64 payload decoded to `Uint8Array` via `host.base64Decode()`, created via `host.createImage(bytes)`.
- **Remote URLs**: Loaded via `host.createImageAsync(url)`.
- **Object Fit**:
  - `cover` → `FILL`
  - `contain` → `FIT`
  - `fill`, `none`, `scale-down` → closest supported mode + `OBJECT_FIT_APPROXIMATED` warning.
- **Failure Resilience**: Network, CORS, or decode errors emit `IMAGE_LOAD_FAILED`, create a placeholder rectangle fill, and allow sibling nodes to continue rendering without breaking the import.

---

## 9. SVG

- **Native Vector Import**: Uses `host.createNodeFromSvg(svgMarkup)`. Internal vectors remain editable.
- **Aspect Ratio & Sizing**: Node is resized to target captured box. If natural aspect ratio differs by >5%, emits `SVG_ASPECT_APPROXIMATED`.
- **Failure Resilience**: Syntax or parser failures emit `SVG_IMPORT_FAILED` and generate a placeholder rectangle.

---

## 10. Renderer Warnings

All non-fatal fidelity gaps are collected into `RenderResult.warnings`:
- `FONT_FALLBACK`: Font family unavailable in Figma; fell back to default font.
- `IMAGE_LOAD_FAILED`: Remote or data image failed to load or decode.
- `IMAGE_ASSET_MISSING`: Node references an assetId not found in document assets.
- `OBJECT_FIT_APPROXIMATED`: CSS object-fit mode approximated.
- `SVG_IMPORT_FAILED`: SVG markup failed native import.
- `SVG_ASPECT_APPROXIMATED`: SVG natural aspect ratio differed from captured box.
- `BORDER_STYLE_APPROXIMATED`: Non-solid border rendered as solid stroke.
- `BOX_SHADOW_INSET_UNSUPPORTED`: Inset box shadow omitted.
- `MULTIPLE_BOX_SHADOWS_APPROXIMATED`: Secondary box shadows omitted.
- `CHILD_RENDER_FAILED`: Recoverable per-node error; sibling nodes continued.

---

## 11. UI & Message Changes

- Flow:
  1. User pastes JSON or loads sample.
  2. User clicks **Validate & Prepare**.
  3. UI validates via plugin main and displays document summary.
  4. UI enables **Import to Figma** button in ready banner.
  5. User clicks **Import to Figma**.
  6. Main verifies authoritative validation, sets `isImporting = true`, emits `import-started`.
  7. Renderer executes, creates root frame, populates editable nodes, sets selection and camera.
  8. Main emits `import-success` with created count and warnings.
  9. UI displays **Import Complete** card with layer counts and expandable warnings list.
- Double-click protection: Duplicate import messages while `isImporting === true` are safely rejected.

---

## 12. Network Access

Updated `apps/figma-plugin/manifest.json`:
```json
"networkAccess": {
  "allowedDomains": [
    "*"
  ],
  "reasoning": "Web2Design imports image assets referenced by user-selected website capture documents."
}
```

**Security Policy**: Network access is restricted exclusively to loading image URLs that already exist as validated asset records within the explicit user-supplied document during an active import operation. No analytics, tracking, telemetry, or third-party cloud APIs are used.

---

## 13. Tests

- **Total automated tests**: **284 passing tests across 17 test files** (up from 225):
  - `@web2design/figma-renderer`: **57 passing tests** (8 test files, new).
  - `@web2design/figma-plugin`: **32 passing tests** (up from 30).
  - `@web2design/capture-engine`: **105 passing tests**.
  - `@web2design/design-schema`: **53 passing tests**.
  - `@web2design/extension`: **21 passing tests**.
  - `@web2design/test-fixtures`: **16 passing tests**.
- **Rendered-browser CDP fidelity suite**: **45 named checks across 6 fixture pages passing**.

---

## 14. Validation Commands

| Command | Exit Code | Result |
|---|---|---|
| `npm run build` | `0` | All 4 packages and 2 apps built cleanly |
| `npm run typecheck` | `0` | Strict TypeScript verification clean across all workspaces |
| `npm run lint` | `0` | ESLint clean |
| `npm test` | `0` | 284 unit & integration tests passing |
| `npm run smoke -w @web2design/extension` | `0` | 45 fidelity checks / 6 fixture pages passing |

---

## 15. Manual Verification Classification

```text
Existing W2D regression:
PASS (225 baseline tests + 45 Chrome smoke checks remain 100% passing)

Figma renderer unit/integration:
PASS (57 tests passing in @web2design/figma-renderer)

Design Schema fixture rendering:
PASS (all 7 canonical representative fixtures render successfully via fake host)

Real Chrome capture -> renderer fake-host:
PASS (all 6 smoke captures render successfully into node trees)

Plugin build:
PASS (dist/manifest.json, dist/main.js, dist/ui.html, dist/sample-w2d-document.json generated)

Plugin manifest validation:
PASS (valid syntax, editorType: ["figma"], networkAccess allowedDomains: ["*"])

Chrome smoke regression:
PASS (45 checks across 6 fixture pages passing)

Interactive Figma import:
NOT AVAILABLE (headless CLI environment)
Manual test procedure ready:
  1. Open Figma -> Plugins -> Development -> Import plugin from manifest...
  2. Select apps/figma-plugin/dist/manifest.json
  3. Open Web2Design plugin
  4. Paste JSON or click "Load Sample"
  5. Click "Validate & Prepare"
  6. Click "Import to Figma"
  7. Verify created root frame on canvas and editable nodes

Editable text manual verification:
NOT TESTED (headless environment; covered by fake-host TextNode assertions)

Image manual verification:
NOT TESTED (headless environment; covered by fake-host ImagePaint assertions)

SVG manual verification:
NOT TESTED (headless environment; covered by fake-host FrameNode assertions)
```

---

## 16. Schema Changes

```text
Schema changes: None
```

Design Schema version remains `"0.1"`.

---

## 17. Capture Changes

```text
Capture changes: None
```

No changes were made to `@web2design/capture-engine`.

---

## 18. Known Limitations

- Auto Layout inference is deferred (V0.1 is absolute positioning).
- CSS Grid, Flexbox flow, and constraints are deferred.
- Inset box shadows and multiple shadows beyond the first are approximated.
- Non-solid border styles (dashed/dotted) are approximated as solid strokes.
- CSS `background-image` is not yet captured or rendered.
- Fonts not available in the user's Figma editor fall back to `Inter Regular`.
- Failed remote image fetches degrade gracefully to placeholder rectangles.

---

## 19. Files Changed / Created

- `packages/figma-renderer/` (new package):
  - `package.json`, `tsconfig.json`, `tsconfig.build.json`
  - `src/types.ts`: renderer interfaces and host abstraction
  - `src/warnings.ts`: renderer warning collector
  - `src/geometry.ts`: coordinate conversion and root placement
  - `src/colors.ts`: color translation
  - `src/styles.ts`: visual styles application
  - `src/fonts.ts`: font manager and resolver
  - `src/images.ts`: image fill creation and scale mode
  - `src/svg.ts`: SVG native import and scaling
  - `src/renderer.ts`: main `renderDesignDocument` orchestrator
  - `src/index.ts`: public exports
  - `test/helpers/fake-figma-host.ts`: fake Figma host test adapter
  - `test/*.test.ts`: 8 test files covering all renderer capabilities
  - `README.md`: package documentation
- `apps/figma-plugin/`:
  - `package.json`: added `@web2design/figma-renderer` dependency
  - `manifest.json`: added networkAccess for image importing
  - `src/host.ts` (new): production Figma host adapter
  - `src/main.ts`: added import handling and session state
  - `src/messages.ts`: added import message types
  - `src/ui.ts`: added Import button and result card controllers
  - `public/ui.html`: added Import button and result section markup
  - `public/ui.css`: added import button and result section styles
  - `test/messages.test.ts`: added import flow tests
  - `README.md`: updated documentation
- `package.json`: added figma-renderer to workspace build/typecheck/test scripts
- `README.md`: updated workspace description and current scope
- `docs/w2d-007-report.md` (new): this report

---

## 20. Recommended Next Step

The codebase is ready for:

**W2D-008 — Fixture + Renderer Regression / Fidelity Suite**

No corrective W2D-007 work is required. The renderer converts validated Design Schema V0.1 documents into editable Figma node hierarchies with parent-local coordinate conversion, visual styling, font management, image fills, and native SVG vectors.
