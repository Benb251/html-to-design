# W2D-006 — Figma Plugin Shell

Validated 2026-10-13, Asia/Saigon. Implementation, building pipeline, and automated verification are complete. No commit or push was performed. Figma node canvas rendering was intentionally not implemented and is reserved for W2D-007.

## Repository before work

- Branch: `main`.
- HEAD: `dfd3962 feat(m1): complete M1 Capture milestone (W2D-001 to W2D-005)`.
- Git status: uncommitted work from previous milestone committed cleanly at `dfd3962`.
- Inspected `docs/w2d-005-report.md`, `apps/figma-plugin`, `packages/design-schema`, `packages/test-fixtures`, and extension smoke output before editing.
- Preserved existing architecture. No schema changes made; wire version remains `"0.1"`.

## Implemented

- Established complete Figma plugin application under `apps/figma-plugin/`.
- Strict runtime separation following Figma's two-environment model:
  - Sandboxed UI (`src/ui.ts`, `public/ui.html`, `public/ui.css`): handles user input (paste, file upload, sample loading), error formatting, and metric visualization.
  - Main runtime (`src/main.ts`): executes in Figma's main sandbox; performs authoritative document validation and deterministic tree traversal; zero DOM references.
- Strongly typed discriminated message protocol (`src/messages.ts`):
  - `UiToPluginMessage`: `validate-document`, `close-plugin`, `notify`.
  - `PluginToUiMessage`: `validation-success`, `validation-error`.
- Authoritative shared schema validation at the plugin main boundary:
  - Invokes `safeParseDesignDocument()` from `@web2design/design-schema`.
  - Normalizes validation failures into JSON-safe, prototype-free `SerializableValidationError` objects with path and message.
- Reusable tree traversal and deterministic document summary computation (`src/summary.ts`):
  - Recursively visits document AST nodes.
  - Calculates schema version, total node count, node count breakdown (`frame`, `text`, `rectangle`, `image`, `svg`), asset count breakdown (`image`, `svg`, `font`, `binary`), viewport dimensions, page title/URL, and deduplicated warning codes.
- Functional, clean plugin UI:
  - Paste JSON textarea with auto-trimming.
  - "Validate & Prepare Import" button.
  - "Load Sample" button for instant testing.
  - Local file input (`<input type="file" accept=".json,application/json">`).
  - "Clear" button providing complete idempotent state reset.
  - Interactive status pill: `Waiting` → `Validating...` → `Ready` / `Error`.
  - Structured summary card with node breakdown, asset breakdown, viewport, and warning badges.
  - Detailed error callout listing schema issues with property paths.
- Figma development manifest (`apps/figma-plugin/manifest.json`):
  - Name: "Web2Design"
  - `id`: "web2design"
  - `api`: "1.0.0"
  - `main`: "main.js"
  - `ui`: "ui.html"
  - `editorType`: ["figma"]
  - `networkAccess`: `{ "allowedDomains": ["none"] }` (strictly no external network access requested).
- Self-contained build pipeline (`scripts/build.mjs`):
  - Bundles `main.ts` into `dist/main.js` targeting browser/sandbox (zero Node runtime dependencies).
  - Bundles `ui.ts` and inlines both compiled script and stylesheet into a self-contained `dist/ui.html`.
  - Generates `dist/sample-w2d-document.json` derived directly from `@web2design/test-fixtures` without schema drift.
  - Copies `manifest.json` to `dist/manifest.json`.
- Comprehensive automated test suite:
  - `summary.test.ts`: tests AST tree traversal, node counts, nested frames, asset breakdown, and warnings.
  - `messages.test.ts`: tests message protocol, string parsing, syntax errors, schema version rejection, missing asset detection, unrecognized keys, and state isolation.
  - `fixtures.test.ts`: validates all 7 representative fixtures, all 9 Section 17 edge cases, and real Chrome Extension captures (`fidelity-assets.json`, `fidelity-geometry.json`, `fidelity-styles.json`, `fidelity-text.json`, `fidelity-limits.json`, `capture.json`).

## Architecture & Communication Flow

```text
Captured Web2Design JSON (Paste / File / Sample)
                     ↓
┌──────────────────────────────────────────────┐
│  Figma Plugin UI (Sandboxed iframe)          │
│  - Accepts user JSON                         │
│  - Emits { type: "validate-document", raw }  │
└──────────────────────┬───────────────────────┘
                       │
                       │ figma.ui.postMessage()
                       │ (UiToPluginMessage)
                       ▼
┌──────────────────────────────────────────────┐
│  Plugin Main Runtime (Sandbox)               │
│  - handleUiMessage()                         │
│  - safeParseDesignDocument(payload)          │
│  - computeDocumentSummary(doc)               │
│  - figma.notify("Web2Design document ...")   │
└──────────────────────┬───────────────────────┘
                       │
                       │ figma.ui.postMessage()
                       │ (PluginToUiMessage)
                       ▼
┌──────────────────────────────────────────────┐
│  Figma Plugin UI                             │
│  - Success: displays document summary        │
│  - Failure: displays serializable errors     │
└──────────────────────────────────────────────┘
```

## Section 17 Test Matrix Verification

