# W2D-016 — Rich-Text Paragraph Spans + Design Schema V0.6 Verification Report

**Milestone:** W2D-016  
**Status:** COMPLETE & FULLY VERIFIED  
**Date:** 2026-10-14  
**Author:** Antigravity (Google DeepMind Advanced Agentic Coding)  

---

## 1. Repository Before Work

- **Branch:** `main`
- **HEAD Commit:** `2bcf1b6` (`W2D-015 — CSS 2D Transforms & Rotation`)
- **Initial Working State:** Clean working tree, 460 automated tests, 155 rendered Chrome checks across 11 fixture pages, 18 fidelity fixtures, 381 nodes compared, 1,524 geometry assertions, 31 transform assertions, 1,054 style assertions, 60 text assertions, 10 asset assertions, 28 expected warnings, 0 unexpected warnings, 0 fidelity failures.
- **Git Push Policy:** No remote push. All changes staged/unstaged locally.

---

## 2. Executive Verification Summary

| Gate / Classification | Status | Details |
|---|:---:|---|
| Existing W2D regression | **PASS** | 0 regressions across all existing transforms, clipping, gradients, borders, shadows, and assets. |
| V0.1 parser compatibility | **PASS** | Validated via `parseDesignDocument()` and `safeParseDesignDocument()`. |
| V0.2 parser compatibility | **PASS** | Validated via `parseDesignDocument()` and `safeParseDesignDocument()`. |
| V0.3 parser compatibility | **PASS** | Validated via `parseDesignDocument()` and `safeParseDesignDocument()`. |
| V0.4 parser compatibility | **PASS** | Validated via `parseDesignDocument()` and `safeParseDesignDocument()`. |
| V0.5 parser compatibility | **PASS** | Validated via `parseDesignDocument()` and `safeParseDesignDocument()`. |
| V0.1 → V0.6 normalization | **PASS** | Historical docs normalize to `LatestDesignDocument` V0.6 with `runs: undefined`. |
| V0.2 → V0.6 normalization | **PASS** | Historical docs normalize to `LatestDesignDocument` V0.6 with `runs: undefined`. |
| V0.3 → V0.6 normalization | **PASS** | Historical docs normalize to `LatestDesignDocument` V0.6 with `runs: undefined`. |
| V0.4 → V0.6 normalization | **PASS** | Historical docs normalize to `LatestDesignDocument` V0.6 with `runs: undefined`. |
| V0.5 → V0.6 normalization | **PASS** | Historical docs normalize to `LatestDesignDocument` V0.6 with `runs: undefined`. |
| V0.6 strict validation | **PASS** | Rejects negative start, start >= end, end > length, overlaps, unsorted runs, gaps, and unmerged adjacent runs. |
| New producer version == 0.6 | **PASS** | Extension, content script, and capture engine produce `schemaVersion: "0.6"`. |
| Rich-text flow detection | **PASS** | Pure classification helper `analyzeInlineTextFlow` isolates inline flows safely. |
| Whitespace/index mapping | **PASS** | Ranges mapped simultaneously with whitespace normalization; 0 off-by-one errors. |
| No duplicate text capture | **PASS** | Descendant spans/anchors/marks do not produce separate sibling TextNodes. |
| Bold ranges | **PASS** | Preserves computed `fontWeight` in character range. |
| Italic ranges | **PASS** | Preserves computed `fontStyle: "italic"` in character range. |
| Nested style ranges | **PASS** | Nested elements (`<strong><em>...</em></strong>`) correctly inherit both styles. |
| Color ranges | **PASS** | Preserves per-run color alpha and RGB values. |
| Font-size ranges | **PASS** | Preserves mixed font sizes on single TextNode. |
| Font-family ranges | **PASS** | Preserves mixed font families (e.g. `monospace` for `<code>`). |
| Letter-spacing ranges | **PASS** | Preserves per-run pixel letter spacing. |
| Line-height ranges | **PASS** | Preserves per-run pixel line height. |
| Underline | **PASS** | Preserves `textDecorationLine: "underline"`. |
| Strikethrough | **PASS** | Preserves `textDecorationLine: "line-through"`. |
| Hyperlinks | **PASS** | Safe URLs (`http:`, `https:`, `mailto:`, `tel:`) mapped to native Figma hyperlink ranges. |
| Emoji/range indexing | **PASS** | Verified with surrogate pairs and emoji in `fidelity-rich-text.html`. |
| `<br>` handling | **PASS** | Normal `<br>` converted to `\n` character within text flow without breaking range indices. |
| Multiline rich text | **PASS** | Continuous paragraphs wrapping across lines remain one logical TextNode. |
| Inline box safety | **PASS** | Descendants with backgrounds, borders, padding, transforms, or replaced elements remain separate. |
| Per-run font fallback | **PASS** | Unavailable fonts fall back independently without degrading other runs or the whole node. |
| Single editable Figma TextNode | **PASS** | Maps to 1 native Figma TextNode with native ranged properties. |
| Transform regression | **PASS** | Rotated rich text retains V0.5 transform without node fragmentation. |
| Clipping regression | **PASS** | Rich text inside `overflow: hidden` retains V0.4 container clipping. |
| Gradient/border/shadow regression | **PASS** | Zero regression across V0.2 gradients and V0.3 borders/shadows. |
| Chrome rich-text fixture | **PASS** | 30 scenarios in `fidelity-rich-text.html` validated with 31 assertions. |
| Fidelity run #1 | **PASS** | 19 fixtures evaluated, 457 nodes, 1,828 geom, 33 xform, 1,318 style, 98 text, 81 range checks, 0 failures. |
| Fidelity run #2 | **PASS** | 100% identical to run #1, verifying deterministic baseline stability. |
| Real-site rich-text spot check | **PASS** | Wikipedia (-43.4% text nodes), React.dev (-66.1%), Node.js (-14.9%), Hacker News (-80.1%). |
| Interactive real Figma validation | **NOT AVAILABLE** | Independent manual gate pending real Figma Desktop testing environment. |

