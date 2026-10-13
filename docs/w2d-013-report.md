# W2D-013 Completion Report — Non-Uniform Borders + Multi/Inset Shadows

## 1. Repository Before Work

- **Branch**: `main`
- **HEAD**: `0bfca42` (Merge/commit of W2D-012)
- **Git Status**: Clean working tree before starting W2D-013.

---

## 2. Executive Summary & Verification Classification

W2D-013 introduces **Design Schema V0.3**, implementing deterministic support across the complete pipeline:

```text
Rendered CSS
    ↓
capture-engine
    ↓
Design Schema V0.3
    ↓
figma-renderer
    ↓
editable Figma strokes/effects
```

### Verification Classification Matrix (Section 63)

| Requirement Dimension | Evaluation Result | Notes / Details |
|---|:---:|---|
| Existing W2D regression | **PASS** | 0 regressions across all previous W2D features (gradients, pseudo-elements, assets, geometry). |
| V0.1 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.1"` inputs without schema modification. |
| V0.2 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.2"` inputs without schema modification. |
| V0.1 → V0.3 normalization | **PASS** | `normalizeDesignDocument()` upgrades uniform border and basic shadow to 4-side V0.3 and `boxShadows` array. |
| V0.2 → V0.3 normalization | **PASS** | Bit-for-bit gradient preservation; upgrades border and shadow fields to V0.3. |
| V0.3 strict validation | **PASS** | Strict schema validation; rejects unknown fields, negative blur/widths, malformed colors, unknown versions. |
| New producer version == 0.3 | **PASS** | `DESIGN_SCHEMA_VERSION = "0.3"`; all new captures emit `"0.3"`. |
| Per-side border capture | **PASS** | Chromium computed `borderTopWidth/Style/Color`, `borderRight...`, etc. extracted directly. |
| Unequal border widths | **PASS** | Non-uniform widths accurately captured and preserved per side. |
| Mixed border colors | **APPROXIMATED** | Schema captures exact colors per side; renderer uses primary color and emits `BORDER_COLOR_APPROXIMATED`. |
| Dashed border | **APPROXIMATED** | Emitted as `dashed`; rendered with native Figma dash pattern and emits `BORDER_STYLE_APPROXIMATED`. |
| Dotted border | **APPROXIMATED** | Emitted as `dotted`; rendered with native Figma dash pattern and emits `BORDER_STYLE_APPROXIMATED`. |
| Advanced border styles | **DEFERRED** | `double`, `groove`, `ridge`, `inset`, `outset` preserved in schema; rendered as solid + `BORDER_STYLE_APPROXIMATED`. |
| Native Figma individual stroke weights | **PASS** | Maps to `strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight`, `strokeLeftWeight`. |
| Multiple drop-shadow capture | **PASS** | Ordered multiple outer shadows parsed and retained in original order. |
| Inset shadow capture | **PASS** | Inset shadows recognized and parsed with `inset: true`. |
| Mixed drop/inset stack | **PASS** | Ordered combinations of outer and inset shadows captured without deduplication or merging. |
| Shadow order | **PASS** | Exact top-to-bottom array ordering preserved across schema and renderer. |
| Shadow spread | **PASS** | Positive and negative spreads preserved; graceful approximation fallback if unsupported. |
| Native Figma `DROP_SHADOW` | **PASS** | Outer shadows map directly to Figma `DROP_SHADOW` effects. |
| Native Figma `INNER_SHADOW` | **PASS** | Inset shadows map directly to Figma `INNER_SHADOW` effects. |
| Pseudo border/shadow integration | **PASS** | Reuses identical styling pipeline; synthetic `::before`/`::after` boxes inherit full border/shadow support. |
| Gradient regression | **PASS** | All linear and radial gradient tests, transforms, and stops remain 100% passing. |
| Chrome fixture (`fidelity-borders-shadows`) | **PASS** | 22 comprehensive scenarios evaluated in real Chrome headless; 25 new rendered assertions passed. |
| Fidelity run #1 | **PASS** | 16 fixtures evaluated, 254 nodes compared, 1,016 geom, 511 style, 0 unexpected warnings, 0 failures. |
| Fidelity run #2 | **PASS** | 100% identical to run #1, proving deterministic baseline stability. |
| Real-site spot check | **PASS** | Re-evaluated `vite.dev` and `tailwindcss.com`. Previous `BORDER_UNSUPPORTED` completely eliminated. |
| Interactive Figma Desktop | **NOT AVAILABLE** | Gate remains independent; pending manual interactive Figma Desktop session. |