| # | Requirement Case | Test File | Result |
|---|---|---|---|
| 1 | Simple fixture document (`simpleTextFixture`) | `test/fixtures.test.ts` | PASS (2 nodes, 1 text, 0 assets) |
| 2 | W2D-004 styled document (`styledRectangleFixture` & `shadowFixture`) | `test/fixtures.test.ts` | PASS (fills, borders, shadows, cornerRadius) |
| 3 | W2D-005 asset document (`imageFixture`) | `test/fixtures.test.ts` | PASS (1 image node, 1 image asset) |
| 4 | Document containing image assets | `test/fixtures.test.ts` | PASS (assetId linkage verified) |
| 5 | Document containing inline SVG (`inlineSvgFixture`) | `test/fixtures.test.ts` | PASS (1 SVG node, inlineSvg markup) |
| 6 | Malformed JSON syntax | `test/fixtures.test.ts`, `test/messages.test.ts` | PASS (caught with `json_parse_error` issue) |
| 7 | Invalid schema version (`"0.2"`) | `test/fixtures.test.ts`, `test/messages.test.ts` | PASS (rejected with schema version issue) |
| 8 | Invalid asset reference (missing asset record) | `test/fixtures.test.ts`, `test/messages.test.ts` | PASS (rejected with `missing or non-image asset`) |
| 9 | Unknown schema field (strict keys) | `test/fixtures.test.ts`, `test/messages.test.ts` | PASS (rejected with `unrecognized_keys`) |
| 10 | Real Chrome capture: `fidelity-assets.json` | `test/fixtures.test.ts` | PASS |
| 11 | Real Chrome capture: `fidelity-geometry.json` | `test/fixtures.test.ts` | PASS |
| 12 | Real Chrome capture: `fidelity-styles.json` | `test/fixtures.test.ts` | PASS |
| 13 | Real Chrome capture: `fidelity-text.json` | `test/fixtures.test.ts` | PASS |
| 14 | Real Chrome capture: `fidelity-limits.json` | `test/fixtures.test.ts` | PASS |
| 15 | Real Chrome capture: `capture.json` | `test/fixtures.test.ts` | PASS |

## Tests & Verification Totals

- Automated test suite: **225 tests passing across 9 test files** (up from 195 tests):
  - `@web2design/figma-plugin`: 30 passing tests (new).
  - `@web2design/extension`: 21 passing tests.
  - `@web2design/capture-engine`: 105 passing tests.
  - `@web2design/design-schema`: 53 passing tests.
  - `@web2design/test-fixtures`: 16 passing tests.
- Rendered-browser CDP fidelity suite: **45 named checks across 6 fixture pages passing**.

## Validation Commands

| Command | Result |
| --- | --- |
| `npm run build` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 (all workspaces including strict `exactOptionalPropertyTypes`) |
| `npm run lint` | PASS, exit 0 |
| `npm test` | PASS, exit 0 (225 unit/integration tests) |
| `npm run smoke -w @web2design/extension` | PASS, exit 0 (45 fidelity checks / 6 fixture pages) |

## Manual Verification Classification

```text
Automated unit & integration tests:
PASS (225 tests passing)

Real Chrome Extension capture validation:
PASS (all 6 smoke captures parse and validate successfully)

Figma plugin build artifact generation:
PASS (dist/manifest.json, dist/main.js, dist/ui.html, dist/sample-w2d-document.json)

Interactive Figma desktop import:
NOT AVAILABLE (headless CLI environment)
Manual test procedure ready:
  1. Open Figma -> Plugins -> Development -> Import plugin from manifest...
  2. Select apps/figma-plugin/dist/manifest.json
  3. Open Web2Design plugin
  4. Paste JSON or click "Load Sample"
  5. Click "Validate & Prepare Import"
```

## Schema Changes

```text
Schema changes: None
```

Design Schema version remains `"0.1"`. The figma-plugin consumes `@web2design/design-schema` without modifying any schema contracts.

## Permissions & Manifest

```text
Network access: { "allowedDomains": ["none"] }
Permissions: None
```

No network access or permissions were added.

## Files Created / Modified

- `apps/figma-plugin/manifest.json` (new): Figma plugin manifest.
- `apps/figma-plugin/package.json` (new): figma-plugin workspace package definition with `@figma/plugin-typings` and `esbuild`.
- `apps/figma-plugin/tsconfig.json` (new): strict TypeScript configuration extending workspace base.
- `apps/figma-plugin/src/messages.ts` (new): typed message protocol, summary interfaces, and serializable error structures.
- `apps/figma-plugin/src/summary.ts` (new): AST tree traversal and document summary calculator.
- `apps/figma-plugin/src/main.ts` (new): plugin main runtime and message dispatcher.
- `apps/figma-plugin/src/ui.ts` (new): plugin UI controller with paste, file input, sample loader, and status management.
- `apps/figma-plugin/public/ui.html` (new): UI markup.
- `apps/figma-plugin/public/ui.css` (new): UI stylesheet.
- `apps/figma-plugin/scripts/build.mjs` (new): build script bundling main and inlining UI into `dist/`.
- `apps/figma-plugin/test/summary.test.ts` (new): unit tests for document summary calculation.
- `apps/figma-plugin/test/messages.test.ts` (new): unit tests for message protocol and validation error formatting.
- `apps/figma-plugin/test/fixtures.test.ts` (new): unit tests covering all representative fixtures and real Chrome capture files.
- `apps/figma-plugin/README.md`: comprehensive documentation for building, loading into Figma, and testing.
- `package.json`: added `@web2design/figma-plugin` build step to root `build` script.
- `README.md`: updated workspace description and current scope.
- `docs/w2d-006-report.md` (new): this report.

## Recommended Next Step

The codebase is ready for:

**W2D-007 — Figma Node Renderer**

The validation boundary and typed message protocol are securely in place. W2D-007 can attach the renderer to the validated `DesignDocument` output in plugin main.
