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
  extension/        # Manifest V3 popup + first capture pipeline
  figma-plugin/     # reserved package shell for later renderer integration
packages/
  capture-engine/   # rendered DOM to validated schema
  design-schema/    # Design Schema V0.1 implementation
  test-fixtures/    # deterministic example documents
```

The `figma-renderer` package will be added when renderer implementation begins.

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

M0 tooling, W2D-001 workspace bootstrap, W2D-002 Design Schema V0.1, W2D-003 first capture, W2D-004 geometry/basic style fidelity, and W2D-005 image/SVG asset capture are implemented. The Figma plugin is still a reserved package shell. The Chrome extension builds into `apps/extension/dist` and captures the current rendered page into validated JSON. Schema version remains `"0.1"`.

Follow [the Chrome extension workflow](apps/extension/README.md) to load the unpacked extension and test the local landing-page fixture. [The capture-engine contract](packages/capture-engine/README.md) lists today's supported cases and limitations.

Run `npm run smoke -w @web2design/extension` after building for the compiled-content rendered-browser fidelity suite. See [fixture coverage](apps/extension/fixtures/README.md) and [W2D-005 report](docs/w2d-005-report.md) for checks and verification boundaries.

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