---

## 3. Schema Migration Architecture

The versioned wire contract enforces explicit boundaries without mutating historical schemas:

```text
0.1 document ──┐
               ├── parse supported version ("0.1", "0.2", "0.3")
0.2 document ──┤
               ├── normalize / upgrade
0.3 document ──┘
                     ↓
             LatestDesignDocument V0.3
```

- **Supported input versions**: `["0.1", "0.2", "0.3"]`.
- **Producer wire version**: `"0.3"`.
- **Unknown versions**: strictly rejected (e.g. `"0.4"`, `"1.0"`).
- **No dual-version emission**: All new captures emit `"0.3"` unconditionally.

---

## 4. V0.3 Border Model

### Schema Types (`packages/design-schema/src/style.ts`)

```ts
export const BorderStyleSchema = z.enum([
  "none",
  "hidden",
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
]);

export const BorderSideSchema = z.strictObject({
  width: z.number().nonnegative(),
  style: BorderStyleSchema,
  color: ColorSchema,
});

export const BordersSchema = z.strictObject({
  top: BorderSideSchema,
  right: BorderSideSchema,
  bottom: BorderSideSchema,
  left: BorderSideSchema,
});
```

### Visual Style Integration
In `VisualStyleSchemaV03`, `border?: BordersSchema | undefined`.

---

## 5. V0.3 Shadow Model

### Schema Types (`packages/design-schema/src/style.ts`)

```ts
export const BoxShadowSchema = z.strictObject({
  offsetX: z.number().finite(),
  offsetY: z.number().finite(),
  blurRadius: z.number().nonnegative(),
  spreadRadius: z.number().finite().optional(),
  color: ColorSchema,
  inset: z.boolean().optional(),
});
```

### Visual Style Integration
In `VisualStyleSchemaV03`, `boxShadows?: BoxShadow[] | undefined`. Ordered array preserving CSS computed order.

---

## 6. Border Capture Engine Implementation

### Computed Style Extraction (`packages/capture-engine/src/styles.ts`)
Instead of reconstructing from shorthand declarations, the engine inspects authoritative computed values:
- `borderTopWidth`, `borderTopStyle`, `borderTopColor`
- `borderRightWidth`, `borderRightStyle`, `borderRightColor`
- `borderBottomWidth`, `borderBottomStyle`, `borderBottomColor`
- `borderLeftWidth`, `borderLeftStyle`, `borderLeftColor`

### Zero-Width / None Normalization
- `0px` computed width or `border-style: none | hidden` normalizes to `width: 0`.
- An element with 4 zero-width sides omits the `border` property, avoiding phantom Figma strokes.

---

## 7. Border Renderer Implementation

### Strategy Classification (Section 44)
1. **Per-side width**: **Exact native support**.
   - If visible sides share compatible paint, Figma's native individual stroke properties are set:
     ```ts
     node.strokeTopWeight = b.top.width;
     node.strokeRightWeight = b.right.width;
     node.strokeBottomWeight = b.bottom.width;
     node.strokeLeftWeight = b.left.width;
     ```
2. **Per-side color**: **Approximated**.
   - Figma nodes only support a single shared `strokes` paint array.
   - The renderer uses the primary visible side's color and emits `BORDER_COLOR_APPROXIMATED`.
3. **Per-side style**: **Exact for solid; approximated for dashed/dotted**.
   - Dashed and dotted styles map to native Figma `dashPattern` on the stroke, emitting `BORDER_STYLE_APPROXIMATED`.
   - Advanced 3D styles (`double`, `groove`, `ridge`, etc.) render as solid strokes with `BORDER_STYLE_APPROXIMATED`.
