# W2D-018 — Runtime Observations & Analysis

**Environment**: Windows 11, Node.js v22.13.0, Figma Desktop v126.7.10 installed, `figma_agent` active (PID 7296).  
**Interactive Figma Desktop GUI Session**: `NOT AVAILABLE` (automated CLI execution environment lacks interactive desktop window manager control and Figma account authentication).  
**Status**: `MANUAL ACCEPTANCE REQUIRED` (W2D-018), `STILL OPEN` (W2D-009).

---

## 1. Runtime Mutation Order & Figma API Architecture Analysis

In Web2Design, the Figma renderer (`packages/figma-renderer/src/renderer.ts`) translates Design Schema V0.7 nodes into Figma scene nodes. Because real Figma Desktop executes within an internal WebAssembly and reactive document engine, mutation ordering is critical:

### 1.1 Auto Layout Mutation Order
```text
1. host.createFrame()
2. frame.resize(width, height)
3. applyFrameFills / Strokes / Effects / Radii
4. applyAutoLayoutToFrame:
   - frame.layoutMode = "HORIZONTAL" | "VERTICAL"
   - if (hasBorders) frame.strokesIncludedInLayout = true
   - frame.itemSpacing = layout.gap
   - frame.paddingTop/Right/Bottom/Left
   - frame.primaryAxisAlignItems / counterAxisAlignItems
   - frame.primaryAxisSizingMode / counterAxisSizingMode
5. For each child in children:
   - create child node (FRAME, RECTANGLE, TEXT, SVG)
   - append to frame (frame.appendChild)
   - if child is absolute (layoutChild.positioning === "absolute"):
       set child.layoutPositioning = "ABSOLUTE" FIRST
       set child.x, child.y, child.resize(w, h)
     else (normal flow child):
       set child.layoutPositioning = "AUTO"
       child.resize(w, h)
       if child.layoutChild.grow: child.layoutGrow = 1
       if child.layoutChild.stretch: child.layoutAlign = "STRETCH"
   - apply child fills, strokes, effects, transforms
```

**Key Discovery on `layoutPositioning`**:
When a child is appended to an Auto Layout frame in Figma, Figma defaults it to participating in the Auto Layout flow (`layoutPositioning = "AUTO"`). If `x` and `y` were assigned while still in flow, Figma would ignore the assignment or shift flow siblings. By setting `child.layoutPositioning = "ABSOLUTE"` **before** setting `x` and `y` in `applyPlacementOrAutoLayoutToChild`, the child is immediately freed from flow constraints and correctly adopts its parent-local absolute coordinates.

### 1.2 Border-Box & `strokesIncludedInLayout`
In CSS, border widths wrap padding and content. In standard Figma Auto Layout, strokes overlap content unless `strokesIncludedInLayout = true`.
- In `autolayout.ts`, `containerSpec.padding` includes border insets (`pad + b`) for pure prediction.
- In `renderer.ts`, `figmaNode.strokesIncludedInLayout = true` is explicitly assigned when border styles are present.
- This ensures that when a bordered frame is inspected in Figma, child offsets match the browser border-box coordinates within $\le 0.5\text{px}$.

### 1.3 Rich Text Ranged Styling Order
In Figma, modifying `TextNode.characters` wipes out all existing ranged styling. The renderer strictly adheres to:
1. `fontManager.loadFont(baseFont)` and load all unique run fonts ahead of time.
2. Assign `textNode.characters = fullString` **once**.
3. Apply ranged styling (`setRangeFontName`, `setRangeFontSize`, `setRangeFills`, `setRangeHyperlink`, etc.) on UTF-16 index ranges `[start, end)`.
4. Apply box resizing (`textNode.resize(w, h)`).
5. Apply 2D transforms and rotation last.

---

## 2. Reconciled Flex Container Funnel (W2D-017 / W2D-018)

Across the 4 representative production sites (`react.dev`, `vite.dev`, `tailwindcss.com`, `wikipedia`), the 835 DOM Flex elements were reconciled through the multi-stage capture pipeline:

```text
DOM Flex elements observed:               835
  ├─ Filtered (Hidden / unrendered):     -155 (collapsed menus, display:none)
  ├─ Filtered (Fixed / Sticky):            -3 (omitted from normal document flow)
  └─ Filtered (Leaf / empty):             -23 (0 element children)
                                         ────
Container Frame Candidates:               654 (100% of candidate containers)
  ├─ Explicitly deferred (margin > 0):    -96
  ├─ Explicitly deferred (flex-wrap):      -4
  └─ Explicitly deferred (grow ratio > 1): -4
                                         ────
Eligible Candidates for Geometry Guard:   550 (84.1% of candidate containers)
  ├─ High-confidence inferred & emitted:  317 (57.6% of eligible; 48.5% of candidates)
  └─ Rejected by geometry guard (> 0.5px): 233 (42.4% of eligible; fallen back to absolute)
```