---

## 3. Schema Migration

Design Schema V0.6 extends the multi-version input pipeline:

```text
0.1 ─┐
0.2 ─┤
0.3 ─┼─ parse supported version ──→ normalize ──→ LatestDesignDocument V0.6
0.4 ─┤
0.5 ─┤
0.6 ─┘
```

### Migration Semantics

- **V0.1–V0.5 Inputs**: Normalized to V0.6 with `runs: undefined`. All existing fills, gradients, per-side borders, multi-shadows, clipping, transforms, and geometry are preserved byte-for-byte.
- **Wire Producer**: `"0.6"`.
- **Unsupported Versions**: Any version other than `"0.1"`, `"0.2"`, `"0.3"`, `"0.4"`, `"0.5"`, `"0.6"` (e.g. `"0.7"`, `"1.0"`) is authoritatively rejected.

---

## 4. V0.6 Rich-Text Model

The schema contract represents character ranges using renderer-neutral values:

```ts
export interface TextRunStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: "normal" | "italic";
  lineHeight?: number;
  letterSpacing?: number;
  color?: Color;
  textDecorationLine?: "none" | "underline" | "line-through";
}

export interface TextRun {
  start: number;
  end: number;
  style: TextRunStyle;
  hyperlink?: string;
}

export interface TextNode extends BaseNode {
  type: "text";
  characters: string;
  textStyle: TextStyle;
  runs?: TextRun[];
  transform?: Transform2D;
}
```

---

## 5. Flow Eligibility

The pure classification helper `analyzeInlineTextFlow(element)` determines when an element is captured as a unified rich-text `TextNode` vs a container frame:

1. **Eligible Rich-Text Flow Root**:
   - Element has inline formatting tags (`<span>`, `<strong>`, `<b>`, `<em>`, `<i>`, `<a>`, `<code>`, `<small>`, `<mark>`, `<br>`).
   - Or element contains mixed computed text styling across descendant text fragments.
   - All descendants are inline elements or `display: contents`.
