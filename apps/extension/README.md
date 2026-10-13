# Web2Design Chrome Extension — W2D-014

A Manifest V3 extension that captures the current rendered page into validated Design Schema V0.4 JSON. This ends at JSON export: no backend, upload or external telemetry.

## Install / Build

From the repository root, with Node.js 22.13+ and npm 10+:

    npm install
    npm run build
    npm run typecheck
    npm run lint
    npm test

Root build first builds schema/capture dependencies and then the extension. It emits:

    apps/extension/dist/
      manifest.json
      popup.html
      popup.css
      popup.js
      content.js
      popup.js.map
      content.js.map

## Load Unpacked and Test

1. Open Chrome and `chrome://extensions`.
2. Enable Developer Mode.
3. Choose Load unpacked.
4. Select `apps/extension/dist`.
5. From the repository root run `npm run fixture -w @web2design/extension`.
6. Open `http://127.0.0.1:4173/`.
7. Click the Web2Design extension icon, then Capture Page.
8. Inspect Schema version `"0.4"`, node counts, container clipping behavior, per-side borders, and multi/inset shadows.

## Rendered Chrome Smoke Validation

    npm run smoke -w @web2design/extension

Executes the compiled MV3 content bundle across 10 rendered Chrome fixtures (122 assertions):
- `landing.html`: full page flow, cards, text, styles, scroll stability.
- `fidelity-geometry.html`: subpixel coordinates, scroll stability, hierarchy.
- `fidelity-text.html`: multiline typography, font families, alignment.
- `fidelity-styles.html`: solid fills, borders, circular radii, shadows, local opacity.
- `fidelity-limits.html`: unsupported limit diagnostics, safe wrapper pruning.
- `fidelity-assets.html`: images, SVGs, asset registry.
- `fidelity-pseudo.html`: synthetic `::before` and `::after` pseudo-elements.
- `fidelity-gradients.html`: linear and radial CSS gradients, keyword directions, angles, rectangular transforms, stop distributions, alpha, ordering, and pseudo gradients.
- `fidelity-borders-shadows.html`: non-uniform border widths, mixed border colors, border styles, corner radius interaction, multiple drop shadows, inset shadows, spread, and combinations.
- `fidelity-clipping.html`: container overflow clipping (`hidden`, `clip`, `visible`), uncropped descendant bounds, nested clips, rounded card clipping, image clipping, gradient/border/shadow/pseudo interactions, single-axis approximation, and scroll container diagnostics.
