# W2D-003 verification

## Repository before work

Repository: D:/Tool/html-to-design (Web2Design).
Branch: main.
HEAD: **none** — unborn repository, no initial commit.
Status: foundation .gitignore, README, apps, docs, eslint config, lockfile, package.json, packages and tsconfig were untracked. No pre-existing tracked diff existed.

This task does not create a commit or push. Git cannot provide a baseline diff against HEAD; this report distinguishes the pre-existing foundation from the W2D-003 implementation.

## Implementation

Plain TypeScript MV3 popup, explicit active-tab injection, idempotent isolated content message listener, reusable browser capture-engine, public schema validation, pretty JSON preview/copy/Blob download, local landing fixture and developer workflow.

Design Schema V0.1 source, public API, strict unknown-field validation and the original schema/fixture tests are unchanged. Figma plugin stays a package shell. No backend or Playwright implementation.

## Automated verification

- Root build: PASS; manifest/popup/content bundles plus CSS/HTML/maps exist in apps/extension/dist.
- Root typecheck: PASS; strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes retained.
- Root lint: PASS.
- Root test: **130 tests PASS**: 53 existing schema, 16 existing fixtures, 40 capture-engine, 21 extension/orchestration/popup. **61 new tests**.
- Rendered Chrome local-fixture smoke: PASS, **21 nodes / 10 editable text nodes**, validated V0.1 output, unchanged geometry before/after scroll, single message listener after repeated content injection.
- npm install: completed, audited dependencies with zero reported vulnerabilities at verification time.

Unit coverage includes scroll conversion, visibility and opacity, style normalization, whitespace/font families, deterministic IDs, traversal/no duplicated text, assets/form-value omission, bounded partial capture, real schema rejection and serialization. Popup tests verify exact JSON bytes for clipboard/download and visible clipboard/schema failure.

The Chrome smoke uses actual layout and the shipped content bundle, with message transport stubbed in an isolated world. It does not install the extension or automate Chrome's popup UI. It uses local fixture HTTP/CDP only, no Playwright and no remote capture resource fetch.

Successful final real-Chrome output is retained under apps/extension/.smoke/capture.json (Git ignored). Earlier DOM tests caught default-style normalization cases; these were corrected without changing schema validation. Layout-free unit styling uses CSSOM assignments where appropriate; actual Chrome shorthand styles were separately checked.

## Manual verification

**Not manually verified:** Developer Mode → Load unpacked, actual popup permission grant, real system clipboard and actual downloaded file.

Automated-verified: capture content bundle in rendered Chrome, popup behavior with DOM/Chrome API ports, schema-valid output and build assets.

Use [extension instructions](../apps/extension/README.md) for the manual acceptance checklist. Do not interpret the smoke as manual browser acceptance.

## Limits and next task

Capture supports ordinary document-flow frames, text and simple visual boxes. Fixed/sticky, advanced paint/layout, assets, child frames/shadow DOM and complex styles remain excluded or warned. Every output carries a scope warning. Large captures may be explicitly partial.

Implementation is ready for **W2D-004 — Geometry + basic style fidelity** after the short unpacked-Chrome acceptance checklist. No known W2D-003 corrective issue remains in automated checks. Image/SVG fidelity stays W2D-005; Figma import/rendering remains deferred.