2. **Ineligible / Box-Retaining Cases**:
   - Element has `hasIndependentBoxSemantics(child)`:
     - Explicit CSS `background-color` or background image.
     - Non-zero padding or borders.
     - Non-zero `border-radius`.
     - CSS `transform !== "none"`.
     - `position: absolute` or `fixed`.
     - `opacity < 1` or `filter !== "none"`.
     - Replaced elements (`<img>`, `<svg>`, `<canvas>`, `<input>`, `<video>`, `<iframe>`).
   - When a replaced element appears between text, `RICH_TEXT_EMBEDDED_NODE_SPLIT` is emitted and the text flow is cleanly split around the embedded node.

---

## 6. Character Construction & Range Indexing

To avoid post-normalization offset drift:
1. The DOM subtree is traversed recursively.
2. For each DOM text node, characters are extracted and whitespace is collapsed in sync with browser rules.
3. As characters are appended to the accumulator, range offsets `[start, end)` are recorded immediately.
4. `<br>` elements insert `\n` characters directly, preserving offset continuity.
5. Range boundaries strictly correspond to JavaScript UTF-16 code units (`characters.slice(start, end)`), verified against emoji surrogate pairs (e.g., `👋`, `🌍`).

---

## 7. Run Normalization & Optimization

Before export:
1. **Sorting**: Runs are sorted strictly by `start`.
2. **Contiguity & Coverage**: Runs form a complete contiguous partition `0..characters.length`.
3. **Coalescing**: Adjacent runs with identical effective styling and identical hyperlink target are merged into a single run.
4. **Whole-Node Optimization**: If all runs resolve to the base node style, `runs` is set to `undefined`, preventing unnecessary ranged styling overhead.

---

## 8. Supported Range Styles

- `fontFamily`: Normalized primary font family name.
- `fontSize`: CSS pixels.
- `fontWeight`: Numeric weight (400, 500, 600, 700) or CSS weight string.
- `fontStyle`: `"normal"` or `"italic"`.
- `lineHeight`: CSS pixels.
- `letterSpacing`: CSS pixels.
- `color`: RGBA color object `{ r, g, b, a }`.
- `textDecorationLine`: `"none"`, `"underline"`, or `"line-through"`.
- `hyperlink`: Normalized safe URL (`http:`, `https:`, `mailto:`, `tel:`). Unsafe executable schemes (`javascript:`) emit `RICH_TEXT_LINK_UNSUPPORTED` and are excluded.

---

## 9. Renderer Architecture

When rendering a V0.6 `TextNode` with `runs`:
```text
1. Create single native Figma TextNode
2. Collect and deduplicate all FontNames needed (base + all runs)
3. Load all unique fonts in batch via host.loadFontAsync
4. Assign characters string
5. Apply node-wide base styles
6. Apply ranged style setters:
   - setRangeFontName(start, end, font)
   - setRangeFontSize(start, end, size)
   - setRangeFills(start, end, [solidPaint])
   - setRangeLetterSpacing(start, end, spacing)
   - setRangeLineHeight(start, end, height)
   - setRangeTextDecoration(start, end, decoration)
   - setRangeHyperlink(start, end, hyperlink)
7. Restore captured geometry (resize) and apply V0.5 transform
```

---

## 10. Per-Run Font Fallback

- The font cache tracks available fonts in Figma.
- If run $A$ requests an available font (e.g. `Arial Bold`), it receives `Arial Bold`.
- If run $B$ requests an unavailable font (e.g. `CustomFont-Bold`), it falls back to `defaultFont` (e.g. `Inter Regular`) independently.
- Emits a targeted `FONT_FALLBACK` warning without downgrading the base font or other runs on the node.
- Font fallback warnings are deduplicated per node and font family.

---

## 11. Geometry & Typography Limitations

- Figma and browser layout engines use different line wrapping and kerning algorithms.
- While character ranges, editable characters, and bounding box dimensions are captured with exact fidelity, minor visual line wrapping differences can occur on multi-line text blocks.
- Captured box dimensions are explicitly enforced via `textNode.resize()` to preserve layout fidelity.

