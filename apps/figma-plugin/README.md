# Web2Design Figma Plugin

Figma plugin application shell for Web2Design. The plugin receives Web2Design V0.1 JSON documents (from clipboard paste, sample loader, or file picker), validates them authoritatively in the plugin main runtime via `@web2design/design-schema`, and presents a structured document summary in the plugin UI.

## Architecture & Runtime Separation

The plugin enforces Figma's two-environment security boundary:

```text
┌──────────────────────────────────────────────┐
│  Plugin UI (iframe sandboxed DOM)            │
│  - Paste JSON textarea                       │
│  - Load Sample Document                      │
│  - File picker (local .json file)            │
│  - Status banner & Document Summary metrics  │
│  - Serializable error presentation           │
└──────────────────────┬───────────────────────┘
                       │
                       │ postMessage (Typed Message Protocol)
                       │ (UiToPluginMessage / PluginToUiMessage)
                       ▼
┌──────────────────────────────────────────────┐
│  Plugin Main Runtime (JS sandbox)            │
│  - Authoritative validation boundary         │
│  - Safe JSON parser                          │
│  - @web2design/design-schema V0.1 validation │
│  - Reusable AST tree traversal / metrics     │
│  - Zero canvas mutation during W2D-006       │
│  - figma.notify() diagnostic status          │
└──────────────────────────────────────────────┘
```

## Directory Structure

```text
apps/figma-plugin/
  manifest.json             # Source Figma plugin manifest
  package.json              # Package metadata and dependencies
  tsconfig.json            # Strict TypeScript configuration
  src/
    main.ts                 # Plugin main runtime & message dispatcher
    ui.ts                   # Plugin UI controller & event listeners
    messages.ts             # Strongly-typed discriminated message protocol
    summary.ts              # Deterministic document tree traversal & summary
  public/
    ui.html                 # Plugin UI markup structure
    ui.css                  # Modern UI stylesheet
  scripts/
    build.mjs               # Esbuild bundler & inliner for Figma sandbox
  test/
    fixtures.test.ts        # Validation tests across all fixtures & real captures
    messages.test.ts        # Message protocol & error handling tests
    summary.test.ts         # Tree traversal & summary calculation tests
  dist/                     # Build artifacts loaded into Figma
    manifest.json           # Development manifest pointing to bundled files
    main.js                 # Bundled plugin main runtime
    ui.html                 # Self-contained bundled UI with inlined CSS & JS
    sample-w2d-document.json# Canonical sample document derived from fixtures
```

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

## Testing

Run automated tests:

```bash
npm test -w @web2design/figma-plugin
```

Run TypeScript type check:

```bash
npm run typecheck -w @web2design/figma-plugin
```
