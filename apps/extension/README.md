# Web2Design Chrome extension — W2D-004

A Manifest V3 extension that captures the current rendered page into validated Design Schema V0.1 JSON. This ends at JSON export: no Figma import, backend, upload or resource downloading.

## Install/build

From the repository root, with Node.js 22.13+ and npm 10+:

    npm install
    npm run build
    npm run typecheck
    npm run lint
    npm test

For a reproducible install use npm ci. Root build first builds the schema/capture dependencies and then the extension. It emits:

    apps/extension/dist/
      manifest.json
      popup.html
      popup.css
      popup.js
      content.js
      popup.js.map
      content.js.map

## Load unpacked and test

1. Open Chrome and chrome://extensions.
2. Enable Developer Mode.
3. Choose Load unpacked.
4. Select **apps/extension/dist**, not the package/source directory.
5. From the repository root run **npm run fixture -w @web2design/extension**.
6. Open **http://127.0.0.1:4173/**. The helper serves only the local fixture, not an application backend.
7. Click the Web2Design extension icon, then Capture Page.
8. Expect Success, Nodes/Warn counts and readonly pretty JSON. Inspect heading/button characters, colored card border/radius and absolute coordinates.
9. Use Copy JSON and Download JSON. Filename includes hostname and capture UTC date, e.g. web2design-127-0-0-1-2026-10-13.json.
10. Scroll down and capture again. Ordinary document-flow node positions should match; viewport.scrollY changes.
11. Stop the fixture helper with Ctrl+C. After changing code, rebuild and click Reload on chrome://extensions.

Alternatively open fixtures/landing.html directly, enabling Allow access to file URLs in extension details if Chrome requires it. The HTTP fixture avoids file-access restrictions.

Closing the popup discards its in-memory result. Capture again after reopening; no background persistence is added.

After reloading the extension, reload the fixture/page too: the old content listener remains in that document until navigation or reload.

## Architecture/security

Popup → executeScript into the active tab's isolated world → content message → reusable capture-engine → public Design Schema validation → validated response → popup validation/serialization → clipboard/local Blob download.

Permissions:
- activeTab: temporary access granted by opening the extension on the chosen page.
- scripting: inject packaged content.js on explicit Capture Page.
- clipboardWrite: copy validated JSON on explicit Copy JSON.

No host_permissions, tabs permission, downloads permission, service worker, remote script or external messaging API. Downloads use an ordinary user-clicked Blob link. Page title/errors are rendered with textContent, never HTML.

Chrome internal/about/other-extension pages and the Chrome Web Store cannot be captured. PDF viewers and Chrome-protected documents may reject injection; errors remain visible. Navigation/closed-tab failures are surfaced. Capture runs only on the top document, not child frames.

## Verification

    npm run smoke -w @web2design/extension

Optional: set CHROME_PATH to a Chrome/Chromium executable. This local-only CDP smoke runs the **shipped content bundle** in an isolated world against the fixture's real Chrome layout, validates JSON, compares before/after scroll geometry and verifies idempotent injection. Chrome message transport is stubbed; it is **not** a manual unpacked-extension or popup permission check. It uses no Playwright/crawler and fetches no capture assets.

Automated DOM tests additionally verify popup success/error states, exact copied/downloaded bytes, safe filename, clipboard failure and public schema rejection. Manual Chrome installation/copy/download must be checked separately using the steps above.

See [capture-engine](../../packages/capture-engine/README.md) for supported content and limitations.

W2D-005 adds image and inline SVG asset capture with schema version still `"0.1"`. The existing smoke now runs the landing page plus [five focused fidelity fixtures](fixtures/README.md), checking known numeric geometry, independent browser Ranges, whitespace, solid fills, borders, circular radii, a single outer shadow, nested local opacity, image URL resolution, data URLs, srcset, SVG serialization/sanitization/styling, and asset deduplication. Named checks and JSON evidence are saved under `.smoke/`.

The fixture server also serves `/fidelity-geometry.html`, `/fidelity-text.html`, `/fidelity-styles.html`, `/fidelity-limits.html` and `/fidelity-assets.html` for manual inspection.