---

## 12. Inline-Box Limitations

- CSS inline box features (inline backgrounds, padding, borders, border-radius) cannot be represented as ranged properties on a Figma `TextNode`.
- Web2Design prioritizes visual correctness over naive node collapse: elements with independent box styles retain their distinct box nodes rather than being flattened into plain text runs.

---

## 13. Controlled Fixtures & Scenarios

Fixture: `apps/extension/fixtures/fidelity-rich-text.html` covers 30 comprehensive scenarios:
1. Plain text regression
2. `<strong>` bold range
3. `<em>` italic range
4. Nested `<strong><em>` (Bold Italic)
5. Colored span (`color: rgb(...)`)
6. Mixed font sizes (14px + 24px)
7. Mixed font families (`sans-serif` + `monospace`)
8. Unavailable font fallback
9. Letter spacing run
10. Line height range
11. Underline decoration
12. Line-through strikethrough
13. Anchor hyperlink (`<a href="...">`)
14. Multiple adjacent hyperlinks
15. Nested styled spans
16. `<br>` newline within flow
17. Whitespace collapsing across inline elements
18. Emoji and surrogate pair boundaries (`👋`, `🌍`)
19. `<code>` inline font
20. Multiline wrapped paragraph
21. Rich text inside transformed container
22. Transformed rich `TextNode` itself rotated
23. Clipping parent around rich text
24. Inline background box safety
25. Inline border/padding box safety
26. Inline-block child box safety
27. Embedded `<img>` splitting text flow
28. Pseudo-element generated text preservation
29. `text-transform` retention/warning
30. Gradient text limitation warning

---

## 14. Fidelity Suite Results

```text
======================================================
 Web2Design Fidelity & Regression Suite (W2D-008)
 Mode: VERIFY AGAINST BASELINES
======================================================

  [PASS] canonical-simple-text        |   2 nodes |   8 geom |  0 xform |   2 style |  1 text ( 0 runs) |  0 asset |  0 warn
  [PASS] canonical-styled-rectangle   |   2 nodes |   8 geom |  0 xform |   6 style |  0 text ( 0 runs) |  0 asset |  0 warn
  [PASS] canonical-text-card          |   4 nodes |  16 geom |  0 xform |   8 style |  2 text ( 0 runs) |  0 asset |  0 warn
  [PASS] canonical-image              |   2 nodes |   8 geom |  0 xform |   0 style |  0 text ( 0 runs) |  1 asset |  0 warn
  [PASS] canonical-inline-svg         |   2 nodes |   8 geom |  0 xform |   0 style |  0 text ( 0 runs) |  1 asset |  0 warn
  [PASS] canonical-shadow             |   2 nodes |   8 geom |  0 xform |   6 style |  0 text ( 0 runs) |  0 asset |  0 warn
  [PASS] canonical-nested-frames      |   4 nodes |  16 geom |  0 xform |   0 style |  1 text ( 0 runs) |  0 asset |  0 warn
  [PASS] chrome-landing               |  20 nodes |  80 geom |  0 xform |  80 style |  9 text ( 2 runs) |  0 asset |  0 warn
  [PASS] chrome-geometry              |   9 nodes |  36 geom |  0 xform |   0 style |  0 text ( 0 runs) |  0 asset |  0 warn
  [PASS] chrome-text                  |  36 nodes | 144 geom |  0 xform |   0 style | 19 text ( 0 runs) |  0 asset |  0 warn
  [PASS] chrome-styles                |  17 nodes |  68 geom |  0 xform |  68 style |  0 text ( 0 runs) |  0 asset |  3 warn
  [PASS] chrome-assets                |  26 nodes | 104 geom |  0 xform |   0 style |  0 text ( 0 runs) |  8 asset |  5 warn
  [PASS] chrome-limits                |  14 nodes |  56 geom |  0 xform |   0 style |  0 text ( 0 runs) |  0 asset |  0 warn
  [PASS] chrome-pseudo                |  49 nodes | 196 geom |  0 xform | 147 style | 26 text ( 0 runs) |  0 asset |  0 warn
  [PASS] chrome-gradients             |  22 nodes |  88 geom |  0 xform |  22 style |  1 text ( 0 runs) |  0 asset |  0 warn
  [PASS] chrome-borders-shadows       |  42 nodes | 168 geom |  0 xform | 168 style |  0 text ( 0 runs) |  0 asset |  5 warn
  [PASS] chrome-clipping              |  65 nodes | 260 geom |  0 xform | 287 style |  0 text ( 0 runs) |  0 asset |  5 warn
  [PASS] chrome-transforms            |  62 nodes | 248 geom | 31 xform | 256 style |  0 text ( 0 runs) |  0 asset | 10 warn
  [PASS] chrome-rich-text             |  77 nodes | 308 geom |  2 xform | 268 style | 39 text (79 runs) |  0 asset |  4 warn

------------------------------------------------------
 Fidelity Summary:
   Fixtures evaluated:     19
   Nodes compared:         457
   Geometry assertions:    1,828
   Transform assertions:   33
   Style assertions:       1,318
   Text assertions:        98
   Rich-text range checks: 81
   Asset assertions:       10
   Expected warnings:      32
   Unexpected warnings:    0
   Fidelity failures:      0
------------------------------------------------------
```

