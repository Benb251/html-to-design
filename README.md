# Web2Design

Web2Design is a utility for turning a rendered web page into an editable Figma design.

The core pipeline is:

```text
Rendered page
  -> Capture source (Chrome Extension, future Playwright/server capture, ...)
  -> Versioned Design Schema (V0.5 latest, V0.1–V0.4 read-compatible)
  -> Figma Renderer
  -> Editable Figma document (native frames, clipsContent, rotation/relativeTransform, text, shapes, images, SVGs, gradient paints, individual strokes, shadow stacks)
```

## Core Philosophy

**Fidelity before semantics. Absolute layout before Auto Layout. Deterministic before AI.**

Web2Design preserves rendered visual appearance and deterministic absolute geometry first. Smart layout reconstruction can be layered on later without changing the capture/renderer boundary.

The Design Schema is that boundary. Capture implementations may use DOM APIs, browser APIs, computed styles, or server-side browser automation internally, but renderer packages must consume only the versioned Design Schema. Raw DOM objects and unrestricted computed-style dumps are not part of the renderer contract.

## Workspace

```text
apps/
  extension/        # Manifest V3 popup + capture pipeline
  figma-plugin/     # Figma plugin UI, message protocol & renderer integration
packages/
  capture-engine/   # Rendered DOM to validated schema V0.5
  design-schema/    # Multi-version Design Schema (V0.1, V0.2, V0.3, V0.4, V0.5)
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

## Current Scope (W2D-015)

W2D-001 through W2D-015 are implemented.
- **Design Schema V0.5**: Current wire version emits `"0.5"`. Full backward read/import compatibility for V0.1, V0.2, V0.3, and V0.4 documents via explicit normalization.
- **CSS 2D Transforms & Rotation**: Captures computed 2D affine transforms (`transform`, `transform-origin`, and modern individual `translate`, `rotate`, `scale`) under `Transform2D`.
- **Dual Geometry Model**: Distinguishes visual post-transform bounding box (`x, y, width, height`) from untransformed layout base box (`transform.baseBounds`), affine matrix, and transform origin.
- **Non-Destructive Mathematical Reconstruction**: Base bounds are calculated using inverse affine transformation without destructive live DOM mutations.
- **Native Figma Rotation & Transforms**: CSS rotation and translation map directly to native Figma `rotation` and `relativeTransform` with positional transform-origin compensation.
- **Node-Type Preservation**: Transformed text remains editable `TextNode`, images remain `RectangleNode` with image fills, frames remain `FrameNode`, and SVG logical containers apply container-level transform.
- **Scaling & Skew Semantics**: Simple uniform scale maps via native Figma `rescale()` where safe; non-uniform scale and non-orthogonal skew are cleanly classified and approximated with explicit diagnostics (`TRANSFORM_SCALE_APPROXIMATED`, `TRANSFORM_SKEW_APPROXIMATED`).
- **Feature Interactions**: Zero regression across container clipping (`clipsContent`), linear/radial gradients, non-uniform borders, multi/inset shadows, and synthetic pseudo-elements.
- **Fidelity Regression Suite**: 18 fixtures (7 canonical schema fixtures + 11 Chrome browser captures including `fidelity-transforms` and `fidelity-clipping`) locked with golden snapshot baselines and 0 unexpected warnings.
- **W2D-009 Status**: Interactive Figma Desktop GUI validation remains pending (independent manual gate).
