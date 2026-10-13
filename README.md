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

**Fidelity before semantics.**

V0.1 preserves rendered visual appearance and deterministic absolute geometry first. Smart layout reconstruction can be layered on later without changing the capture/renderer boundary.

The Design Schema is that boundary. Capture implementations may use DOM APIs, browser APIs, computed styles, or server-side browser automation internally, but renderer packages must consume only the versioned Design Schema. Raw DOM objects and unrestricted computed-style dumps are not part of the renderer contract.

## Workspace

```text
apps/
  extension/        # Manifest V3 popup + capture pipeline
  figma-plugin/     # Figma plugin shell, UI, message protocol & schema validation
packages/
  capture-engine/   # rendered DOM to validated schema
  design-schema/    # Design Schema V0.1 implementation
  test-fixtures/    # deterministic example documents
```

The `figma-renderer` package will be attached in W2D-007 after the validation boundary.

## Commands

Requires Node.js 22.13 or newer and npm 10 or newer. Dependencies are pinned by the lockfile.

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
```

Use `npm ci` for a reproducible install from the lockfile. Package builds emit only into their own `dist/` directories, which Git ignores. Typechecking and tests build the schema dependency first, so they also work before an initial full build.

## Current scope

W2D-001 through W2D-005 (M1 Capture) and W2D-006 (Figma Plugin Shell) are implemented. The Figma plugin builds into `apps/figma-plugin/dist/` (`manifest.json`, `main.js`, `ui.html`, `sample-w2d-document.json`) and handles document reception, typed message bridging, and authoritative Design Schema V0.1 validation. Canvas rendering is reserved for W2D-007.

Follow [the Figma plugin workflow](apps/figma-plugin/README.md) to load the development plugin into Figma. Follow [the Chrome extension workflow](apps/extension/README.md) to load the unpacked extension.

Run `npm run smoke -w @web2design/extension` after building for the compiled-content rendered-browser fidelity suite. See [W2D-006 report](docs/w2d-006-report.md) for verification boundaries and test coverage.

See [the schema contract](packages/design-schema/README.md) for coordinates, normalized style units, assets, validation, and version evolution, and [the fixtures](packages/test-fixtures/README.md) for the seven deterministic examples.

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
- Full Figma rendering