4. **Corner radius interaction**:
   - Corner radius is preserved alongside individual stroke weights; emits `BORDER_CORNER_APPROXIMATED` for differing widths with rounded corners.

---

## 8. Shadow Parser & Renderer Implementation

### Top-Level Comma Tokenizer
`box-shadow` values can contain nested commas inside color functions (e.g. `rgb(0, 0, 0)`, `rgba(...)`, `color(...)`). A depth-aware tokenizer (`splitShadowTokens`) splits only on top-level commas outside parentheses.

### Shadow Dimensions & Color Parser
For each shadow token:
- Detects `inset` keyword anywhere in token.
- Extracts color substring (`rgb(...)`, `rgba(...)`, hex, named).
- Parses numeric pixel dimensions: `offsetX`, `offsetY`, `blurRadius` ($\ge 0$), and `spreadRadius`.
- Handles negative and fractional px values accurately.

### Figma Effects Mapping
- Outer shadows $\rightarrow$ `Effect` with `type: "DROP_SHADOW"`.
- Inset shadows $\rightarrow$ `Effect` with `type: "INNER_SHADOW"`.
- Effect stack preserves exact CSS array order (top-to-bottom).
- Shadow color alpha remains independent from node opacity.
- Spread radius is applied directly; if restricted, it is gracefully omitted with `SHADOW_SPREAD_APPROXIMATED` without aborting import or forcing `clipsContent = true`.

---

## 9. Backwards Compatibility Verification

Explicit tests verify backward compatibility:
1. **Historical V0.1 documents**:
   - Parsed with `schemaVersion: "0.1"`.
   - Normalized into V0.3: scalar border converted to 4 identical sides; single outer shadow converted to `boxShadows` array.
   - Renders cleanly through FakeFigmaHost without regression.
2. **Historical V0.2 gradient documents**:
   - Parsed with `schemaVersion: "0.2"`.
   - Normalized into V0.3: linear and radial gradients, angles, stops, and alpha preserved bit-for-bit.
   - Renders identical native Figma gradient paints.

---

## 10. Test Fixtures & Chrome Smoke Extensions

### New Controlled Fixture: `apps/extension/fixtures/fidelity-borders-shadows.html`
Covers all 22 required scenarios:
1. `#uniform-solid`: Uniform solid border regression
2. `#top-only`: Top-only border (`border-top: 3px solid`)
3. `#bottom-only`: Bottom-only border (`border-bottom: 4px solid`)
4. `#four-widths`: Four different widths (`1px 2px 3px 4px`)
5. `#same-color-diff-widths`: Same color with unequal widths
6. `#diff-colors`: Four different side colors
7. `#dashed-border`: `2px dashed`
8. `#dotted-border`: `2px dotted`
9. `#double-border`: `3px double`
10. `#rounded-non-uniform`: Non-uniform border + corner radius
11. `#single-shadow`: Single drop shadow regression
12. `#two-shadows`: Two drop shadows
13. `#three-shadows`: Three drop shadows
14. `#inset-shadow`: Inset shadow (`box-shadow: inset 0 2px 4px`)
15. `#drop-inset-combo`: Outer drop + inset combination
16. `#positive-spread`: Positive spread (`0 0 0 3px`)
17. `#negative-spread`: Negative spread (`0 10px 15px -3px`)
18. `#alpha-shadow`: Alpha shadow (`rgba(15, 23, 42, 0.25)`)
19. `#fractional-shadow`: Fractional shadow values (`0.5px 1.5px 3.5px 0.5px`)
20. `#pseudo-non-uniform`: Synthetic `::before` with non-uniform border
21. `#pseudo-inset`: Synthetic `::after` with inset shadow
22. `#gradient-border-multi-shadow`: Combined gradient + border + multi-shadow stack

---

## 11. Automated Test Results

### Suite Summary

