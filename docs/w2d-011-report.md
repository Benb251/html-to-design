# W2D-011 — Synthetic Pseudo-Element Capture Report

Validated: 2026-10-13, Asia/Saigon.  
Repository: `D:\Tool\html-to-design`  
Branch: `main`  
Design Schema: Wire version strictly `"0.1"`.  
Task Scope: Capture meaningful CSS-generated `::before` and `::after` visuals as deterministic synthetic Design Schema nodes using the existing V0.1 node model (`frame`, `rectangle`, `text`). Zero schema changes. Zero Figma renderer architecture changes.

---

## 1. Repository Before Work

- **Branch**: `main`
- **HEAD**: `f36feb2d203b1c7ff161a983c38dc40b61dbbce1` (`docs(evaluation): complete W2D-010 real-site limitations report`)
- **Git status before edits**: Clean working tree.
- **Inspected Sources**:
  - `docs/w2d-010-report.md`
  - `docs/evidence/w2d-010/`
  - `packages/capture-engine/`
  - `packages/design-schema/`
  - `packages/test-fixtures/`
  - `apps/extension/fixtures/`
  - `apps/extension/.smoke/`
  - `packages/figma-renderer/`
  - `packages/figma-renderer/src/fidelity/`

---

## 2. Implementation Overview

W2D-010 identified CSS pseudo-elements (`::before` / `::after`) as the #1 fidelity gap on real-world sites (516 observed across 4 of 12 tested sites). Previously, pseudo-elements were entirely omitted from the captured design tree.

W2D-011 implements synthetic pseudo-element capture directly within the `@web2design/capture-engine` package:
1. `parseGeneratedContent`: Deterministic parser for CSS generated `content` property without `eval()` or DOM innerHTML.
2. `unescapeCssString`: Decodes standard CSS string escapes including 1-to-6 hex unicode code points (`\2605`, `\f005`, `\A`) and escaped quote characters.
3. `measureTextInDocument`: Safe offscreen measurement helper using a temporary, invisible DOM node that guarantees zero DOM pollution and immediate cleanup.
4. `capturePseudoElement`: Core synthesis routine determining pseudo relevance, geometry confidence, local opacity, typography, and visual styles, and producing ordinary V0.1 `TextNode`, `RectangleNode`, or decomposed `FrameNode` containers.
5. Traversal integration: Interleaves synthetic `::before` nodes, DOM children, and synthetic `::after` nodes in DOM order.

---

## 3. Detection Rules

A pseudo-element is evaluated for capture only when it contributes meaningful visible output:

### 3.1 Exclusions (Produce 0 nodes)
- Computed `content` is `none` or `normal` without visual box dimensions.
- `display: none`
- `visibility: hidden` or `visibility: collapse`
- Computed `opacity: 0`
- Zero-size box (`width === 0 && height === 0`) with no generated text.
- Running in unmocked JSDOM test environments where pseudo computed styles are unsupported stubs.

### 3.2 Inclusions (Synthesized into nodes)
- **Generated text**: `content: "..."` containing non-empty characters or decoded unicode glyphs.
- **Decorative visual box**: `content: ""` with visible solid fill, border, or drop shadow and positive dimensions.
- **Composite badge / icon**: `content: "..."` with background, border, or padding.

---

## 4. Generated Content Parsing

### 4.1 Supported Forms
- Plain quoted strings: `"NEW"`, `'Featured'`, `"Start: "`, `" :End"`
- Empty quotes: `""`, `''` (evaluated for visual decorative boxes)
- CSS hex unicode escapes: `"\\2605"` (★), `"\\f005"` (icon fonts), `"\\2192"` (→), `"\\A"` (\n)
- Escaped quotation marks: `"Hello \\"World\\""`
- Chromium resolved attribute strings if exposed directly by computed style.

