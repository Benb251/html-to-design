# W2D-003 — Chrome Extension shell + first capture pipeline

Validated on 2026-10-13 (Asia/Saigon).

## Repository before work

Branch: `main`. HEAD: unavailable because the repository has no commits. Git status: foundation and partial W2D-003 files were untracked; there were no tracked modifications to overwrite.

Although the request described an extension package shell, inspection found a partial extension/capture-engine implementation. It was preserved and completed. No commit or push was performed.

## Implemented

- Real TypeScript Manifest V3 extension with plain HTML/CSS popup, isolated content script, and capture orchestration.
- Minimal activeTab/scripting/clipboardWrite permissions; no service worker, host permissions, server, or resource downloading.
- Reusable browser capture-engine that returns the existing schema contract using its public runtime validator.
- Rendered DOM element/text traversal, document-origin coordinates, deterministic IDs, useful frame grouping, visible text, simple boxes/styles, local opacity, and bounded traversal with partial-output warnings.
- Popup Ready/Capturing/Success/Error states, active hostname, node/warning counts, selectable pretty JSON, copy, and local download with sensible filename.
- Validation on content output, popup receipt, and serialization; clear errors and stale-output clearing after capture failure.
- HTML landing fixture, fixture server, unpacked build verification, installation instructions, and a local rendered-Chrome smoke.
- Fixed empty computed-opacity handling, avoided frames from zero-radius styles, preserved ancestors/opacity when the node budget is reached, and preserved nonbreaking/pre-line whitespace.
- Added popup tests for ready/success/errors, exact copied/downloaded bytes, clipboard failure, filename, and export reset after invalid output.

## Extension structure

```text
apps/extension/
  manifest.json
  src/
    popup.ts
    content.ts
    orchestration.ts
  public/
    popup.html
    popup.css
  scripts/
    build.mjs
    serve-fixture.mjs
    smoke.mjs
  fixtures/landing.html
  test/
    orchestration.test.ts
    popup.test.ts
  dist/
    manifest.json
    popup.html
    popup.css
    popup.js
    content.js
    *.js.map
packages/capture-engine/
  src/
    capture.ts
    geometry.ts
    styles.ts
    export.ts
    index.ts
  test/capture.test.ts
```

## Capture flow

Popup -> active-tab isolated content injection -> content listener -> capture-engine -> Design Schema validation -> popup validation -> pretty serialization -> view/copy/local JSON download.

Repeated content injection is idempotent. The capture engine stores plain portable values, not DOM nodes or raw computed-style objects.

## Supported today

- Normal-flow, rendered light-DOM containers, direct text runs, simple rectangles.
- Document-origin CSS-pixel geometry with window scroll offsets, including normal-flow content outside the viewport.
- Primary font/fallbacks, size, weight, style, line height, tracking, alignment, and text color.
- Solid fill, uniform supported border, circular corner radius, and local opacity.
- Non-rendered subtree skipping and hidden/zero-size wrapper flattening with independently rendered descendants.
- Empty assets array; unsupported images/SVG/media/iframes have explicit warnings and may have empty rectangle placeholders.

## Known limitations

Fixed/sticky content is omitted with warnings. Images/SVG/media pixels/vectors, iframe content, shadow DOM, pseudo-elements, live form values, generated content, clipping/overflow/internal scrollers, stacking-context reconstruction, advanced transforms, shadows, gradients, filters, component detection, Auto Layout, and Grid reconstruction are not fully captured.

Normal/unresolved line-height and unsupported font/color values use warned approximations. Wrapped DOM text runs use one axis-aligned range box. No scrolling/lazy-loading capture pass is performed. Bounds can produce a warned partial document.

Chrome internal/extension/Web Store/protected pages cannot be captured. File pages need Allow access to file URLs; the HTTP fixture avoids that requirement.

Figma plugin/renderer, crawler/Playwright, backend/cloud/auth/billing, AI, and React/Tailwind export remain out of scope.

## Validation actually run

| Check | Result |
| --- | --- |
| `npm run build` | PASS — exit 0 |
| `npm run typecheck` | PASS — exit 0 |
| `npm run lint` | PASS — exit 0 |
| `npm test` | PASS — exit 0, 130 tests across 5 files |
| `npm run smoke -w @web2design/extension` | PASS — exit 0 |
| `npm audit --offline` | PASS — exit 0, cached audit reports 0 vulnerabilities |

Test counts: extension 21, capture engine 40, original schema 53, original fixtures 16. No original tests or schema strictness were removed.

Build verifies all required packaged files: manifest, popup HTML/CSS/JS, content JS. The actual output directory is `D:\Tool\html-to-design\apps\extension\dist`.

## Verification boundaries

**Automated verified:** rendered Chrome fixture capture using the actual shipped content bundle in an isolated world; 21 nodes, 10 text nodes, schema validity, positive text dimensions, basic borders/radius/opacity, skipped hidden text, deterministic IDs/geometry after scroll, and repeated-injection idempotency. The fixture emitted `CAPTURE_SCOPE` to make initial limitations explicit.

Evidence JSON: `apps/extension/.smoke/capture.json` (ignored generated file).

**Automated with mocks:** popup active-tab orchestration, Chrome transport, clipboard writes/failures, and JSON download Blob/filename/bytes. JSDOM unit tests mock layout; the separate Chrome smoke checks real layout.

**Not manually verified:** Load unpacked, toolbar popup interaction, real Chrome permission grant, actual OS clipboard, and browser download UI. The rendered smoke does not claim extension installation or complete Chrome message-transport integration.

## Important files changed

Capture-engine source/tests/configs/package/README; extension manifest, popup/content/orchestration source, public files, build/fixture/smoke scripts, fixture, tests/config/package/README; root package scripts/lockfile/README, ESLint Node-script globals, ignored smoke evidence, and this report.

## Schema changes

**None.** Design Schema V0.1, its public parse/safe-parse API, unknown-field rejection, TypeScript strictness, and its existing tests remain intact.

## Next task

No corrective implementation issue remains from the checks performed. Proceed with **W2D-004 — Geometry + basic style fidelity**, with one real unpacked-extension sanity check using the documented workflow still pending. Do not treat this report as completed manual browser acceptance.