- **Fidelity Run #1**: PASS (0 failures, 0 unexpected warnings)
- **Fidelity Run #2**: PASS (100% deterministic match with Run #1)

---

## 15. Real-Site Spot Check

Evaluated via live Chrome headless CDP across 4 text-heavy pages from the W2D-010 evaluation set:

| Site | W2D-010 Text Nodes | W2D-016 Text Nodes | Rich Text Flows | Total Runs | Max Runs / Node | Bold Runs | Italic Runs | Link Runs | Schema V0.6 | Renderer | Duration | Fragmentation Reduction |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|:---:|---:|---:|
| **Wikipedia** (Responsive web design) | 1,316 | 745 | 8 | 13 | 3 | 1 | 7 | 5 | **PASS** | **PASS** | 454ms | **-43.4%** |
| **React Documentation** (`react.dev`) | 693 | 235 | 63 | 494 | 18 | 0 | 2 | 4 | **PASS** | **PASS** | 433ms | **-66.1%** |
| **Node.js Official Portal** (`nodejs.org/en`) | 141 | 120 | 9 | 31 | 13 | 3 | 0 | 10 | **PASS** | **PASS** | 139ms | **-14.9%** |
| **Hacker News** (`news.ycombinator.com`) | 482 | 96 | 65 | 389 | 15 | 1 | 0 | 199 | **PASS** | **PASS** | 153ms | **-80.1%** |

### Fragmentation Reduction Summary
- On metadata-heavy and article-heavy pages (like Hacker News and React.dev), inline formatting fragmentation was reduced by up to **80.1%**, turning hundreds of disconnected text fragments into single coherent editable paragraphs with native ranged styles.

---

## 16. Test Suite Metrics

| Workspace / Package | Automated Tests |
|---|---:|
| `@web2design/design-schema` | 96 |
| `@web2design/test-fixtures` | 26 |
| `@web2design/capture-engine` | 162 |
| `@web2design/figma-renderer` | 125 |
| `@web2design/extension` | 21 |
| `@web2design/figma-plugin` | 47 |
| **Total Automated Tests** | **477** (Baseline: 460) |

- **Rendered Chrome Smoke Checks**: **188 checks** across 12 fixture pages (Baseline: 155 across 11).
- **Fidelity Fixtures**: **19 fixtures**, 457 nodes, 1,828 geometry assertions, 33 transform assertions, 1,318 style assertions, 98 text assertions, 81 rich-text range checks.

---

## 17. Current Schema State

