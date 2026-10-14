# W2D-017 — High-Confidence Auto Layout Inference + Design Schema V0.7 Final Report

**Lifecycle Stage**: Implementation & Verification Complete  
**Wire Producer Schema**: `"0.7"`  
**Supported Wire Inputs**: `"0.1"`, `"0.2"`, `"0.3"`, `"0.4"`, `"0.5"`, `"0.6"`, `"0.7"`  
**Deterministic Test Suite**: 508 passing tests across 6 workspaces  
**Extension Rendered Smoke Suite**: 225 checks across 13 fixture pages (`automatedRenderedChromeSmoke: PASS`)  
**Fidelity Regression Suite**: 20 fixtures, 669 nodes, 2,676 geometry assertions, 35 transform assertions, 2,093 style assertions, 165 text assertions, 84 rich-text range checks, 12 asset assertions, 121 Auto Layout checks, 32 expected warnings, 0 unexpected warnings, 0 failures  
**Real-Site Spot Check**: 4 representative flex-heavy production sites (`react.dev`, `vite.dev`, `tailwindcss.com`, `wikipedia`), 835 DOM flex containers, 317 inferred Auto Layout frames, 100% schema valid, zero skipped nodes  
**W2D-009 Gate Status**: `NOT AVAILABLE` / Pending real Figma desktop GUI interactive validation  

---

## 1. Executive Summary

Prior to W2D-017, Web2Design maintained a strict absolute-layout-first architecture. While guaranteeing pixel-perfect fidelity across geometry, text, borders, shadows, gradients, and transforms, every frame was imported as `layoutMode = "NONE"`. Users editing imported designs in Figma had to manually recreate Auto Layout frames.

In W2D-010 real-site analysis, over 1,079 Flexbox containers and 86 CSS Grid containers were identified across production sites. W2D-017 introduces **High-Confidence Auto Layout Inference** and **Design Schema V0.7**, enabling Web2Design to safely translate Flexbox layouts into native, editable Figma Auto Layout frames while adhering to the core principle:

> **Fidelity before semantics. Auto Layout is an enhancement, not a replacement for absolute-layout fidelity. Deterministic before AI.**

Every captured container maintains its exact absolute layout geometry (`x`, `y`, `width`, `height`). Semantic Flexbox metadata (`layout` on `FrameNode`, `layoutChild` on child nodes) is emitted only when a mathematical simulation (`predictAutoLayoutGeometry`) verifies that native Auto Layout placement matches browser layout coordinates within $\le 0.5\text{px}$ tolerance. Ambiguous or unsupported containers fall back unconditionally to absolute layout (`layoutMode = "NONE"`) with structured diagnostic warnings.

---

## 2. Design Schema V0.7 Wire Specification

### 2.1 Supported Versions and Normalization
- Current producer version: `"0.7"`.
- Backward read compatibility: `"0.1"`, `"0.2"`, `"0.3"`, `"0.4"`, `"0.5"`, `"0.6"`, and `"0.7"`.
- **Normalization Rule**: Historical documents (V0.1–V0.6) normalize to V0.7 with `layout: undefined` and `layoutChild: undefined`. Schema normalization does **not** perform retroactive layout inference from absolute coordinates; inference occurs strictly during live browser capture traversal.

### 2.2 Semantic Auto Layout Types
```ts
export interface AutoLayoutPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AutoLayout {
  type: "flex";
  direction: "horizontal" | "vertical";
  gap: number;
  padding: AutoLayoutPadding;
  primaryAlign: "start" | "center" | "end" | "space-between";
  crossAlign: "start" | "center" | "end" | "stretch";
  primarySizing?: "fixed" | "hug" | "fill";
  crossSizing?: "fixed" | "hug" | "fill";
  confidence: "high";
}

export interface AutoLayoutChild {
  grow?: boolean;
  stretch?: boolean;
  positioning?: "auto" | "absolute";
}
```

---

## 3. Capture Engine Inference Architecture & Geometry Guard

### 3.1 Single-Pass Traversal
The capture engine caches computed styles and layout bounds in a single pass over the DOM, avoiding duplicate style calculations. As each element's frame is finalized, `analyzeFlexContainer` inspects the element and its direct children.