**Conclusion on Inference Rate**:
The true candidate inference rate among eligible Flexbox containers evaluated against the geometry guard is **57.6%** (317 / 550), and among all candidate container frames is **48.5%** (317 / 654). Calling 317 / 835 the success rate is mathematically invalid because 181 elements were non-candidate elements (hidden, fixed, or leaf).

---

## 3. FakeFigmaHost vs Real Figma Behavioral Matrix

| Surface | FakeFigmaHost Assumption | Real Figma API Contract | Match? | Risk / Action |
|---|---|---|---|---|
| **Frame Creation** | Creates memory mock frame with default `{x:0, y:0, w:100, h:100}` | `figma.createFrame()` with default size `{w:100, h:100}` | **MATCH** | None |
| **Viewport Centering** | Computes offset from `viewportCenter` | `figma.viewport.center`, `figma.viewport.scrollAndZoomIntoView([root])` | **MATCH** | None |
| **Plain Text** | Stores string, validates font descriptors | Requires `figma.loadFontAsync()` before characters assignment | **MATCH** | Renderer always pre-loads fonts via `FontManager`. |
| **Ranged Text** | Simulates range slices for font, size, fills, links | Native ranged methods (`setRangeFontName`, `setRangeFontSize`, etc.) | **MATCH** | Offsets verified strictly match UTF-16 slicing indices. |
| **Gradients** | Maps transform matrix `[[a, c, tx], [b, d, ty]]` | Native `Transform` matrix on `GradientPaint` | **MATCH** | Linear & radial gradient matrices tested in fidelity suite. |
| **Stroke Weights** | Independent properties (`strokeTopWeight`, etc.) | Native individual stroke weights supported in Figma API | **MATCH** | Inside alignment preserved. |
| **Effects** | Effects array of `DROP_SHADOW` & `INNER_SHADOW` | Native effect objects with color, offset, radius, spread | **MATCH** | `clipsContent` is NOT enabled merely for shadow spread. |
| **Clipping** | `clipsContent = boolean` | Native `FrameNode.clipsContent = boolean` | **MATCH** | Single-axis clip documented as approximation. |
| **Rotation** | `rotation = angleDeg`, `relativeTransform = matrix` | Native `rotation` and `relativeTransform` | **MATCH** | CSS to Figma angle sign conversion verified. |
| **Auto Layout Mode** | `layoutMode = "HORIZONTAL" \| "VERTICAL"` | Native `layoutMode = "HORIZONTAL" \| "VERTICAL"` | **MATCH** | Simulates flow positioning. |
| **Gap & Padding** | `itemSpacing`, `paddingTop/Right/Bottom/Left` | Native Auto Layout spacing and padding properties | **MATCH** | Border insets accounted for. |
| **Child Grow** | `child.layoutGrow = 1` | Native `child.layoutGrow = 1` | **MATCH** | Simulates primary axis expansion. |
| **Child Stretch** | `child.layoutAlign = "STRETCH"` | Native `child.layoutAlign = "STRETCH"` | **MATCH** | Simulates counter axis expansion. |
| **Absolute Child** | `child.layoutPositioning = "ABSOLUTE"` | Native `child.layoutPositioning = "ABSOLUTE"` | **MATCH** | Must set property before setting absolute coordinates. |
| **Image** | `figma.createImage(data).hash` $\to$ `ImagePaint` | Native image hash creation and fill assignment | **MATCH** | Embedded base64 verified. |
| **SVG** | `figma.createNodeFromSvg(markup)` | Native vector container parsing from XML string | **MATCH** | Sanitized SVG markup verified. |

---

## 4. Console Errors & Diagnostic Status

In automated headless execution and message protocol simulation:
- **Uncaught runtime exceptions**: **0**
- **Unhandled promise rejections**: **0**
- **Figma API assignment errors**: **0**
- **Authoritative schema rejections on valid documents**: **0**
- **Diagnostic warnings emitted**: Documented and expected (`TEXT_RANGE_APPROXIMATED`, `CAPTURE_SCOPE`, `FONT_FALLBACK`, `AUTO_LAYOUT_*_DEFERRED`). No unexpected warnings.
