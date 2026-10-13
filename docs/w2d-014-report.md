# W2D-014 Completion Report — Container Clipping / `overflow: hidden` / `overflow: clip`

## 1. Repository Before Work

- **Branch**: `main`
- **HEAD**: `8cd690f` (`feat(styles): implement W2D-013 non-uniform borders and multi/inset shadows`)
- **Git Status**: Clean working tree before starting W2D-014.

---

## 2. Executive Summary & Verification Classification

W2D-014 introduces **Design Schema V0.4**, establishing explicit container clipping semantics across the complete pipeline:

```text
Rendered CSS
    ↓
capture-engine
    ↓
Design Schema V0.4 (FrameNode.clip = { x: boolean, y: boolean })
    ↓
figma-renderer
    ↓
native Figma FrameNode.clipsContent
```

### Verification Classification Matrix (Section 59)

| Requirement Dimension | Evaluation Result | Notes / Details |
|---|:---:|---|
| Existing W2D regression | **PASS** | 0 regressions across all previous W2D features (gradients, borders, shadows, pseudo-elements, assets, geometry). |
| V0.1 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.1"` inputs without wire schema modification. |
| V0.2 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.2"` inputs without wire schema modification. |
| V0.3 parser compatibility | **PASS** | `parseDesignDocument()` and `safeParseDesignDocument()` accept `"0.3"` inputs without wire schema modification. |
| V0.1 → V0.4 normalization | **PASS** | Upgrades V0.1 documents to V0.4; historical omitted clipping translates to unclipped frame semantics (`clip: undefined`). |
| V0.2 → V0.4 normalization | **PASS** | Preserves all gradient fills while upgrading schema structure to V0.4. |
| V0.3 → V0.4 normalization | **PASS** | Preserves all per-side border and multi/inset shadow stacks while upgrading to V0.4. |
| V0.4 strict validation | **PASS** | Strict schema validation; rejects unknown fields, invalid types (`clip.x = "yes"`, `clip.y = 1`), clip on leaf nodes, and unknown versions (`"0.5"`). |
| New producer version == 0.4 | **PASS** | `DESIGN_SCHEMA_VERSION = "0.4"`; all newly captured documents emit `"0.4"`. |
| `overflow: hidden` capture | **PASS** | Chromium computed `overflowX` / `overflowY` mapped to `clip: { x: true, y: true }`. |
| `overflow: clip` capture | **PASS** | Chromium computed `overflowX` / `overflowY` mapped to `clip: { x: true, y: true }`. |
| X-axis-only clipping | **APPROXIMATED** | Captured accurately as `clip: { x: true, y: false }`; renderer approximates containment with `clipsContent = true` and emits `AXIS_CLIP_APPROXIMATED`. |
| Y-axis-only clipping | **APPROXIMATED** | Captured accurately as `clip: { x: false, y: true }`; renderer approximates containment with `clipsContent = true` and emits `AXIS_CLIP_APPROXIMATED`. |
| Partial child overflow | **PASS** | Non-destructive: child preserves uncropped dimensions and document coordinates; Figma Frame clips visually. |
| Fully clipped child preservation | **PASS** | Child nodes outside container bounds remain fully preserved in schema and Figma node tree for complete user editability. |
| Negative/outside child geometry preservation | **PASS** | Negative and offscreen child coordinates remain unclamped and unmodified. |
| Nested clipping | **PASS** | Outer and inner clipping containers maintain their clip properties independently without flattening. |
| Rounded clipping | **PASS** | Native `FrameNode.clipsContent = true` with `cornerRadius` clips descendants smoothly to the rounded boundary without vector masks. |
| Image clipping | **PASS** | Oversized images inside rounded or rectangular clipping frames preserve full source dimensions. |
| Pseudo clipping integration | **PASS** | Synthetic `::before` and `::after` elements that overflow are clipped naturally by their owner frame's clipping boundary. |
| Gradient regression | **PASS** | Linear and radial gradients on clipping frames and their descendants remain 100% stable. |
| Border regression | **PASS** | Non-uniform borders on clipping frames preserve stroke weights and styles without regression. |
| Multi/inset-shadow regression | **PASS** | Container's outer drop-shadows and inset shadows survive without being clipped by the container's own `clipsContent`. |
| Native Figma clipsContent | **PASS** | Directly sets `frame.clipsContent = true` for clipped containers, `false` for unclipped frames; maintains `layoutMode = "NONE"`. |
| Scroll-container semantics | **DEFERRED** | `overflow: auto` and `overflow: scroll` preserve current visual bounds and emit `SCROLL_CONTAINER_CLIPPING_DEFERRED`. |
| `overflow-clip-margin` | **DEFERRED** | Standard container bounds used; non-default margins emit `OVERFLOW_CLIP_MARGIN_UNSUPPORTED`. |
| Chrome clipping fixture | **PASS** | 22 comprehensive scenarios in `fidelity-clipping.html` passed with 25 new rendered assertions. |
| Fidelity run #1 | **PASS** | 17 fixtures, 319 nodes compared, 1,276 geom, 798 style, 60 text, 10 asset, 18 expected warnings, 0 unexpected warnings, 0 failures. |
| Fidelity run #2 | **PASS** | 100% identical to run #1, verifying deterministic baseline stability. |
| Real-site clipping spot check | **PASS** | Spot-checked `react.dev`, `tailwindcss.com`, and `nodejs.org`: captured 93 clipping frames rendered to native Figma `clipsContent`. |
| Interactive Figma visual clipping | **NOT AVAILABLE** | W2D-009 interactive gate remains independent; pending manual interactive Figma Desktop session. |