### 4.2 Unsupported Forms (Explicit Structured Warnings)
- `url(...)` → Emits `PSEUDO_CONTENT_UNSUPPORTED` (`url_content`)
- `counter(...)` / `counters(...)` → Emits `PSEUDO_CONTENT_UNSUPPORTED` (`counter_content`)
- Unresolved `attr(...)` → Emits `PSEUDO_CONTENT_UNSUPPORTED` (`unresolved_attr`)
- Quotes semantics (`open-quote`, `close-quote`) → Emits `PSEUDO_CONTENT_UNSUPPORTED` (`quote_content`)

---

## 5. Synthetic Node Identity

Synthetic pseudo-element IDs are deterministic, reproducible, unique, and strictly tied to their owning DOM element:

| Scenario | Generated ID Convention | Example |
|---|---|---|
| Direct `::before` visual node | `<parentId>::before` | `w2d-element-3-0::before` |
| Direct `::after` visual node | `<parentId>::after` | `w2d-element-3-0::after` |
| Decomposed child text node | `<parentId>::before:text` | `w2d-element-3-0::before:text` |
| Decomposed child text node | `<parentId>::after:text` | `w2d-element-3-0::after:text` |

Zero random IDs are used. IDs remain identical across repeated captures of the same document state.

---

## 6. Ordering Semantics

CSS pseudo-elements participate before and after child content. W2D-011 strictly preserves deterministic child ordering within the owning element frame:

```text
Parent FrameNode
  ├── ::before synthetic nodes (first)
  ├── real captured DOM children / text runs (middle)
  └── ::after synthetic nodes (last)
```

Verified both in controlled unit tests (`packages/capture-engine/test/pseudo.test.ts`) and rendered browser CDP smoke tests (`apps/extension/scripts/smoke.mjs`).

---

## 7. Geometry Strategy

Pseudo-elements do not expose `getBoundingClientRect()`. W2D-011 partitions geometry resolution into three confidence tiers:

### 7.1 High-Confidence Positioned Geometry
- Pseudo-element with `position: absolute` inside a positioned containing block.
- Insets (`top`, `left`, `bottom`, `right`) and explicit dimensions (`width`, `height`) parsed as CSS pixels.
- Padding and border of containing block accounted for.
- **Warning policy**: Emits **NO** geometry warning when positions and dimensions are fully determined.

### 7.2 Approximated In-Flow / Auto-Sized Geometry
- In-flow (`position: static | relative`) pseudo-elements or auto-sized dimensions.
- Dimensions measured using temporary offscreen DOM measurement or font-metrics heuristic.
- Position placed within parent's content box (`borderLeft + paddingLeft`).
- **Warning policy**: Emits `PSEUDO_GEOMETRY_APPROXIMATED` warning tagged to the pseudo node ID.

### 7.3 Unsupported / Zero Dimensions
- Pseudo-elements with unresolved layout or zero dimensions without text are discarded cleanly without generating ghost nodes.

---

## 8. Node Mapping & Decomposition

Synthetic pseudo-elements are mapped exclusively onto existing Design Schema V0.1 node types:

| Pseudo Content & Style | Synthesized Schema Node | Attributes Captured |
|---|---|---|
| Plain text / icon glyph only | `TextNode` (`type: "text"`) | Characters, font family, font size, font weight, font style, line height, letter spacing, text alignment, text color, local opacity. |
| Decorative visual box only (`content: ""`) | `RectangleNode` (`type: "rectangle"`) | Width, height, solid fill, uniform border, corner radius, drop shadow, local opacity. |
| Visual box with text (e.g. badge) | Decomposed `FrameNode` + child `TextNode` | Container `FrameNode` holds background fill, border, radius, shadow; child `TextNode` (`<id>:text`) holds characters and typography with inset padding geometry. |

---

## 9. Reused V0.1 Styling

