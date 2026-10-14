# Web2Design

Web2Design is a utility for turning a rendered web page into an editable Figma design.

The core pipeline is:

```text
Rendered page
  -> Capture source (Chrome Extension, future Playwright/server capture, ...)
  -> Versioned Design Schema (V0.7 latest, V0.1–V0.6 read-compatible)
  -> Figma Renderer
  -> Editable Figma document (native Auto Layout frames, single-TextNode rich text runs, clipsContent, rotation/relativeTransform, text, shapes, images, SVGs, gradient paints, individual strokes, shadow stacks)
```

## Core Philosophy

**Fidelity before semantics. Auto Layout is an enhancement, not a replacement for absolute-layout fidelity. Deterministic before AI.**

Web2Design preserves rendered visual appearance and deterministic absolute geometry first. Smart layout reconstruction can be layered on later without changing the capture/renderer boundary.

The Design Schema is that boundary. Capture implementations may use DOM APIs, browser APIs, computed styles, or server-side browser automation internally, but renderer packages must consume only the versioned Design Schema. Raw DOM objects and unrestricted computed-style dumps are not part of the renderer contract.

## Workspace

```text
apps/
  extension/        # Manifest V3 popup + capture pipeline
  figma-plugin/     # Figma plugin UI, message protocol & renderer integration
packages/
  capture-engine/   # Rendered DOM to validated schema V0.7
  design-schema/    # Multi-version Design Schema (V0.1, V0.2, V0.3, V0.4, V0.5, V0.6, V0.7)
  figma-renderer/   # Schema to native editable Figma node tree renderer
  test-fixtures/    # Deterministic example documents
```

## Commands

Requires Node.js 22.13 or newer and npm 10 or newer. Dependencies are pinned by the lockfile.

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run smoke -w @web2design/extension
npm run fidelity
```

## Current Scope (W2D-017)

W2D-001 through W2D-017 are implemented.
- **Design Schema V0.7**: Current wire version emits `"0.7"`. Full backward read/import compatibility for V0.1, V0.2, V0.3, V0.4, V0.5, and V0.6 documents via explicit normalization (`layout: undefined`, `layoutChild: undefined`).
- **High-Confidence Auto Layout Inference**: Infers semantic Flexbox metadata for horizontal rows and vertical columns (`display: flex | inline-flex`, `flex-direction: row | column`, `gap`, `padding`, `justify-content`, `align-items`, `align-self: stretch`, `flex-grow: 1`, `position: absolute`) while unconditionally preserving captured absolute geometry (`x`, `y`, `width`, `height`).
- **Deterministic Geometry Prediction Guard**: Pure simulation (`predictAutoLayoutGeometry`) verifies predicted child coordinates against captured layout bounds. Enforces a strict $\le 0.5\text{px}$ tolerance before emitting Auto Layout metadata.
- **Graceful Absolute Layout Fallback**: Flexbox containers with ambiguous features (wrapping, non-zero child margins, visual order reordering, baseline alignment, multi-item grow ratios, relative position offsets, or geometry deviation) or unsupported display (CSS Grid) fall back cleanly to absolute positioning (`layoutMode = "NONE"`) with structured diagnostic warnings.
- **Native Editable Figma Auto Layout Frames**: Renders inferred containers into native Figma Auto Layout (`layoutMode: "HORIZONTAL" | "VERTICAL"`, `itemSpacing`, `padding*`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `strokesIncludedInLayout = true` for borders), supporting child `layoutGrow = 1`, `layoutAlign = "STRETCH"`, and `layoutPositioning = "ABSOLUTE"`.
- **Full Backward & Feature Compatibility**: Zero regression across rich text paragraphs (W2D-016), CSS 2D transforms and rotation (W2D-015), container clipping (W2D-014), linear/radial gradients (W2D-012), non-uniform borders and shadows (W2D-013), and synthetic pseudo-elements (W2D-011).
- **Fidelity Regression Suite**: 20 fixtures (8 canonical schema fixtures + 12 Chrome browser captures including `fidelity-auto-layout.html`) locked with golden snapshot baselines (669 nodes, 2676 geometry assertions, 35 transform assertions, 2093 style assertions, 165 text assertions, 84 rich-text range checks, 12 asset assertions, 121 Auto Layout checks) and 0 unexpected warnings.
- **W2D-009 Status**: Interactive Figma Desktop GUI validation remains pending (independent manual gate).
