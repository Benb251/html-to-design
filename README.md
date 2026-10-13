# Web2Design

Web2Design is a utility for turning a rendered web page into an editable Figma design.

The core pipeline is:

```text
Rendered page
  -> Capture source (Chrome Extension, future Playwright/server capture, ...)
  -> Versioned Design Schema (V0.2 latest, V0.1 read-compatible)
  -> Figma Renderer
  -> Editable Figma document (native frames, text, shapes, images, SVGs, gradient paints)
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
  capture-engine/   # Rendered DOM to validated schema V0.2
  design-schema/    # Multi-version Design Schema (V0.1 + V0.2)
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

## Current Scope (W2D-012)

W2D-001 through W2D-012 are implemented.
- **Design Schema V0.2**: Current wire version emits `"0.2"`. Full backward read/import compatibility for V0.1 documents via explicit normalization.
- **CSS Gradient Fills**: First-class deterministic support for `linear-gradient(...)` and `radial-gradient(...)`, including cardinal and diagonal directions, arbitrary angles, rectangular aspect ratios, normalized stops, implicit stop distribution, alpha preservation, hard stops, and radial center/radii geometry.
- **Pseudo-Element Gradients**: Synthetic `::before` and `::after` pseudo-elements transparently support gradient fills.
- **Native Figma Paints**: Figma renderer converts normalized schema gradients into native editable `GRADIENT_LINEAR` and `GRADIENT_RADIAL` paints with mathematically exact 2x3 affine transforms.
- **Fill Ordering**: Respects CSS background layering by mapping top-to-bottom schema fills to Figma's bottom-to-top paint order.
- **Fidelity Regression Suite**: 15 fixtures (7 canonical schema fixtures + 8 Chrome browser captures) locked with golden snapshot baselines and explicit numeric tolerances.
- **W2D-009 Status**: Interactive Figma Desktop GUI validation remains pending (independent manual gate).