Zero style parser logic was duplicated. `capturePseudoElement` reuses the established capture engine utilities:
- `visualStyle`: solid fills, uniform borders, corner radii, single outer shadows.
- `textStyle`: typography normalization, font weights, line height approximations.
- `cssColor`: RGBA / RGB / sRGB color conversion.
- `documentRect`: viewport scroll translation.
- **Local Opacity Rule**: Local opacity (`pseudoStyle.opacity`) is applied directly to the pseudo node and is **not** multiplied with parent opacity, allowing Figma's hierarchy to naturally compound opacity visually.

---

## 10. Warning Behavior

| Warning Code | Condition | Node ID Tagged |
|---|---|---|
| `PSEUDO_GEOMETRY_APPROXIMATED` | In-flow or auto-sized pseudo geometry derived via approximation heuristics. | `<parentId>::before` or `<parentId>::after` |
| `PSEUDO_CONTENT_UNSUPPORTED` | Unsupported generated-content functions (`url()`, `counter()`, `attr()`). | `<parentId>::before` or `<parentId>::after` |
| `BACKGROUND_IMAGE_UNSUPPORTED` | Pseudo-element contains `linear-gradient` / `radial-gradient` (deferred to W2D-012). | `<parentId>::before` or `<parentId>::after` |
| `TRANSFORM_APPROXIMATED` | Pseudo-element contains `transform !== "none"` (deferred to W2D-015). | `<parentId>::before` or `<parentId>::after` |

---

## 11. Controlled Fixture Results

Added dedicated controlled fixture: `apps/extension/fixtures/fidelity-pseudo.html`.