---

## 3. Schema Migration Flow

Design Schema V0.4 provides a single normalized target while maintaining full read compatibility for historical captures:

```text
0.1 ─┐
0.2 ─┤
0.3 ─┼─ parse supported version
0.4 ─┘
       ↓
normalizeDesignDocument()
       ↓
LatestDesignDocument (V0.4)
```

### Migration Semantics

- **V0.1 Documents**:
  - `fills`: Solid fills migrated to V0.4 fill array.
  - `border`: Uniform `width: number` upgraded to 4-side `BordersV04` with style `"solid"`.
  - `boxShadow`: Single shadow upgraded to `boxShadows: [BoxShadowV04]`.
  - `clip`: Absent clipping information translates to `clip: undefined` (no descendant clipping).
- **V0.2 Documents**:
  - `fills`: Gradient fills preserved bit-for-bit.
  - `border` & `boxShadow`: Upgraded to per-side borders and ordered shadow arrays.
  - `clip`: Absent clipping information translates to `clip: undefined`.
- **V0.3 Documents**:
  - All per-side border styles, colors, and multi/inset shadow stacks preserved unchanged.
  - `clip`: Absent clipping information translates to `clip: undefined`.
- **V0.4 Documents**:
  - Parsed directly with strict validation.

Unknown schema versions (such as `"0.5"`, `"1.0"`) are strictly rejected by `parseDesignDocument()` and `safeParseDesignDocument()`.

---

## 4. V0.4 Clipping Model

Clipping is modeled as a container property exclusively on `FrameNode`:

```ts
export const ClipBehaviorSchema = z.object({
  x: z.boolean(),
  y: z.boolean(),
}).strict();

export type ClipBehavior = z.infer<typeof ClipBehaviorSchema>;

export interface FrameNode extends BaseNode {
  type: "frame";
  clip?: ClipBehavior;
  children: DesignNode[];
}
```

### Critical Architecture Rules

1. **Renderer-Neutral**: Schema stores browser clipping intent per axis (`x: boolean, y: boolean`), not Figma's single boolean `clipsContent`.
2. **Container-Only**: Leaf nodes (`RectangleNode`, `TextNode`, `ImageNode`, `SvgNode`) strictly forbid the `clip` property.
3. **Strict Validation**: Zod schema rejects invalid types (e.g. string/numeric flags) and extraneous properties (`strict()`).

