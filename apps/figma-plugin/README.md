# Web2Design Figma Plugin — W2D-017

Figma plugin for Web2Design. The plugin receives Web2Design JSON documents (from clipboard paste, sample loader, or file picker), validates them authoritatively in the plugin main runtime via `@web2design/design-schema`, and renders them into an editable hierarchy of native Figma nodes via `@web2design/figma-renderer`.

## Multi-Version Schema Support (W2D-017)

The plugin authoritatively supports **V0.1**, **V0.2**, **V0.3**, **V0.4**, **V0.5**, **V0.6**, and **V0.7** Design Schema documents:
- **Schema V0.1**: Solid fills and uniform borders. Backward-compatible read/import; normalized on-the-fly to latest representation.
- **Schema V0.2**: Linear and radial CSS gradients mapped to native Figma `GRADIENT_LINEAR` and `GRADIENT_RADIAL` paints.
- **Schema V0.3**: Per-side borders mapped to native individual stroke weights, and multiple/inset shadows mapped to native `DROP_SHADOW` and `INNER_SHADOW` effect stacks.
- **Schema V0.4**: Container clipping mapped to native `FrameNode.clipsContent = true`, unclipped frames to `false`, and single-axis clips approximated with explicit warning.
- **Schema V0.5**: CSS 2D transforms and rotations mapped to native Figma `rotation` / `relativeTransform` with origin compensation and uniform rescale support.
- **Schema V0.6**: Single-TextNode rich text paragraph flows rendered via native ranged Figma text APIs (`setRangeFontName`, `setRangeFontSize`, `setRangeFills`, `setRangeLetterSpacing`, `setRangeLineHeight`, `setRangeTextDecoration`, `setRangeHyperlink`).
- **Schema V0.7**: Current wire version. High-confidence Flexbox containers rendered as native editable Figma Auto Layout frames (`layoutMode: "HORIZONTAL" | "VERTICAL"`, `itemSpacing`, `padding*`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `strokesIncludedInLayout`), with support for `grow: true` (`layoutGrow = 1`), `stretch: true` (`layoutAlign = "STRETCH"`), and `positioning: "absolute"` (`layoutPositioning = "ABSOLUTE"`). Uninferred or ambiguous frames fall back to absolute positioning (`layoutMode = "NONE"`).
- **UI Summary**: Displays `Schema: 0.1` through `Schema: 0.7` depending on the imported payload.
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
                       │ Accepts VersionedDesignDocument (0.1 - 0.7)
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
