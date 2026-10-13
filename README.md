# Web2Design

Web2Design is a utility for turning a rendered web page into an editable Figma design.

The long-term flow is:

```text
Rendered page
  -> Capture source (Chrome Extension, future Playwright/server capture, ...)
  -> Versioned Design Schema
  -> Figma Renderer
  -> Editable Figma document
```

## V0.1 philosophy

**Fidelity before semantics. Absolute layout before Auto Layout. Deterministic before AI.**

V0.1 preserves rendered visual appearance and deterministic absolute geometry first. Smart layout reconstruction can be layered on later without changing the capture/renderer boundary.

The Design Schema is that boundary. Capture implementations may use DOM APIs, browser APIs, computed styles, or server-side browser automation internally, but renderer packages must consume only the versioned Design Schema. Raw DOM objects and unrestricted computed-style dumps are not part of the renderer contract.

## Workspace

```text
apps/
  extension/        # Manifest V3 popup + capture pipeline
  figma-plugin/     # Figma plugin UI, message protocol & renderer integration
packages/
  capture-engine/   # rendered DOM to validated schema
  design-schema/    # Design Schema V0.1 implementation
  figma-renderer/   # Schema V0.1 to native editable Figma node tree renderer
  test-fixtures/    # deterministic example documents
```

## Commands

Requires Node.js 22.13 or newer and npm 10 or newer. Dependencies are pinned by the lockfile.

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run fidelity
```

Use `npm ci` for a reproducible install from the lockfile. Package builds emit only into their own `dist/` directories, which Git ignores. Typechecking and tests build dependencies first, so they also work before an initial full build.

## Current scope

W2D-001 through W2D-008 are implemented.
- The Chrome extension captures rendered web pages into validated Design Schema V0.1 JSON documents.
- The Figma plugin receives captures, validates them authoritatively via `@web2design/design-schema`, and renders them into native, editable Figma nodes via `@web2design/figma-renderer`.
- W2D-008 establishes a deterministic automated fidelity & regression suite locking the Browser → Schema → FakeFigmaHost pipeline across 13 controlled fixtures (7 canonical schema fixtures + 6 real Chrome smoke captures) with golden snapshot baselines and explicit numeric tolerances.
- Schema version remains `"0.1"`.

Follow [the Figma plugin workflow](apps/figma-plugin/README.md) to load the development plugin into Figma. Follow [the Chrome extension workflow](apps/extension/README.md) to load the unpacked extension.

Run `npm run smoke -w @web2design/extension` for the compiled-content rendered-browser fidelity suite. Run `npm run fidelity` for the cross-pipeline fixture & renderer fidelity suite. See [W2D-008 report](docs/w2d-008-report.md) for detailed verification matrices and regression results.

See [the schema contract](packages/design-schema/README.md) for coordinates, normalized style units, assets, validation, and version evolution, [the fixtures](packages/test-fixtures/README.md) for deterministic test examples, and [the renderer](packages/figma-renderer/README.md) for Figma node mapping and fidelity comparator specifications.

The project specification and backlog live in [Web2Design HQ](https://app.notion.com/p/3f8f40b3858e81cd9ae4e9c6a56e6aca).

## V0.1 non-goals

- Auto Layout inference
- CSS Grid reconstruction
- Component detection
- Design-system extraction
- Playwright URL crawler
- Backend or cloud services
- Accounts or authentication
- Billing
- AI redesign
- React/Tailwind export
- Universal support for every CSS feature
- Full DOM capture
