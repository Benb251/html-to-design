# Web2Design Figma Plugin

Figma plugin for Web2Design. The plugin receives Web2Design V0.1 JSON documents (from clipboard paste, sample loader, or file picker), validates them authoritatively in the plugin main runtime via `@web2design/design-schema`, and renders them into an editable hierarchy of native Figma nodes via `@web2design/figma-renderer`.

## Architecture & Runtime Separation

The plugin enforces Figma's two-environment security boundary:

```text
┌──────────────────────────────────────────────┐
│  Plugin UI (iframe sandboxed DOM)            │
│  - Paste JSON textarea                       │
│  - Load Sample Document                      │
│  - File picker (local .json file)            │
│  - Status banner & Document Summary metrics  │
│  - "Import to Figma" trigger button          │
│  - Import results & warnings visualization   │
└──────────────────────┬───────────────────────┘
                       │
                       │ postMessage (Typed Message Protocol)
                       │ (UiToPluginMessage / PluginToUiMessage)
                       ▼
┌──────────────────────────────────────────────┐
│  Plugin Main Runtime (JS sandbox)            │
│  - Authoritative validation boundary         │
│  - Session state & duplicate import guard    │
│  - Invokes @web2design/figma-renderer        │
│  - FigmaRendererHost production adapter      │
│  - figma.notify() diagnostic status          │
│  - Selection & viewport camera alignment     │
└──────────────────────────────────────────────┘
```

## Directory Structure

```text
apps/figma-plugin/
  manifest.json             # Source Figma plugin manifest (with image domain permissions)
  package.json              # Package metadata and dependencies
  tsconfig.json            # Strict TypeScript configuration
  src/
    main.ts                 # Plugin main runtime, session controller & message dispatcher
    host.ts                 # Production FigmaRendererHost adapter
    ui.ts                   # Plugin UI controller & event listeners
    messages.ts             # Strongly-typed discriminated message protocol
    summary.ts              # Deterministic document tree traversal & summary
  public/
    ui.html                 # Plugin UI markup structure with import actions
    ui.css                  # Modern UI stylesheet with status/result styles
  scripts/
    build.mjs               # Esbuild bundler & inliner for Figma sandbox
  test/
    fixtures.test.ts        # Validation tests across all fixtures & real captures
    messages.test.ts        # Message protocol, error handling & import flow tests
    summary.test.ts         # Tree traversal & summary calculation tests
  dist/                     # Build artifacts loaded into Figma
    manifest.json           # Development manifest pointing to bundled files
    main.js                 # Bundled plugin main runtime
    ui.html                 # Self-contained bundled UI with inlined CSS & JS
    sample-w2d-document.json# Canonical sample document derived from fixtures
```

## Network Access & Permissions

In W2D-007, the manifest requests network access for arbitrary user-captured image assets:

```json
"networkAccess": {
  "allowedDomains": ["*"],
  "reasoning": "Web2Design imports image assets referenced by user-selected website capture documents."
}
```

**Security Policy**: The plugin requests only image URLs that exist as validated asset records within the explicit user-supplied document during an active import operation. No analytics, tracking, telemetry, or third-party cloud APIs are used.

## Building the Plugin

To bundle the plugin into `dist/`:

```bash
npm run build -w @web2design/figma-plugin
```

Or build the entire repository:

```bash
npm run build
```

## Loading into Figma

1. Open the Figma desktop app (or Figma web in desktop browser).
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**.
3. Select `apps/figma-plugin/dist/manifest.json`.
4. Run **Web2Design** from the Development plugins menu.
5. Paste a Web2Design document (or click **Load Sample**).
6. Click **Validate & Prepare**.
7. Once validated, click **Import to Figma**.

## Testing & Fidelity Regression

Run automated tests (including W2D-008 plugin integration regression):

```bash
npm test -w @web2design/figma-plugin
```

Run TypeScript type check:

```bash
npm run typecheck -w @web2design/figma-plugin
```

### Integration Guarantees (W2D-008)
- **Lifecycle Protocol**: Tests complete `validate-document` → `import-document` → `import-started` → `import-success` pipeline.
- **Error Handling**: Renderer failure emits structured `import-error` and resets `isImporting` state.
- **In-Flight Guard**: Rejects concurrent / double-click import requests while an import is in-flight.
- **Transactional Rollback**: Fatal errors trigger root frame removal via `rootFrame.remove()` with zero canvas orphan nodes, while non-fatal recoverable child warnings do not trigger rollback.
- **Manifest Lock**: Protects `networkAccess.allowedDomains: ["*"]` from accidental regression to `none`.
- **Artifact Verification**: Verifies presence of bundled `manifest.json`, `main.js`, `ui.html`, and `sample-w2d-document.json`.