Tested scenarios in real headless Chrome via DevTools Protocol (`apps/extension/scripts/smoke.mjs`):
1. `::before` plain text (`Start: `, bold, #1d4ed8) → `TextNode` created.
2. `::after` plain text (` :End`, bold, #b91c1c) → `TextNode` created.
3. Unicode glyph `\2605` (★) → `TextNode` with character `"★"`.
4. Decorative visual box (`content: ""`, 16×16, #10b981) → `RectangleNode` created.
5. Circular badge (12×12, radius 6, #ef4444) → `RectangleNode` created.
6. Box with border and radius (24×24, border 2px solid, radius 4px) → `RectangleNode` created.
7. Pseudo with text + background (44×20, #ef4444) → `FrameNode` + child `TextNode` (`NEW`).
8. Absolute positioned pseudo → high-confidence geometry without `PSEUDO_GEOMETRY_APPROXIMATED`.
9. Both before and after on same parent → verified child order: `::before` (0), main text (1), `::after` (2).
10. Nested pseudo → captured on inner span.
11. Local opacity → `opacity: 0.5` preserved.
12. Hidden pseudo (`display: none`) → 0 nodes created.
13. `content: none` → 0 nodes created.
14. Unsupported content (`url(...)`) → 0 nodes created, emits `PSEUDO_CONTENT_UNSUPPORTED`.
15. Gradient pseudo → box preserved, emits `BACKGROUND_IMAGE_UNSUPPORTED`.
16. Transformed pseudo → box preserved, emits `TRANSFORM_APPROXIMATED`.

---

## 12. DOM Immutability Evidence

Capture must never pollute or mutate the host DOM. Verified via `test/pseudo.test.ts`:
- Source child count before capture equals count after capture (`document.body.childNodes.length`).
- Element classes and attributes remain completely identical.
- Zero temporary measurement elements remain in DOM (`document.querySelectorAll("span[style*='-9999px']").length === 0`).
- Capture is idempotent: repeated capture calls produce identical document structures.

---

## 13. Renderer Compatibility

- **Figma renderer architecture changes**: **NONE**.
- **Figma renderer code changes**: **NONE**.
- Synthetic pseudo-elements produce standard `frame`, `rectangle`, and `text` schema nodes.
- All synthetic nodes render transparently through `FakeFigmaHost` and real Figma plugin import without any renderer specialization or `if (pseudo)` branches.

---

## 14. Fidelity Regression Suite

Registered new fidelity fixture: `chrome-pseudo` (`apps/extension/.smoke/fidelity-pseudo.json`) in `packages/figma-renderer/src/fidelity/manifest.ts`.

### Consecutive Golden Runs
- **Run #1 (`npm run fidelity`)**:
  - Fixtures evaluated: **14** (was 13)
  - Nodes compared: **189** (was 141, **+48 nodes**)
  - Geometry assertions: **756** (was 564, **+192 assertions**)
  - Style assertions: **318** (was 174, **+144 assertions**)
  - Text assertions: **59** (was 33, **+26 assertions**)
  - Asset assertions: **10** (unchanged)
  - Expected warnings: **8** (unchanged)
  - Unexpected warnings: **0**
  - Failures: **0**
- **Run #2 (`npm run fidelity`)**:
  - Exact match with Run #1 across all 189 nodes and 1,243 assertions.

---

## 15. Real-Site Pseudo Spot Check

Executed via `node scripts/spot-check-pseudo.mjs` against two real sites identified in W2D-010 with heavy pseudo-element usage:

| Site | URL | DOM Observed Pseudos | Meaningful Pseudos | Synthesized Pseudo Nodes | Breakdown | W2D-010 Node Count | W2D-011 Node Count | Node Delta | Schema Valid | Renderer Success |
|---|---|---:|---:|---:|---|---:|---:|---:|:---:|:---:|
| `ecommerce-01-books` | `https://books.toscrape.com` | 185 | 185 | **185** | 185 text, 0 rect, 0 frame | 321 | 510 | **+189 (+58.9%)** | **YES** | **YES** |
| `docs-02-wikipedia` | `https://en.wikipedia.org/wiki/Figma` | 186 | 186 | **113** | 109 text, 4 rect, 0 frame | 1,810 | 1,932 | **+122 (+6.7%)** | **YES** | **YES** |

### Spot Check Findings
1. On `books.toscrape.com`, 185/185 meaningful pseudo-elements (icons, breadcrumbs, rating stars, pagination arrows) were successfully synthesized into editable text nodes. Zero crashes, 100% schema valid, 100% rendered into Figma nodes.
2. On `en.wikipedia.org/wiki/Figma`, 113 meaningful pseudo-elements were synthesized (109 text, 4 decorative boxes). 73 pseudo-elements using CSS counters (`counter(section)`) were safely detected and flagged with `PSEUDO_CONTENT_UNSUPPORTED` without dropping or corrupting the remaining page.
3. Total real-site nodes rendered increased by **+311 nodes** with zero schema validation errors and zero renderer failures.

---

## 16. Performance & Scaling Observations

- **Controlled pseudo fixture**: 48 nodes captured and rendered in FakeFigmaHost in **< 4ms**.
- **Real-site capture duration**:
  - `books.toscrape.com`: 62 ms (was 54 ms in W2D-010; +8 ms overhead for 185 pseudo evaluations).
  - `wikipedia`: 218 ms (was 191 ms in W2D-010; +27 ms overhead across 1,932 nodes).
- **Traversals**: Performed within the single existing DOM walk; computed styles for `::before` and `::after` fetched only once per element.

---

## 17. Automated Test Suite Summary

| Package | Test File Count | Tests Passed | New Tests Added |
|---|---:|---:|---:|
| `@web2design/capture-engine` | 4 | 118 | +13 |
| `@web2design/design-schema` | 1 | 53 | 0 |
| `@web2design/figma-renderer` | 13 | 92 | +1 |
| `@web2design/test-fixtures` | 1 | 16 | 0 |
| `@web2design/extension` | 2 | 21 | 0 |
| `@web2design/figma-plugin` | 4 | 38 | 0 |
| **Total Automated Unit/Integration Tests** | **25** | **338** | **+14** |
| **Chrome Rendered Smoke Checks** | **7 pages** | **57 checks** | **+12 checks** |
| **Fidelity Regression Fixtures** | **14 fixtures** | **189 nodes / 1,243 checks** | **+1 fixture / +48 nodes** |

---

## 18. Verification Classification Matrix

```text
Existing W2D regression:                   PASS
Pseudo content parser:                     PASS
Pseudo relevance detection:                PASS
Synthetic ID determinism:                  PASS
::before capture:                          PASS
::after capture:                           PASS
Generated text/icon capture:               PASS
Decorative box capture:                    PASS
Pseudo geometry — high-confidence:         PASS
Pseudo geometry — approximated:            PASS
Before/real/after child ordering:          PASS
DOM immutability:                          PASS
Schema V0.1 validation:                    PASS
Figma renderer compatibility:              PASS
Chrome rendered pseudo fixture:            PASS
Fidelity run #1:                           PASS
Fidelity run #2:                           PASS
Real-site pseudo spot-check:               PASS
Interactive Figma:                         NOT AVAILABLE (Manual Desktop gate)
```

---

## 19. Schema Changes

```text
Design Schema changes: NONE
Design Schema wire version: "0.1" (unchanged)
```

---

## 20. Renderer Architecture Changes

```text
Figma renderer architecture changes: NONE
Renderer special cases: NONE
```

---

## 21. Known Limitations

1. **Complex Generated Content**: `url(...)`, CSS `counter(...)`, and `open-quote`/`close-quote` remain unsupported and emit structured `PSEUDO_CONTENT_UNSUPPORTED` warnings.
2. **In-Flow Pseudo Geometry**: Normal-flow inline generated content geometry is approximated using font metrics / temporary measurement and emits `PSEUDO_GEOMETRY_APPROXIMATED`.
3. **Pseudo Gradients**: CSS `linear-gradient` / `radial-gradient` in pseudo-elements retain `BACKGROUND_IMAGE_UNSUPPORTED` (owned by W2D-012).
4. **Pseudo Transforms**: Rotated / skewed pseudo-elements retain `TRANSFORM_APPROXIMATED` (owned by W2D-015).

---

## 22. Important Files Changed

- `packages/capture-engine/src/pseudo.ts`: New synthetic pseudo-element capture module (content parser, unescaping, measurement, geometry, decomposition).
- `packages/capture-engine/src/capture.ts`: Traversal integration, ordering (`beforeNodes`, children, `afterNodes`), frame retention.
- `packages/capture-engine/src/styles.ts`: Safe guards for optional font styles in computed typography.
- `packages/capture-engine/src/index.ts`: Exported pseudo helpers and types.
- `packages/capture-engine/test/pseudo.test.ts`: 13 targeted unit and DOM immutability tests.
- `apps/extension/fixtures/fidelity-pseudo.html`: Dedicated 16-case pseudo-element HTML fixture.
- `apps/extension/scripts/serve-fixture.mjs`: Added fixture to local HTTP server.
- `apps/extension/scripts/smoke.mjs`: Added 12 Chrome CDP rendered checks for pseudo elements.
- `packages/figma-renderer/src/fidelity/manifest.ts`: Added `chrome-pseudo` to fidelity manifest.
- `packages/figma-renderer/golden/chrome-pseudo.golden.json`: Golden baseline snapshot for pseudo fixture.
- `scripts/spot-check-pseudo.mjs`: Real-site spot-check harness for high-pseudo pages.
- `docs/evidence/w2d-011-spot-check.json`: Spot-check results on Books to Scrape and Wikipedia.
- `packages/capture-engine/README.md`: Documented pseudo support matrix.
- `packages/figma-renderer/README.md`: Documented renderer compatibility.
- `README.md`: Updated project scope and verification documentation.

---

## 23. Recommended Next Task

Based on real-site evidence from W2D-010 and the W2D roadmap:

**W2D-012 — Gradient Fill Support**  
Implement `linear-gradient` and `radial-gradient` parsing in `@web2design/capture-engine`, wire into `DesignSchema` fill models, and translate into native Figma `GradientPaint` in `@web2design/figma-renderer`.