---

## 5. Capture Semantics

Computed styles from Chromium are inspected directly without author shorthand reconstruction:

```ts
const effOverflowX = style.overflowX || style.overflow || "visible";
const effOverflowY = style.overflowY || style.overflow || "visible";

const clipX = effOverflowX === "hidden" || effOverflowX === "clip";
const clipY = effOverflowY === "hidden" || effOverflowY === "clip";
const hasClip = clipX || clipY;
```

### Capture Diagnostics

- **Scroll Containers**: Elements with `overflow: auto` or `overflow: scroll` (not resulting from forced browser conversion of single-axis `overflow: hidden`) emit `SCROLL_CONTAINER_CLIPPING_DEFERRED`.
- **Clip Margin**: Non-default `overflow-clip-margin` on clipping containers emits `OVERFLOW_CLIP_MARGIN_UNSUPPORTED`.
- **Clip Path**: Any `clip-path !== "none"` emits `CLIP_PATH_UNSUPPORTED`.
- **Transform**: Transformed descendants interacting with clipping retain `TRANSFORM_APPROXIMATED`.

---

## 6. Non-Destructive Geometry & Child Preservation

**Clipping is strictly non-destructive in Web2Design.**

1. **Full Geometry Retained**: If a child extends outside container bounds (e.g., container 140×70, child at x=111, width=70), the schema child preserves `width = 70` and `x = container.x + 111`.
2. **Fully Outside Descendants**: Even if a child lies completely outside the parent container (e.g., at x=161, y=101), it is preserved in the schema tree and in Figma. Native Figma `clipsContent = true` hides it visually from the canvas, but the designer can reveal or reposition it at any time.
3. **Negative Coordinates**: Descendants positioned at negative relative offsets (e.g. `left: -20px`) retain their true negative offsets without clamping.

---

## 7. Wrapper Pruning & Meaningful Container Retention

A container element that has no background, border, or text might otherwise be pruned as an unstyled empty wrapper. However, if it clips overflowing descendants, it is semantically essential.

In `capture.ts`:

```ts
const hasMeaningfulClip = hasClip && (contentChildren.length > 0 || beforeNodes.length > 0);

const isFrame = decision === "capture" && (contentChildren.length > 0 || beforeNodes.length > 0) &&
  (groups.has(tag) || styled || base.opacity < 1 || hasMeaningfulClip || tag === "div" && (contentChildren.length > 1 || beforeNodes.length > 0));
```

- An unstyled container with `overflow: hidden` and descendants is **preserved as a `FrameNode`**.
- Leaf elements with `overflow: hidden` but no descendants and no visual styles are safely pruned to prevent unnecessary layer inflation.

---

## 8. Figma Renderer Mapping

The renderer maps schema clipping behavior to native Figma properties:

| Schema State | Figma Mapping | Diagnostic Warning | Rationale |
|---|---|---|---|
| `clip.x && clip.y` | `frame.clipsContent = true` | None | Exact native Figma frame clipping support. |
| `!clip.x && !clip.y` | `frame.clipsContent = false` | None | Exact native Figma unclipped descendant behavior. |
| `clip.x && !clip.y` | `frame.clipsContent = true` | `AXIS_CLIP_APPROXIMATED` | Figma lacks per-axis clipping; clipping both axes prevents layout leakage while explicitly notifying the user. |
| `!clip.x && clip.y` | `frame.clipsContent = true` | `AXIS_CLIP_APPROXIMATED` | Figma lacks per-axis clipping; clipping both axes prevents layout leakage while explicitly notifying the user. |

- Layout Mode is strictly preserved: `frame.layoutMode = "NONE"`. Auto Layout is not introduced.
- Child nodes are never cropped, resized, or rasterized.

---

## 9. Feature Interactions & Regressions