- **Current Producer Version**: `"0.6"`
- **Supported Input Versions**:
  - `"0.1"`
  - `"0.2"`
  - `"0.3"`
  - `"0.4"`
  - `"0.5"`
  - `"0.6"`

---

## 18. W2D-009 Gate State

The interactive Figma Desktop GUI validation gate remains **INDEPENDENT and PENDING**. It is not closed based on `FakeFigmaHost`. When interactive Figma Desktop testing becomes possible, manual validation will proceed across canonical samples, styles, text, image, SVG, gradients, borders, shadows, clipping, transforms, and rich text ranges.

---

## 19. Known Limitations

1. **Inline Box Styling in Text Ranges**: CSS inline elements with explicit backgrounds, borders, or padding cannot be styled via Figma substring text ranges. Such elements are safely kept as independent box nodes.
2. **Text Shadows**: CSS `text-shadow` is distinct from container `box-shadow` and cannot be applied per-character in Figma. Emits `TEXT_SHADOW_UNSUPPORTED`.
3. **Gradient Text**: Substring `background-clip: text` gradients cannot be rendered via native Figma text fills. Emits `TEXT_GRADIENT_UNSUPPORTED`.
4. **Browser/Figma Glyph Kerning & Wrapping**: Exact line wrap points can vary slightly due to inherent font rasterization differences between Chromium and Figma.
5. **Complex Text Decorations**: Wavy/dotted underlines and custom underline thickness are approximated with native solid underlines.

---

## 20. Files Changed

### `packages/design-schema/`
- `src/version.ts`: Added `"0.6"`, updated `DESIGN_SCHEMA_VERSION`.
- `src/nodes.ts`: Added `TextRunStyleSchema`, `TextRunSchema`, strict validation refinements.
- `src/document.ts`: Added `DesignDocumentV06Schema`, updated normalization and upgrade functions.
- `src/index.ts`: Exported new rich text types and schemas.
- `test/design-schema.test.ts`: Added unit tests for V0.6 validation and migration.

### `packages/capture-engine/`
- `src/richtext.ts`: Pure classification and collection helpers (`analyzeInlineTextFlow`, `collectRichTextFlow`, `hasIndependentBoxSemantics`).
- `src/capture.ts`: Integrated rich-text flow capture and replaced element splitting.
- `src/index.ts`: Exported rich text helpers.
- `test/capture.test.ts`: Added unit tests for rich text flow capture.

### `packages/figma-renderer/`
- `src/fake-host.ts`: Implemented generic ranged text methods and styled segment inspection.
- `src/fonts.ts`: Implemented `resolveAndLoadTextAndRunFonts` with per-run fallback and deduplication.
- `src/renderer.ts`: Single-TextNode rich text rendering with native ranged calls.
- `src/fidelity/types.ts`, `normalizer.ts`, `comparator.ts`, `manifest.ts`: Extended fidelity comparator for rich-text ranges.
- `test/renderer.test.ts`: Added tests for rich text rendering and font fallback.

### `packages/test-fixtures/`
- `src/index.ts`: Canonical V0.6 fixtures (`richTextBoldFixture`, `richTextColorFixture`, `richTextNestedFixture`, etc.).
- `test/fixtures.test.ts`: Added tests for V0.6 canonical fixtures.

### `apps/extension/`
- `fixtures/fidelity-rich-text.html`: 30 rich text scenarios.
- `scripts/serve-fixture.mjs`: Added rich-text fixture route.
- `scripts/smoke.mjs`: Added 31 Chrome smoke checks for rich text.
- `test/orchestration.test.ts`: Updated schema version assertion to `"0.6"`.

### `apps/figma-plugin/`
- `test/fixtures.test.ts`, `test/messages.test.ts`, `test/summary.test.ts`: Updated to support V0.6.

### `scripts/`
- `scripts/fidelity.mjs`: Integrated rich-text range checks into fidelity runner.
- `scripts/spot-check-rich-text.mjs`: Real-site headless Chrome spot check script.

---

## 21. Recommended Next Task

```text
W2D-017 — Auto Layout Inference
```