### 3.2 Supported Flexbox Subset
- `display: flex` and `inline-flex`
- `flex-direction: row` (horizontal) and `column` (vertical)
- `flex-wrap: nowrap`
- Fixed numeric pixel `gap`, `row-gap`, and `column-gap`
- `justify-content`: `flex-start`, `start`, `center`, `flex-end`, `end`, `space-between`
- `align-items`: `flex-start`, `start`, `center`, `flex-end`, `end`, `stretch`
- Child `align-self: stretch` (mapped to `stretch: true`)
- Child `flex-grow: 1` (mapped to `grow: true`)
- Child `position: absolute` (mapped to `positioning: "absolute"`)

### 3.3 Deferred Warning Taxonomy
Any feature outside this subset triggers immediate fallback to absolute positioning, emitting an explicit diagnostic warning:
- `AUTO_LAYOUT_WRAP_DEFERRED`: Multi-line flex wrapping (`flex-wrap: wrap | wrap-reverse`).
- `AUTO_LAYOUT_REVERSE_DEFERRED`: Reverse directions (`row-reverse | column-reverse`).
- `AUTO_LAYOUT_MARGIN_DEFERRED`: Flow children with non-zero margins (`margin > 0`).
- `AUTO_LAYOUT_ORDER_DEFERRED`: Visual reordering (`order !== 0`).
- `AUTO_LAYOUT_BASELINE_DEFERRED`: Baseline alignment (`align-items: baseline` or `align-self: baseline`).
- `AUTO_LAYOUT_GROW_RATIO_DEFERRED`: Arbitrary or fractional `flex-grow` ratios (`flex-grow > 1`).
- `AUTO_LAYOUT_POSITION_OFFSET_DEFERRED`: Relative-positioned flow children with non-zero offsets (`top`, `left`, etc.).
- `AUTO_LAYOUT_GEOMETRY_MISMATCH`: Predicted positions deviate by $> 0.5\text{px}$ from actual layout coordinates.
- `GRID_LAYOUT_SEMANTICS_DEFERRED`: `display: grid` or `inline-grid` (CSS Grid semantics deferred).

### 3.4 Geometry Prediction Guard & Box Model Reconciliation
Before emitting `layout`, `analyzeFlexContainer` executes `predictAutoLayoutGeometry`:
1. **Border Insets (`strokesIncludedInLayout`)**: In CSS, borders wrap padding and content. In Figma Auto Layout, borders overlap content unless `strokesIncludedInLayout = true`. The prediction engine insets border widths into effective padding so predicted child coordinates match browser border-box offsets exactly.
2. **Transformed Descendants**: Transformed children have rotated visual AABBs in `getBoundingClientRect()`. The engine measures local layout positions (`offsetLeft`/`offsetTop` or mathematically reconstructed `baseBounds`), avoiding false rejections due to visual bounding box expansion.
3. **$\le 0.5\text{px}$ Error Bound**: Predicted flow coordinates $(X_{\text{pred}}, Y_{\text{pred}})$ are compared against actual captured coordinates $(X_{\text{act}}, Y_{\text{act}})$. If any flow child deviates by $> 0.5\text{px}$, the container is rejected (`AUTO_LAYOUT_GEOMETRY_MISMATCH`) and preserved as an absolute frame.

---

## 4. Figma Renderer & Host Simulation

### 4.1 Native Auto Layout Mapping
When rendering a `FrameNode` with `layout`:
1. `layoutMode` is set to `"HORIZONTAL"` or `"VERTICAL"`.
2. `itemSpacing` is set to `layout.gap`.
3. `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` are assigned.
4. `primaryAxisAlignItems` is mapped:
   - `start` $\to$ `"MIN"`
   - `center` $\to$ `"CENTER"`
   - `end` $\to$ `"MAX"`
   - `space-between` $\to$ `"SPACE_BETWEEN"`
5. `counterAxisAlignItems` is mapped:
   - `start` / `stretch` $\to$ `"MIN"`
   - `center` $\to$ `"CENTER"`
   - `end` $\to$ `"MAX"`
6. `primaryAxisSizingMode` and `counterAxisSizingMode` are set to `"FIXED"` (or `"AUTO"` for hug).
7. If the frame has border styles, `strokesIncludedInLayout = true` is set.
8. Children are created in DOM flow order:
   - `positioning: "absolute"` $\to$ `child.layoutPositioning = "ABSOLUTE"` (placed at captured local x/y).
   - `grow: true` $\to$ `child.layoutGrow = 1`.
   - `stretch: true` $\to$ `child.layoutAlign = "STRETCH"`.
   - Flow children rely on native Figma Auto Layout positioning.
