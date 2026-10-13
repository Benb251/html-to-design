# W2D-008 — Fixture + Renderer Regression / Fidelity Suite

Validated 2026-10-13, Asia/Saigon. Implementation, test suites, golden baselines, and developer commands are complete. No push was performed. Design Schema remains strictly `"0.1"`. Auto Layout inference, CSS Grid reconstruction, and components were intentionally not implemented and remain out of scope for V0.1.

---

## 1. Repository before work

- **Branch**: `main`
- **HEAD**: `a15c8a5 feat(figma-renderer): implement Schema -> Figma node renderer (W2D-007)`
- **Git status**: Clean working tree.
- **Inspected Sources**:
  - `docs/w2d-007-report.md`
  - `apps/extension/fixtures/` (6 HTML fixtures)
  - `apps/extension/.smoke/` (6 Chrome smoke capture JSON outputs)
  - `packages/test-fixtures/` (7 canonical Design Schema fixtures)
  - `packages/capture-engine/`
  - `packages/figma-renderer/`
  - `apps/figma-plugin/`
- **Initial Baseline**:
  - 284 automated tests passing across 6 workspaces.
  - 45 Chrome rendered fidelity checks across 6 fixture pages passing.

---

## 2. Verification Classification

| Verification Area | Result | Notes |
|---|---|---|
| Existing 284-test regression | **PASS** | All pre-existing 284 unit and integration tests remain 100% green without regressions. |
| Chrome capture smoke | **PASS** | 45 rendered checks across 6 fixture pages pass (`npm run smoke -w @web2design/extension`). |
| Canonical schema fixture fidelity | **PASS** | All 7 representative schema fixtures pass geometric, style, hierarchy, and golden checks. |
| Real Chrome capture → renderer fidelity | **PASS** | All 6 real browser captures render faithfully through FakeFigmaHost with 0 unexpected warnings. |
| Hierarchy fidelity | **PASS** | Parent-child relationships, child order, node counts, and 0 duplicate/missing IDs verified. |
| Geometry fidelity | **PASS** | Reconstructed document-origin global coordinates (`absoluteX/Y`) and dimensions match schema within 0.1 px. |
| Style fidelity | **PASS** | Solid fills, alpha channels, border width/color, corner radii, and drop shadows match within explicit tolerances. |
| Text fidelity | **PASS** | Characters, fontSize, lineHeight, letterSpacing, alignment, textColor, and local opacity verified. |
| Image fidelity | **PASS** | Rectangle target geometry, ImagePaint fills, `cover` (FILL) and `contain` (FIT) scale modes verified. |
| SVG fidelity | **PASS** | Native vector container generation, target bounding geometry, and traceable sourceId verified. |
| Warning baseline | **PASS** | Exactly 8 expected warnings across all fixtures (3 approximated borders, 4 approximated object-fit, 1 font fallback); 0 unexpected warnings. |
| Fidelity determinism run #1 | **PASS** | 13 fixtures evaluated, 141 nodes compared, 564 geometry checks, 0 failures. |
| Fidelity determinism run #2 | **PASS** | Exactly identical output, 0 differences, 0 failures. |
| Plugin build / manifest regression | **PASS** | `apps/figma-plugin/dist/*` built, `allowedDomains: ["*"]` locked, transactional rollback on fatal errors verified. |
| Interactive Figma fidelity sanity | **NOT AVAILABLE** | Headless CLI environment without active Figma desktop GUI; full visual E2E scheduled for W2D-009. |

---

## 3. Architecture

W2D-008 establishes a deterministic regression pipeline:

```text
controlled HTML fixture
        ↓
Chrome rendered capture (apps/extension/.smoke/*.json)
        ↓
Design Schema V0.1
        ↓
Figma renderer (renderDesignDocument)
        ↓
FakeFigmaHost (pure in-memory SceneNode tree)
        ↓
Normalized Scene (NormalizedRenderedNode)
        ↓
Fidelity Comparator (compareGeometry, compareStyle, compareText, ...)
        ↓
Fidelity Report (dist/fidelity-report.json) & Golden Baselines
```

The system traces every supported design node to its rendered Figma SceneNode using `web2design:id` and `web2design:type` plugin metadata, ensuring complete source traceability across deep hierarchies.

---

## 4. Fixture Matrix

The central manifest (`packages/figma-renderer/src/fidelity/manifest.ts`) indexes all 13 regression fixtures:

| Fixture ID | Kind | Source / File | Protected Categories | Expected Warnings |
|---|---|---|---|---|
| `canonical-simple-text` | schema-fixture | `simpleTextFixture` | GEOMETRY, HIERARCHY, TEXT, FILL | None |
| `canonical-styled-rectangle` | schema-fixture | `styledRectangleFixture` | GEOMETRY, HIERARCHY, FILL, BORDER, RADIUS | None |
| `canonical-text-card` | schema-fixture | `textCardFixture` | GEOMETRY, HIERARCHY, TEXT, FILL, RADIUS | None |
| `canonical-image` | schema-fixture | `imageFixture` | GEOMETRY, HIERARCHY, IMAGE, ASSET | None |
| `canonical-inline-svg` | schema-fixture | `inlineSvgFixture` | GEOMETRY, HIERARCHY, SVG | None |
| `canonical-shadow` | schema-fixture | `shadowFixture` | GEOMETRY, HIERARCHY, FILL, RADIUS, SHADOW | None |
| `canonical-nested-frames` | schema-fixture | `nestedFramesFixture` | GEOMETRY, HIERARCHY, TEXT | None |
| `chrome-landing` | chrome-capture | `capture.json` | GEOMETRY, HIERARCHY, TEXT, FILL, BORDER, RADIUS, SHADOW | None |
| `chrome-geometry` | chrome-capture | `fidelity-geometry.json` | GEOMETRY, HIERARCHY | None |
| `chrome-text` | chrome-capture | `fidelity-text.json` | GEOMETRY, HIERARCHY, TEXT | None |
| `chrome-styles` | chrome-capture | `fidelity-styles.json` | GEOMETRY, HIERARCHY, FILL, BORDER, RADIUS, SHADOW | 3x `BORDER_STYLE_APPROXIMATED` |
| `chrome-assets` | chrome-capture | `fidelity-assets.json` | GEOMETRY, HIERARCHY, IMAGE, SVG, ASSET | 1x `FONT_FALLBACK`, 4x `OBJECT_FIT_APPROXIMATED` |
| `chrome-limits` | chrome-capture | `fidelity-limits.json` | GEOMETRY, HIERARCHY | None (capture warnings in doc) |

---

## 5. Normalized Scene Format

`NormalizedRenderedNode` provides a compact, human-readable snapshot of the rendered Figma scene without internal mock implementation noise:

```ts
interface NormalizedRenderedNode {
  sourceId?: string;
  sourceType?: string;
  sourceTag?: string;
  figmaType: string;
  name: string;

  // Local geometry (relative to immediate parent)
  x: number;
  y: number;
  width: number;
  height: number;

  // Reconstructed absolute geometry (document origin)
  absoluteX: number;
  absoluteY: number;

  opacity: number;

  fills?: NormalizedFill[];
  strokes?: NormalizedStroke[];
  radius?: NormalizedRadius;
  effects?: NormalizedShadow[];
  text?: NormalizedText;
  image?: NormalizedImage;
  svg?: NormalizedSvg;
  children?: NormalizedRenderedNode[];
}
```

### What is Kept
- Reconstructed global coordinates (`absoluteX`, `absoluteY`) and parent-local offsets (`x`, `y`).
- Bounding geometry (`width`, `height`).
- Local opacity.
- Color channels (`r`, `g`, `b`, `a`).
- Stroke width and styles.
- Uniform or per-corner radius values.
- Drop shadow offset, blur, spread, and color.
- Text characters, resolved font family/style, fontSize, lineHeight, letterSpacing, alignment.
- Image fill scaleMode (`FILL` / `FIT`).
- SVG vector container flag.
- Source traceability IDs (`web2design:id`, `web2design:type`).

### What is Intentionally Ignored / Normalized Out
- Capture timestamps (`capturedAt`), browser runtime metadata, and ephemeral machine file paths.
- Ephemeral test server ports in remote URLs (normalized to pathname hashes to prevent non-deterministic hashes).
- Figma mock internal data structures (listener maps, selection arrays, canvas viewport positions).
- SVG-internal vector child paths (treated as unified vector units per Section 24).

---

## 6. Tolerances & Numeric Standards

| Property | Tolerance | Rationale |
|---|---|---|
| Geometry (`x`, `y`, `width`, `height`) | **0.1 px** | Accommodates subpixel rounding between CSS float calculations and Figma coordinates while strictly catching 1px layout regressions. |
| Color (`r`, `g`, `b`) | **0.01** | Catches color shifts while allowing float-to-byte precision roundtrips (1/255 ≈ 0.0039). |
| Opacity / Alpha (`a`) | **0.01** | Validates exact opacity layers and prevents nested opacity compounding. |
| Corner Radius | **0.1 px** | Verifies uniform and individual corner radii without false positive float jitter. |
| Drop Shadow (offsets, blur, spread) | **0.1 px** | Verifies outer drop shadow parameters. |

---

## 7. Actionable Failure Reporting

When a fidelity assertion fails, comparator functions generate structured, actionable error diagnostics classified by taxonomy category:

```text
❌ FIDELITY REGRESSION DETECTED:

[GEOMETRY] Fixture: chrome-geometry
  node:      w2d-element-body (frame)
  property:  width
  expected:  784
  actual:    780
  diff:      -4.000
  tolerance: 0.1
  message:   node: w2d-element-body property: width expected: 784 actual: 780 diff: -4.000 tol: 0.1
```

Developers receive immediate clarity on the offending fixture, node, property, numeric delta, and tolerance threshold without inspecting raw JSON dumps.

---

## 8. Coverage & Statistics

From the deterministic CI report (`packages/figma-renderer/dist/fidelity-report.json`):