| Suite / Workspace | Tests Passing | Status |
|---|---:|:---:|
| `@web2design/extension` | **21 / 21** | PASS |
| `@web2design/figma-plugin` | **43 / 43** | PASS |
| `@web2design/capture-engine` | **139 / 139** | PASS |
| `@web2design/design-schema` | **69 / 69** | PASS |
| `@web2design/figma-renderer` | **108 / 108** | PASS |
| `@web2design/test-fixtures` | **20 / 20** | PASS |
| **Total Automated Tests** | **400 / 400** | **PASS** |

### Chrome Rendered Smoke Tests
- **Rendered fixture pages**: 9
- **Rendered assertions**: **97 passed** (up from 72)
- **Status**: **PASS**

### Fidelity Suite Results

```text
======================================================
 Web2Design Fidelity & Regression Suite (W2D-008)
 Mode: VERIFY AGAINST BASELINES
======================================================

  [PASS] canonical-simple-text        |   2 nodes |   8 geom |   2 style |  1 text |  0 asset |  0 warn
  [PASS] canonical-styled-rectangle   |   2 nodes |   8 geom |   6 style |  0 text |  0 asset |  0 warn
  [PASS] canonical-text-card          |   4 nodes |  16 geom |   8 style |  2 text |  0 asset |  0 warn
  [PASS] canonical-image              |   2 nodes |   8 geom |   0 style |  0 text |  1 asset |  0 warn
  [PASS] canonical-inline-svg         |   2 nodes |   8 geom |   0 style |  0 text |  1 asset |  0 warn
  [PASS] canonical-shadow             |   2 nodes |   8 geom |   6 style |  0 text |  0 asset |  0 warn
  [PASS] canonical-nested-frames      |   4 nodes |  16 geom |   0 style |  1 text |  0 asset |  0 warn
  [PASS] chrome-landing               |  21 nodes |  84 geom |  84 style | 10 text |  0 asset |  0 warn
  [PASS] chrome-geometry              |   9 nodes |  36 geom |   0 style |  0 text |  0 asset |  0 warn
  [PASS] chrome-text                  |  36 nodes | 144 geom |   0 style | 19 text |  0 asset |  0 warn
  [PASS] chrome-styles                |  17 nodes |  68 geom |  68 style |  0 text |  0 asset |  3 warn
  [PASS] chrome-assets                |  26 nodes | 104 geom |   0 style |  0 text |  8 asset |  5 warn
  [PASS] chrome-limits                |  14 nodes |  56 geom |   0 style |  0 text |  0 asset |  0 warn
  [PASS] chrome-pseudo                |  49 nodes | 196 geom | 147 style | 26 text |  0 asset |  0 warn
  [PASS] chrome-gradients             |  22 nodes |  88 geom |  22 style |  1 text |  0 asset |  0 warn
  [PASS] chrome-borders-shadows       |  42 nodes | 168 geom | 168 style |  0 text |  0 asset |  5 warn

------------------------------------------------------
 Fidelity Summary:
   Fixtures evaluated:     16
   Nodes compared:         254
   Geometry assertions:    1016
   Style assertions:       511
   Text assertions:        60
   Asset assertions:       10
   Expected warnings:      13
   Unexpected warnings:    0
   Fidelity failures:      0
------------------------------------------------------
```

Two consecutive fidelity executions produced 100% identical outputs with 0 unexpected warnings and 0 failures.

---

## 12. Real-Site Spot Check (W2D-010 Comparison)

Live Chrome DevTools Protocol evaluations of representative real sites:

### Site 1: `vite.dev` (`https://vite.dev`)
- **Nodes captured/rendered**: 366 nodes (0 skipped).
- **Capture duration**: 81ms.
- **Schema validity**: **VALID V0.3**.
- **W2D-010 before**: Emitted `BORDER_UNSUPPORTED` on node `w2d-element-1-0-3-0` and `SHADOW_UNSUPPORTED` on node `w2d-element-1-0-4-0-2-0-1-0-0`.
- **W2D-013 after**:
  - `BORDER_UNSUPPORTED`: **0 occurrences (Eliminated)**. The non-uniform border is rendered with native Figma stroke weights.
  - `SHADOW_UNSUPPORTED`: **0 occurrences (Eliminated)**. Multiple box shadows rendered as native `DROP_SHADOW` effects.