9. Post-layout 2D transforms and rotations are applied cleanly.

### 4.2 Absolute Layout Fallback Contract
When `node.layout === undefined`:
- `layoutMode` remains `"NONE"`.
- Every child is placed using parent-local absolute coordinates.
- Output is 100% bit-equivalent to W2D-016.

### 4.3 FakeFigmaHost Auto Layout Simulation
`FakeFrameNode` implements complete geometric simulation of Figma Auto Layout:
- Accurately computes primary axis distributions (`MIN`, `CENTER`, `MAX`, `SPACE_BETWEEN`) with gap and padding.
- Accurately computes cross axis alignments (`MIN`, `CENTER`, `MAX`, `STRETCH`).
- Simulates `layoutGrow = 1`, `layoutAlign = "STRETCH"`, and `layoutPositioning = "ABSOLUTE"`.
- Accommodates `strokesIncludedInLayout`.

---

## 5. Controlled Fixture Coverage (`fidelity-auto-layout.html`)

The 35 required test scenarios were authored in `apps/extension/fixtures/fidelity-auto-layout.html`:
1. Simple horizontal row (3 fixed items, gap: 12px, padding: 16px).
2. Simple vertical column (3 fixed items, gap: 8px, padding: 12px).
3. Primary alignment: start (`justify-content: flex-start`).
4. Primary alignment: center (`justify-content: center`).
5. Primary alignment: end (`justify-content: flex-end`).
6. Primary alignment: space-between (`justify-content: space-between`).
7. Counter alignment: start (`align-items: flex-start`).
8. Counter alignment: center (`align-items: center`).
9. Counter alignment: end (`align-items: flex-end`).
10. Counter alignment: stretch (`align-items: stretch`).
11. Mixed child sizes in horizontal row.
12. Single child flex container.
13. Child with `flex-grow: 1` (`layoutGrow = 1`).
14. Child with `align-self: stretch` (`layoutAlign = "STRETCH"`).
15. Absolute child inside flex container (`layoutPositioning = "ABSOLUTE"`).
16. Multiple absolute children with z-index ordering.
17. Nested horizontal inside vertical Auto Layout.
18. Nested vertical inside horizontal Auto Layout.
19. Auto Layout container with solid fills and rounded corners.
20. Auto Layout container with border insets (`strokesIncludedInLayout`).
21. Auto Layout container with drop shadow.
22. Auto Layout container with container clipping (`overflow: hidden`).
23. Auto Layout container with 2D rotation.
24. Transformed child inside Auto Layout container.
25. Inline text child (single-TextNode) in Auto Layout.
26. Image child (`<img>`) in Auto Layout.
27. SVG vector child (`<svg>`) in Auto Layout.
28. Synthetic pseudo-elements (`::before`/`::after`) in Auto Layout.
29. Deferred case: flex-wrap (`flex-wrap: wrap`).
30. Deferred case: reverse direction (`flex-direction: row-reverse`).
31. Deferred case: non-zero item margins (`margin-right: 10px`).
32. Deferred case: visual item reordering (`order: 2`).
33. Deferred case: baseline alignment (`align-items: baseline`).
34. Deferred case: relative position offset (`top: 10px`).
35. Deferred case: CSS Grid container (`display: grid`).

All 35 scenarios were verified through Chrome extension smoke capture and Figma renderer golden baselines.

---

## 6. Real-Site Spot Check & Coverage Accounting Reconciliation

Automated headless Chrome capture and Figma renderer execution across 4 representative production sites (`scripts/spot-check-auto-layout.mjs` and `scripts/diagnose-flex-accounting.mjs`):

### 6.1 Reconciled Multi-Stage Funnel

To avoid conflating raw DOM elements with eligible layout containers, the flex container population was reconciled across all 8 stages:

| Stage | React Docs (`react.dev`) | Vite Portal (`vite.dev`) | Tailwind CSS (`tailwindcss.com`) | Wikipedia (`en.wikipedia.org`) | Total |
|---|---|---|---|---|---|
| **1. DOM Flex Elements Observed** | 346 | 192 | 155 | 142 | **835** |
| **2. Unrendered / Hidden / Zero-size** | 18 | 42 | 2 | 93 | **155** |
| **3. Fixed / Sticky (Omitted from Flow)** | 0 | 0 | 3 | 0 | **3** |
| **4. Leaf / Empty (0 element children)** | 15 | 5 | 1 | 2 | **23** |
| **5. Container Frame Candidates** | **313** | **145** | **149** | **47** | **654** |
| **6. Explicitly Deferred by Flex Rules** | 87 | 5 | 5 | 7 | **104** |
| — Non-zero item margins (`margin > 0`) | 82 | 5 | 5 | 4 | 96 |
| — Flex wrap (`wrap | wrap-reverse`) | 1 | 0 | 0 | 3 | 4 |
| — Multi-item grow ratios (`flex-grow > 1`) | 4 | 0 | 0 | 0 | 4 |
| **7. Eligible Candidates for Guard Check** | **226** | **140** | **144** | **40** | **550** |
| **8. High-Confidence Inferred Frames** | **131** | **103** | **66** | **17** | **317** |
| — Horizontal Rows | 103 | 82 | 48 | 16 | 249 |
| — Vertical Columns | 28 | 21 | 18 | 1 | 68 |
| **9. Geometry Guard Rejected ($> 0.5\text{px}$)** | 95 | 37 | 78 | 23 | **233** |

### 6.2 Key Inference Metrics
- **Inference rate among eligible candidates evaluated**: **57.6%** (317 / 550)
- **Inference rate among container frame candidates**: **48.5%** (317 / 654)
- **Raw ratio against unpruned DOM elements**: 38.0% (317 / 835) — *Note: 835 includes 155 hidden/unrendered elements (such as collapsed Wikipedia drawer/mobile menus), 3 fixed navigation bars, and 23 leaf elements.*
- **Document Warning Deduplication**: In Web2Design's capture engine, diagnostic warnings are deduplicated to at most one entry per code per document by design (`warned.has(code)` in `capture.ts`), preventing megabytes of repetitive warning payloads on large production pages.

### 6.3 Real-Site Renderer Execution Summary
- **Native Figma Auto Layout Frames Created**: **317**
- **Absolute Fallback Frames**: **1,231**
- **Schema Validity (V0.7)**: **100% (4/4 PASS)**
- **Skipped Nodes**: **0**
- **Average Capture Duration**: **432ms**

Evidence artifacts are saved in `docs/evidence/w2d-017/`.

---

## 7. Automated Test & Fidelity Suite Results

### 7.1 Test Suite Breakdown
| Package | Tests | Status |
|---|---|---|
| `@web2design/design-schema` | 106 | ✅ PASS |
| `@web2design/capture-engine` | 176 | ✅ PASS |
| `@web2design/figma-renderer` | 129 | ✅ PASS |
| `@web2design/extension` | 21 | ✅ PASS |
| `@web2design/figma-plugin` | 48 | ✅ PASS |
| `@web2design/test-fixtures` | 28 | ✅ PASS |
| **Total Automated Tests** | **508** | **✅ PASS** |

### 7.2 Extension Rendered Smoke Checks
- **13 Fixture Pages**
- **225 Rendered Fidelity Checks**
- **`automatedRenderedChromeSmoke: PASS`**

### 7.3 Fidelity Regression Suite (20 Fixtures)
- **Fixtures evaluated**: 20
- **Nodes compared**: 669
- **Geometry assertions**: 2,676
- **Transform assertions**: 35
- **Style assertions**: 2,093
- **Text assertions**: 165
- **Rich-text range checks**: 84
- **Asset assertions**: 12
- **Auto Layout checks**: 121
- **Expected warnings**: 32
- **Unexpected warnings**: 0
- **Fidelity failures**: 0
- **Determinism**: Verified 2 consecutive runs with identical bit-for-bit results.

---

## 8. Verification Classification (Section 92)

1. **Unit and Integration Test Suites**: `PASS` (508/508 tests passing).
2. **Typecheck & Linting**: `PASS` (TypeScript `tsc --noEmit` and ESLint 0 errors, 0 warnings across all packages).
3. **Chrome Extension Smoke Suite**: `PASS` (225 rendered checks across 13 pages).
4. **Fidelity Regression Suite**: `PASS` (20/20 fixtures passing, 0 unexpected warnings, 0 failures, 121 Auto Layout assertions).
5. **Real-Site Spot Check**: `PASS` (4 production sites, 835 flex containers, 317 inferred Auto Layout frames, 0 skipped nodes).
6. **W2D-009 Interactive Figma Desktop GUI Gate**: `NOT AVAILABLE` / Pending manual verification in real Figma desktop environment.
