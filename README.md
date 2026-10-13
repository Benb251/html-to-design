# Web2Design

Web2Design is a utility for turning a rendered web page into an editable Figma design.

The core pipeline is:

```text
Rendered page
  -> Capture source (Chrome Extension, future Playwright/server capture, ...)
  -> Versioned Design Schema (V0.4 latest, V0.1, V0.2 & V0.3 read-compatible)
  -> Figma Renderer
  -> Editable Figma document (native frames, clipsContent, text, shapes, images, SVGs, gradient paints, individual strokes, shadow stacks)
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
  capture-engine/   # Rendered DOM to validated schema V0.4
  design-schema/    # Multi-version Design Schema (V0.1, V0.2, V0.3, V0.4)
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

## Current Scope (W2D-014)

W2D-001 through W2D-014 are implemented.
- **Design Schema V0.4**: Current wire version emits `"0.4"`. Full backward read/import compatibility for V0.1, V0.2, and V0.3 documents via explicit normalization.
- **Container Clipping**: Non-destructive container clipping semantics (`overflow: hidden` and `overflow: clip`) captured into `FrameNode.clip` with per-axis fidelity (`clip: { x: boolean, y: boolean }`).
- **Native Figma Frame Clipping**: Both-axis clipping maps natively to Figma `FrameNode.clipsContent = true` without modifying child geometry or layout mode (`layoutMode = "NONE"`). Unclipped frames explicitly retain `clipsContent = false`.
- **Single-Axis Approximation**: Single-axis clips (`overflow-x: hidden; overflow-y: visible`) preserve containment fidelity via `clipsContent = true` and emit deterministic structured warnings (`AXIS_CLIP_APPROXIMATED`).
- **Non-Destructive Child Geometry**: Fully and partially overflowing descendants retain their uncropped width, height, and document-origin coordinates for complete editability in Figma.
- **Pruning & Wrapper Retention**: Containers with `overflow: hidden` or `overflow: clip` and rendered descendants survive capture pruning even without visual styles or borders.
- **Feature Interactions**: Verified against rounded card clipping (`border-radius` + `overflow: hidden`), gradient fills, non-uniform borders, drop shadows, and synthetic pseudo-element overflow.
- **Fidelity Regression Suite**: 17 fixtures (7 canonical schema fixtures + 10 Chrome browser captures including `fidelity-clipping`) locked with golden snapshot baselines and 0 unexpected warnings.
- **W2D-009 Status**: Interactive Figma Desktop GUI validation remains pending (independent manual gate).