1. **Rounded Clipping**: Containers with `border-radius: 20px` and `overflow: hidden` render with `frame.cornerRadius = 20` and `frame.clipsContent = true`. Native Figma frames clip descendants to the rounded boundary. No mask vector layers are introduced.
2. **Gradients + Clipping**: Containers with `linear-gradient` fills, rounded corners, and overflowing children render native `GRADIENT_LINEAR` paints alongside `clipsContent = true`.
3. **Borders + Clipping**: Non-uniform border widths (`strokeTopWeight`, etc.) on clipping frames are rendered accurately without modification.
4. **Shadows + Clipping**: Container outer `DROP_SHADOW` and `INNER_SHADOW` effects remain intact on the frame; `clipsContent` affects only descendants and does not clip the container's own outer shadow.
5. **Pseudo-Elements**: Synthetic `::before` and `::after` elements overflowing their owner container are clipped naturally by the owner frame's `clipsContent`.

---

## 10. Real-Site Spot Check Results

Live evaluation was executed using `scripts/spot-check-clipping.mjs` via Chrome CDP against representative public sites:

| Site | W2D-010 Clips | DOM Both-Axis | DOM Single-Axis | DOM Scroll | Schema Clips | Native Figma clipsContent | Axis Approx Warn | Scroll Warn | Nodes | Capture Time |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **React Docs** (`react.dev`) | 112 | 199 | 9 | 12 | 43 | 43 | 9 | 1 | 1,170 | 457ms |
| **Tailwind CSS** (`tailwindcss.com`) | 74 | 170 | 1 | 6 | 48 | 48 | 1 | 1 | 1,156 | 450ms |
| **Node.js Portal** (`nodejs.org/en`) | 42 | 29 | 5 | 11 | 2 | 2 | 1 | 1 | 258 | 136ms |

### Key Spot-Check Findings

- **93 clipping containers** captured across the 3 sites and rendered into native Figma `FrameNode.clipsContent = true`.
- Both-axis clipping represented exactly: 82 containers (34 on React, 47 on Tailwind, 1 on Node.js).
- Single-axis clipping gracefully approximated: 11 containers with explicit `AXIS_CLIP_APPROXIMATED` diagnostics.
- Scroll containers deferred: 1 diagnostic warning per site (`SCROLL_CONTAINER_CLIPPING_DEFERRED`).
- Schema validity: **100% valid under Design Schema V0.4**.
- Zero crashes, zero node drops, and capture performance under 500ms even on complex pages.

---

## 11. Controlled Fixtures & Fidelity Benchmark

A new comprehensive fixture `apps/extension/fixtures/fidelity-clipping.html` was created covering 22 scenarios:

1. `overflow: hidden` both axes
2. `overflow: clip` both axes
3. `overflow: visible` (no clipping)
4. Child partly outside right edge (uncropped bounds)
5. Child partly outside bottom edge (uncropped bounds)
6. Child completely outside parent (full preservation)
7. Negative child x/y coordinates
8. Nested clipping containers (outer + inner independent)
9. Rounded overflow-hidden card
10. Image clipped by rounded frame
11. Gradient fill + clipping interaction
12. Non-uniform border + clipping interaction
13. Outer box-shadow + clipping interaction
14. Pseudo-element `::before` overflowing owner
15. Pseudo-element `::after` overflowing owner
16. Absolute positioned child bounds
17. X-axis-only clipping (`overflow-x: hidden; overflow-y: visible`)
18. Y-axis-only clipping (`overflow-x: visible; overflow-y: hidden`)
19. Scroll container `overflow: auto` warning
20. Scroll container `overflow: scroll` warning
21. `overflow-clip-margin` warning
22. Transformed overflowing child retaining transform warning

### Automated Metrics Comparison

