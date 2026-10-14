# Web2Design W2D-018 — Interactive Figma Desktop Manual Acceptance Checklist

**Version Under Test**: Web2Design Design Schema V0.7 / Plugin v0.1.0  
**Evaluator Environment**: Windows 11, Node.js 22.13.0, Figma Desktop v126.7.10  
**Status in Automated CLI**: `NOT AVAILABLE` / `MANUAL ACCEPTANCE REQUIRED`  
**Purpose**: This checklist provides the exact step-by-step instructions and acceptance criteria for a human reviewer with a live Figma Desktop session to execute interactive visual validation, inspect native layer editability, and close the W2D-009 / W2D-018 gates.

---

## 1. Setup & Plugin Manifest Import

### Prerequisites
1. Open Figma Desktop (v126+).
2. Create a fresh, disposable Design File (e.g. named `Web2Design-Acceptance`).
3. Ensure Developer Mode or Plugin Development is enabled in your Figma account.

### Step 1.1: Development Plugin Manifest Import
- In Figma Desktop, navigate to:  
  **Main Menu (Figma icon) $\to$ Plugins $\to$ Development $\to$ Import plugin from manifest...**
- Select the file:  
  `D:\Tool\html-to-design\apps\figma-plugin\dist\manifest.json`
- **Expected Result**: Figma adds `Web2Design` to your Development Plugins list without syntax or manifest errors.

### Step 1.2: Plugin Launch & Foundation Verification
- Navigate to: **Plugins $\to$ Development $\to$ Web2Design**.
- **Expected Result**:
  - The Web2Design plugin dialog opens smoothly.
  - The UI displays the Web2Design header, status banner, "Load Sample Document" button, JSON paste textarea, "Validate & Prepare" button, and disabled "Import to Figma" button.
  - No blank screens, no crashes, and developer console (`Ctrl+Shift+I` / `Right Click -> Inspect`) shows 0 uncaught errors.

---

## 2. Interactive Acceptance Matrix