### Site 2: `tailwindcss.com` (`https://tailwindcss.com`)
- **Nodes captured/rendered**: 1,144 nodes (0 skipped).
- **Capture duration**: 194ms.
- **Schema validity**: **VALID V0.3**.
- **W2D-010 before**: Emitted blanket `BORDER_UNSUPPORTED` and `SHADOW_UNSUPPORTED`.
- **W2D-013 after**:
  - `BORDER_UNSUPPORTED`: **0 occurrences (Eliminated)**. All navigation border-bottom dividers and non-uniform card borders rendered natively.
  - Multi-shadow stacks rendered as native Figma `DROP_SHADOW` / `INNER_SHADOW` effect stacks.

---

## 13. W2D-009 Gate Status

- **Status**: **NOT AVAILABLE / PENDING**.
- Real interactive Figma Desktop GUI canvas validation remains an independent manual gate. FakeFigmaHost validates complete renderer execution and properties deterministically, but does not replace the interactive desktop validation.

---

## 14. Known Limitations

1. **Figma Shared Stroke Paint**: Figma only supports a single stroke paint per node. When CSS specifies differing colors per side (e.g. red top, blue bottom), the renderer uses the primary visible side color and emits `BORDER_COLOR_APPROXIMATED`.
2. **Dashed/Dotted Stroke Approximations**: CSS browser dash geometry does not match Figma's dash pattern pixel-for-pixel; emits `BORDER_STYLE_APPROXIMATED`.
3. **Advanced 3D Border Styles**: Styles such as `double`, `groove`, `ridge`, `inset`, `outset` map to solid strokes and emit `BORDER_STYLE_APPROXIMATED`.
4. **Rounded Corners + Unequal Widths**: Complex browser corner beveling cannot be represented identically by Figma's single corner radius model; emits `BORDER_CORNER_APPROXIMATED`.

---

## 15. Important Files Changed

- `packages/design-schema/src/version.ts`: Added `0.3` wire version and supported list.
- `packages/design-schema/src/style.ts`: Added `BorderSideSchema`, `BordersSchema`, `BoxShadowSchema`, and `VisualStyleSchemaV03`.
- `packages/design-schema/src/nodes.ts`: Added V0.3 node schemas and updated default exports.
- `packages/design-schema/src/document.ts`: Added V0.3 document schemas, `normalizeNodeToV03()`, and updated union types.
- `packages/design-schema/src/api.ts`: Validation routing across V0.1, V0.2, and V0.3.
- `packages/capture-engine/src/styles.ts`: Computed 4-side border extraction and ordered multi/inset shadow parser.
- `packages/capture-engine/src/capture.ts`: Emits V0.3 document.
- `packages/figma-renderer/src/styles.ts`: Maps non-uniform borders to native `strokeTopWeight` etc. and shadows to `DROP_SHADOW`/`INNER_SHADOW`.
- `packages/figma-renderer/src/fake-host.ts`: Models individual stroke weights, `dashPattern`, and effect types.
- `packages/figma-renderer/src/fidelity/`: Manifest, normalizer, and comparator updated for 16 fixtures.
- `apps/extension/fixtures/fidelity-borders-shadows.html`: 22-scenario controlled test fixture.
- `apps/extension/scripts/smoke.mjs`: Added 25 rendered checks for borders and shadows.
- `packages/test-fixtures/`: Added canonical V0.3 border and shadow fixtures, and compatibility tests.

---

## 16. Recommended Next Task

**W2D-014 — Container Clipping / `overflow: hidden`**

With per-side borders and multiple/inset shadows natively implemented, the next visual defect identified in W2D-010 (affecting 9/12 real sites and 312 elements) is container clipping (`overflow: hidden` / `overflow: clip`), which causes content designed to stay within bounds to bleed across parent containers on the Figma canvas.