| Metric | Before W2D-014 (W2D-013) | After W2D-014 | Change |
|---|:---:|:---:|:---:|
| **Automated Unit & Integration Tests** | 400 | **420** | +20 tests |
| **Rendered Chrome Smoke Checks** | 97 | **122** | +25 checks |
| **Rendered Fixture Pages** | 9 | **10** | +1 page |
| **Fidelity Regression Fixtures** | 16 | **17** | +1 fixture |
| **Nodes Compared in Fidelity** | 254 | **319** | +65 nodes |
| **Geometry Assertions** | 1,016 | **1,276** | +260 assertions |
| **Style Assertions** | 511 | **798** | +287 assertions |
| **Text Assertions** | 60 | **60** | Unchanged |
| **Asset Assertions** | 10 | **10** | Unchanged |
| **Expected Fidelity Warnings** | 13 | **18** | +5 warnings |
| **Unexpected Warnings** | 0 | **0** | Zero unexpected |
| **Fidelity Failures** | 0 | **0** | Zero failures |

---

## 12. Schema Producer & Consumer State

- **Current Producer Version**: `"0.4"`
- **Supported Input Versions**: `"0.1"`, `"0.2"`, `"0.3"`, `"0.4"`
- **Rejected Versions**: `"0.5"`, `"1.0"`, and all unknown strings.

---

## 13. W2D-009 Interactive Figma Desktop Gate

The interactive Figma Desktop GUI validation gate (W2D-009) remains **NOT AVAILABLE / pending**. All verification in W2D-014 was conducted via automated in-memory `FakeFigmaHost` and headless Chrome CDP. True on-canvas Figma visual rasterization requires manual Figma Desktop validation.

---

## 14. Known Limitations

1. **Single-Axis Figma Limitation**: Figma exposes only a single boolean `clipsContent` per FrameNode. Single-axis clipping (`overflow-x: hidden; overflow-y: visible`) clips both axes in Figma and emits `AXIS_CLIP_APPROXIMATED`.
2. **Scroll Containers Deferred**: `overflow: auto` and `overflow: scroll` are not modeled as interactive Figma prototype scroll areas; visual clipping is deferred with `SCROLL_CONTAINER_CLIPPING_DEFERRED`.
3. **`overflow-clip-margin`**: Non-default clip margins are deferred with `OVERFLOW_CLIP_MARGIN_UNSUPPORTED`.
4. **CSS `clip-path` & CSS Masks**: Vector path clipping and raster masking remain out of scope (`CLIP_PATH_UNSUPPORTED`).

---

## 15. Important Files Changed

- `packages/design-schema/src/version.ts`: Added V0.4 constants and supported versions.
- `packages/design-schema/src/nodes.ts`: Added `ClipBehaviorSchema` and `FrameNode.clip`.
- `packages/design-schema/src/document.ts`: Added `DesignDocumentV04Schema` and normalization to V0.4.
- `packages/design-schema/src/api.ts`: Updated parser dispatch for V0.1–V0.4.
- `packages/capture-engine/src/capture.ts`: Captured computed overflow per axis and preserved clipping containers.
- `packages/figma-renderer/src/renderer.ts`: Mapped frame clipping to `clipsContent` and emitted `AXIS_CLIP_APPROXIMATED`.
- `packages/figma-renderer/src/fidelity/normalizer.ts`: Recorded `clipsContent` on normalized nodes.
- `packages/figma-renderer/src/fidelity/comparator.ts`: Compared clipping semantics.
- `packages/figma-renderer/src/fidelity/manifest.ts`: Added `chrome-clipping` fixture.
- `packages/figma-renderer/golden/chrome-clipping.golden.json`: Golden baseline for container clipping.
- `apps/extension/fixtures/fidelity-clipping.html`: 22-scenario controlled clipping fixture.
- `apps/extension/scripts/smoke.mjs`: Added 25 rendered clipping checks.
- `scripts/spot-check-clipping.mjs`: Real-site clipping evaluator.

---

## 16. Recommended Next Task

With container clipping semantics fully implemented, verified, and locked in regression baselines:

**Recommended Next Task: W2D-015 — CSS Transforms + Rotation**
- 2D transformation matrices, translation, scaling, skewing, and rotation.
- Converting CSS transforms to Figma node position and `rotation` angle.