| # | Feature / Test Surface | Test Scenario Payload | Verification Steps | Expected Result | Status |
|---|---|---|---|---|---|
| **1** | **Development Manifest Import** | `apps/figma-plugin/dist/manifest.json` | Import manifest in Figma Desktop. | Imports cleanly with name `Web2Design`, API `1.0.0`. | `NOT AVAILABLE` (CLI) |
| **2** | **Plugin Launch** | Plugin UI bundle | Launch plugin from menu. | UI opens cleanly; buttons, textarea, and status banner active. | `NOT AVAILABLE` (CLI) |
| **3** | **Canonical Sample** | Click "Load Sample Document" button | Click "Validate & Prepare", then "Import to Figma". | Creates root frame `Web2Design — Fixture` centered in viewport, containing 1 image child. | `NOT AVAILABLE` (CLI) |
| **4** | **Real Chrome V0.7 Capture** | `scenario-H-real-chrome-capture.json` | Paste JSON $\to$ Validate $\to$ Import. | Successfully validates schema V0.7, imports 1,023 nodes with 0 skipped nodes. | `NOT AVAILABLE` (CLI) |
| **5** | **Chrome JSON Validation** | Any scenario JSON from corpus | Paste into textarea, click "Validate & Prepare". | Shows green validation banner: `Schema: 0.7`, node counts, viewport dimensions. | `NOT AVAILABLE` (CLI) |
| **6** | **Root Frame Creation** | `scenario-A-canonical-sample.json` | Inspect canvas root layer. | Top-level frame named `Web2Design — <Title>`, positioned around viewport center. | `NOT AVAILABLE` (CLI) |
| **7** | **Layer Hierarchy** | `scenario-B-style-text-hierarchy.json` | Expand layers list in Figma left panel. | True nested frames and children; zero orphan layers placed on root canvas. | `NOT AVAILABLE` (CLI) |
| **8** | **Editable Plain Text** | `scenario-B-style-text-hierarchy.json` | Double click any heading or paragraph; type new text; press `Ctrl+Z`. | Text layer is a native `TEXT` node; characters are fully editable; font, size, line-height match. | `NOT AVAILABLE` (CLI) |
| **9** | **Rich Text Paragraph Ranges** | `scenario-F-rich-text-ranges.json` | Select rich text paragraph; inspect text properties; edit characters in styled range. | Single `TEXT` node with multiple styled character ranges (bold, italic, font-size, colors). | `NOT AVAILABLE` (CLI) |
| **10** | **Hyperlink Ranges** | `scenario-F-rich-text-ranges.json` | Click link range; inspect link in Figma properties panel. | Native Figma hyperlink target assigned to exact character span. | `NOT AVAILABLE` (CLI) |
| **11** | **Per-Run Font Fallback** | `scenario-F-rich-text-ranges.json` | Inspect console & warning list for `FONT_FALLBACK`. | Unsupported font gracefully falls back to Inter; available font runs remain intact; warning logged. | `EXPECTED APPROXIMATION` |
| **12** | **Solid Fills** | `scenario-B-style-text-hierarchy.json` | Select card or button; inspect Fills in right sidebar. | Native `Solid` color fill with exact hex/alpha matching browser appearance. | `NOT AVAILABLE` (CLI) |
| **13** | **Linear Gradient** | `scenario-D-gradients-borders-shadows.json` | Select linear gradient swatch; inspect Fills panel. | Native `Linear` gradient paint with correct color stops, alpha, and angle. | `NOT AVAILABLE` (CLI) |
| **14** | **Radial Gradient** | `scenario-D-gradients-borders-shadows.json` | Select radial gradient swatch; inspect Fills panel. | Native `Radial` gradient paint with ellipse transform matrix. | `NOT AVAILABLE` (CLI) |
| **15** | **Non-Uniform Borders** | `scenario-D-gradients-borders-shadows.json` | Select card with unequal borders; inspect Strokes. | Individual stroke weights (top, right, bottom, left) natively editable in Figma. | `NOT AVAILABLE` (CLI) |
| **16** | **Multiple Drop Shadows** | `scenario-D-gradients-borders-shadows.json` | Select multi-shadow card; inspect Effects panel. | Stack of multiple `Drop shadow` effects, individually editable with offset, blur, spread. | `NOT AVAILABLE` (CLI) |
| **17** | **Inner Shadow** | `scenario-D-gradients-borders-shadows.json` | Select inset shadow swatch; inspect Effects panel. | Native `Inner shadow` effect applied cleanly with blur and offset. | `NOT AVAILABLE` (CLI) |
| **18** | **Rounded Container Clipping** | `scenario-E-clipping-transforms.json` | Inspect rounded clipped frame; toggle "Clip content" checkbox in right sidebar. | `Clip content` is checked; child overflowing content is clipped by rounded corners; unchecking reveals overflow. | `NOT AVAILABLE` (CLI) |
| **19** | **Single-Axis Clip Approx** | Fixture with x-only or y-only clip | Inspect warning list in plugin UI. | Frame has `Clip content` checked; `AXIS_CLIP_APPROXIMATED` warning displayed. | `EXPECTED APPROXIMATION` |
| **20** | **CSS 2D Rotation** | `scenario-E-clipping-transforms.json` | Select rotated badge/card; inspect rotation angle in right sidebar. | Layer rotated by exact degrees; origin compensation ensures visual placement matches browser. | `NOT AVAILABLE` (CLI) |
| **21** | **Transform Approximation** | Skewed or scaled elements | Inspect warning list and layer placement. | Visual placement approximate; structured warning logged; no plugin crash. | `EXPECTED APPROXIMATION` |
| **22** | **Image Paint** | `scenario-C-images-svg.json` | Select image rectangle; inspect Fills panel. | Fill is native `Image`; fill mode is `Fill` or `Fit`; aspect ratio matches browser. | `NOT AVAILABLE` (CLI) |
| **23** | **Inline SVG Vector** | `scenario-C-images-svg.json` | Select icon; double click to enter vector edit mode. | Native editable vector paths/subtrees (not a flat PNG/raster bitmap). | `NOT AVAILABLE` (CLI) |
| **24** | **Auto Layout Row** | `scenario-G-auto-layout.json` | Select horizontal flex frame; inspect Auto layout section in right sidebar. | Auto layout direction is `Horizontal` ($\to$); children flow in order. | `NOT AVAILABLE` (CLI) |
| **25** | **Auto Layout Column** | `scenario-G-auto-layout.json` | Select vertical flex frame; inspect Auto layout section in right sidebar. | Auto layout direction is `Vertical` ($\downarrow$); children flow in order. | `NOT AVAILABLE` (CLI) |
| **26** | **Auto Layout Gap** | `scenario-G-auto-layout.json` | Inspect spacing between items in right sidebar. | Item spacing matches browser `gap` (e.g. 12px, 16px). | `NOT AVAILABLE` (CLI) |
| **27** | **Auto Layout Padding** | `scenario-G-auto-layout.json` | Inspect padding in right sidebar (toggle independent padding). | Padding top, right, bottom, left match browser computed padding. | `NOT AVAILABLE` (CLI) |
| **28** | **Auto Layout Alignment** | `scenario-G-auto-layout.json` | Inspect alignment grid in right sidebar. | Primary and counter axis alignments match browser (`MIN`, `CENTER`, `MAX`). | `NOT AVAILABLE` (CLI) |
| **29** | **Space-Between** | `scenario-G-auto-layout.json` | Select space-between row; inspect spacing mode. | Spacing mode is `Auto` (`Space between`). | `NOT AVAILABLE` (CLI) |
| **30** | **Grow Child** | `scenario-G-auto-layout.json` | Select flex-grow item inside Auto layout frame. | Child width/height sizing is set to `Fill container` (`layoutGrow = 1`). | `NOT AVAILABLE` (CLI) |
| **31** | **Stretch Child** | `scenario-G-auto-layout.json` | Select align-self stretch item. | Counter axis sizing is set to `Fill container` (`layoutAlign = "STRETCH"`). | `NOT AVAILABLE` (CLI) |
| **32** | **Absolute Overlay Child** | `scenario-G-auto-layout.json` | Select notification badge inside Auto layout frame. | Position setting in right sidebar is `Absolute position` (`layoutPositioning = "ABSOLUTE"`); badge retains local x/y. | `NOT AVAILABLE` (CLI) |
| **33** | **Nested Auto Layout** | `scenario-G-auto-layout.json` | Select card containing header, text, action rows. | Parent is vertical Auto layout; children are horizontal Auto layout frames; no hierarchy flattening. | `NOT AVAILABLE` (CLI) |
| **34** | **Auto Layout + Borders** | `scenario-G-auto-layout.json` | Select bordered Auto layout frame; inspect strokes settings. | "Include stroke in layout" (`strokesIncludedInLayout = true`) is checked; child offsets match browser. | `NOT AVAILABLE` (CLI) |
| **35** | **Auto Layout + Clipping** | `scenario-G-auto-layout.json` | Select clipped Auto layout frame. | Frame has both Auto layout enabled AND "Clip content" checked. | `NOT AVAILABLE` (CLI) |
| **36** | **Auto Layout + Transform** | `scenario-G-auto-layout.json` | Select rotated Auto layout frame. | Frame has Auto layout enabled AND rotation angle applied cleanly. | `NOT AVAILABLE` (CLI) |
| **37** | **Invalid JSON Recovery** | Type `{"broken": ` in textarea | Click "Validate & Prepare". | Shows red error banner: `JSON syntax error`; plugin remains alive; paste valid JSON recovers immediately. | `NOT AVAILABLE` (CLI) |
| **38** | **Invalid Schema Recovery** | Change `schemaVersion` to `"99.0"` | Click "Validate & Prepare". | Shows red error banner: `Unsupported schemaVersion`; import blocked; paste valid JSON recovers immediately. | `NOT AVAILABLE` (CLI) |
| **39** | **Repeated Import Lifecycle** | Import Scenario A, then Scenario C, then Scenario G | Inspect Figma layers panel. | Creates 3 independent top-level root frames; no layer collisions, no corrupted canvas state. | `NOT AVAILABLE` (CLI) |
| **40** | **Duplicate In-Flight Lock** | Rapidly double click "Import to Figma" | Observe plugin status banner. | Import button enters disabled/loading state; exactly one import execution runs; no duplicate frames. | `NOT AVAILABLE` (CLI) |
| **41** | **Developer Console Audit** | Open developer console in Figma | Inspect Console tab during imports. | 0 uncaught exceptions, 0 unhandled promise rejections, 0 red errors. | `NOT AVAILABLE` (CLI) |

---

## 3. Human Acceptance Sign-Off Section

When a human reviewer executes these tests in Figma Desktop:
1. Mark each row in Section 2 with `PASS` or `FAIL`.
2. Record any visual discrepancies or console warnings in the notes section below.
3. If all rows pass:
   - Update `W2D-009` status to `DONE` in `docs/w2d-009-report.md`.
   - Update `W2D-018` status to `DONE` in `docs/w2d-018-report.md`.

### Evaluator Notes & Observations:
```
Date of evaluation:
Evaluator name:
Figma Desktop version:
Overall verdict (PASS / FAIL):
Notes:
```
