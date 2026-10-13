# Web2Design

Web2Design is a utility for turning a rendered web page into an editable Figma design.

The core pipeline is:

```text
Rendered page
  -> Capture source (Chrome Extension, future Playwright/server capture, ...)
  -> Versioned Design Schema (V0.3 latest, V0.1 & V0.2 read-compatible)
  -> Figma Renderer
  -> Editable Figma document (native frames, text, shapes, images, SVGs, gradient paints, individual strokes, shadow stacks)
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
  capture-engine/   # Rendered DOM to validated schema V0.3
  design-schema/    # Multi-version Design Schema (V0.1, V0.2, V0.3)
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

## Current Scope (W2D-013)

W2D-001 through W2D-013 are implemented.
- **Design Schema V0.3**: Current wire version emits `"0.3"`. Full backward read/import compatibility for V0.1 and V0.2 documents via explicit normalization.
- **Non-Uniform Borders**: First-class support for per-side border widths, styles, and colors (`top`, `right`, `bottom`, `left`). Compatible solid borders map to native Figma individual stroke weights (`strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight`, `strokeLeftWeight`).
- **Border Style Recognition**: Recognizes CSS border styles (`solid`, `dashed`, `dotted`, `double`, `groove`, `ridge`, `inset`, `outset`). Dashed and dotted styles map to native Figma stroke dash patterns with explicit approximation warnings (`BORDER_STYLE_APPROXIMATED`).
- **Multiple & Inset Box Shadows**: Ordered arrays of box shadows preserved in schema without deduplication or merging. Mapped directly to native Figma `DROP_SHADOW` and `INNER_SHADOW` effect arrays preserving stack order.
- **Approximation Diagnostics**: Deterministic structured warnings for mixed side colors (`BORDER_COLOR_APPROXIMATED`), approximated styles (`BORDER_STYLE_APPROXIMATED`), and rounded non-uniform corner interactions (`BORDER_CORNER_APPROXIMATED`).
- **Fidelity Regression Suite**: 16 fixtures (7 canonical schema fixtures + 9 Chrome browser captures including `fidelity-borders-shadows`) locked with golden snapshot baselines and explicit tolerances.
- **W2D-009 Status**: Interactive Figma Desktop GUI validation remains pending (independent manual gate).