- **Fixtures Evaluated**: 13 (7 canonical schema + 6 real Chrome captures)
- **Nodes Compared**: 141
- **Geometry Checks**: 564
- **Style Checks**: 174
- **Text Checks**: 33
- **Asset Checks**: 10
- **Expected Warnings**: 8
- **Unexpected Warnings**: 0
- **Fidelity Failures**: 0

---

## 9. Golden Baselines & Update Discipline

Golden snapshots are stored in `packages/figma-renderer/golden/<id>.golden.json`.
- Regular test runs (`npm test`, `npm run fidelity`) verify strictly against golden baselines and **never** mutate them.
- Updating golden baselines requires the explicit developer command:
  ```bash
  npm run fidelity:update
  ```
- All baseline updates are committed explicitly in Git diffs for clear code review.

---

## 10. Test Suite Expansion

| Workspace | Baseline (W2D-007) | Current (W2D-008) | Delta | New Coverage |
|---|---|---|---|---|
| `apps/extension` | 21 | 21 | 0 | Rendered Chrome smoke & popup orchestration |
| `apps/figma-plugin` | 32 | 38 | +6 | Plugin lifecycle, error handling, in-flight guard, fatal cleanup rollback, build artifacts, network permissions lock |
| `packages/capture-engine` | 105 | 105 | 0 | DOM capture, style normalization, asset registry |
| `packages/design-schema` | 53 | 53 | 0 | Zod schema validation & contracts |
| `packages/figma-renderer` | 57 | 91 | +34 | Fidelity comparators (14), font regression (6), Chrome capture fidelity (6), Schema fixture fidelity (7), Determinism (1) |
| `packages/test-fixtures` | 16 | 16 | 0 | Representative fixtures |
| **Total Automated Tests** | **284** | **324** | **+40** | **100% passing across all 6 workspaces** |

---

## 11. Determinism Verification

`npm run fidelity` was executed twice consecutively in the clean environment:
- **Run #1**: 13 fixtures passed, 0 failures, 0 unexpected warnings.
- **Run #2**: 13 fixtures passed, 0 failures, 0 unexpected warnings.
- **Diff between runs**: 0 byte diff in output reports or normalized trees.

---

## 12. Manual Differences Log & Figma Sanity

- **Interactive Figma fidelity sanity**: `NOT AVAILABLE` (Execution performed in headless Windows CLI development environment without active Figma desktop session).
- **Observed engine distinctions documented**:
  - Figma and Blink use different font layout/shaping engines: line heights, font metrics, and text bounding box wrapping can produce visual raster differences despite identical numeric CSS tokens.
  - SVG elements imported via `figma.createNodeFromSvg` create internal vector children whose exact path point count is internal to Figma; Web2Design correctly treats the top-level SvgNode as the logical fidelity unit.
  - Remote image assets in FakeFigmaHost normalize ephemeral test server ports to stable URL pathnames, ensuring reproducible test execution across random port allocations.

---

## 13. Changes Summary

- **Design Schema changes**: `None` (remains version `"0.1"`).
- **Capture feature changes**: `None`.
- **Renderer feature changes**:
  - Exported `FakeFigmaHost` and `fidelity` modules from `@web2design/figma-renderer`.
  - Normalized ephemeral port volatility in test host image hashes (`url-hash-<pathname>`).
  - Added strict transactional rollback tests in plugin integration suite.
- **Files Created**:
  - `packages/figma-renderer/src/fidelity/types.ts`
  - `packages/figma-renderer/src/fidelity/normalizer.ts`
  - `packages/figma-renderer/src/fidelity/comparator.ts`
  - `packages/figma-renderer/src/fidelity/manifest.ts`
  - `packages/figma-renderer/src/fidelity/index.ts`
  - `packages/figma-renderer/src/fake-host.ts`
  - `packages/figma-renderer/test/fidelity/comparators.test.ts`
  - `packages/figma-renderer/test/fidelity/schema-fixtures.fidelity.test.ts`
  - `packages/figma-renderer/test/fidelity/chrome-captures.fidelity.test.ts`
  - `packages/figma-renderer/test/fidelity/font-regression.fidelity.test.ts`
  - `packages/figma-renderer/test/fidelity/determinism.fidelity.test.ts`
  - `packages/figma-renderer/golden/*.golden.json` (13 golden baseline snapshots)
  - `apps/figma-plugin/test/integration.fidelity.test.ts`
  - `scripts/fidelity.mjs`
  - `docs/w2d-008-report.md`
- **Files Updated**:
  - `package.json` (added `"fidelity"` and `"fidelity:update"` scripts)
  - `packages/figma-renderer/src/index.ts`
  - `packages/figma-renderer/test/helpers/fake-figma-host.ts`
  - `packages/figma-renderer/README.md`
  - `apps/figma-plugin/README.md`
  - `README.md`

---

## 14. Recommended Next Step

With W2D-008 complete, the entire Browser → Schema → Renderer pipeline is locked into a deterministic regression system that prevents silent regressions across geometry, styles, typography, images, SVGs, and warnings.

Proceed to:
**W2D-009 — End-to-End Local MVP Validation**
(Validate full local workflow from Chrome Extension capture of local fixtures to live import inside interactive Figma desktop application).
