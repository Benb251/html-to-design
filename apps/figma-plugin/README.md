# Web2Design Figma Plugin — W2D-012

Figma plugin for Web2Design. The plugin receives Web2Design JSON documents (from clipboard paste, sample loader, or file picker), validates them authoritatively in the plugin main runtime via `@web2design/design-schema`, and renders them into an editable hierarchy of native Figma nodes via `@web2design/figma-renderer`.

## Multi-Version Schema Support (W2D-012)

The plugin authoritatively supports both **V0.1** and **V0.2** Design Schema documents:
- **Schema V0.1**: Solid fills only. Backward-compatible read/import; normalized on-the-fly to latest representation.
- **Schema V0.2**: Current wire version. Linear and radial CSS gradients mapped to native Figma `GRADIENT_LINEAR` and `GRADIENT_RADIAL` paints.
- **UI Summary**: Displays `Schema: 0.1` or `Schema: 0.2` depending on the imported payload.
- **Plugin Data**: Preserves the original wire version in root frame plugin data (`web2design:schemaVersion`).

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
                       │ Accepts VersionedDesignDocument (0.1 or 0.2)
                       ▼
┌──────────────────────────────────────────────┐
│  Plugin Main Runtime (JS sandbox)            │
│  - Authoritative validation boundary         │
│  - normalizeDesignDocument(doc)              │
│  - Session state & duplicate import guard    │
│  - Invokes @web2design/figma-renderer        │
│  - FigmaRendererHost production adapter      │
│  - figma.notify() diagnostic status          │
│  - Selection & viewport camera alignment     │
└──────────────────────────────────────────────┘
```

## Build and Testing

```bash
npm run build -w @web2design/figma-plugin
npm test -w @web2design/figma-plugin
```

Build artifact is generated into `apps/figma-plugin/dist/manifest.json`.
