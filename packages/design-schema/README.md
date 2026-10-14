# Design Schema V0.7

`@web2design/design-schema` is the stable wire contract between capture sources and design renderers.

Current wire producer version: `"0.7"`.

## Versions and Compatibility

Design Schema evolves with explicit version boundaries:

- **V0.1** (`"0.1"`): Solid fills only, uniform borders (`width: number`), single outer shadow.
- **V0.2** (`"0.2"`): Linear and radial gradient fills, ordered fill arrays.
- **V0.3** (`"0.3"`): Per-side borders (`top`, `right`, `bottom`, `left`), border styles, ordered multiple box shadows and inset shadows (`inset: boolean`).
- **V0.4** (`"0.4"`): Non-destructive descendant container clipping (`clip: { x: boolean, y: boolean }`) on `FrameNode`.
- **V0.5** (`"0.5"`): Renderer-neutral CSS 2D transforms and rotation (`transform?: Transform2D`) across all node types (`frame`, `rectangle`, `text`, `image`, `svg`).
- **V0.6** (`"0.6"`): Rich-text paragraph spans (`runs?: TextRun[]`) on `TextNode` representing ordered, non-overlapping character style ranges with hyperlinks.
- **V0.7** (`"0.7"`): Current producer version. Optional high-confidence semantic Flexbox Auto Layout metadata (`layout?: AutoLayout`) on `FrameNode` and child layout metadata (`layoutChild?: AutoLayoutChild`) on flow and absolute children, while preserving exact absolute coordinates (`x, y, width, height`).

### Read Compatibility & Normalization

All parser entrypoints (`parseDesignDocument`, `safeParseDesignDocument`) accept `"0.1"`, `"0.2"`, `"0.3"`, `"0.4"`, `"0.5"`, `"0.6"`, and `"0.7"` documents. Unknown versions (e.g. `"0.8"`, `"1.0"`) are explicitly rejected.

```ts
import {
  parseDesignDocument,
  safeParseDesignDocument,
  normalizeDesignDocument,
  upgradeDesignDocumentToLatest,
  type VersionedDesignDocument,
  type LatestDesignDocument,
} from "@web2design/design-schema";

// Parse any supported version (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, or 0.7)
const versionedDoc = parseDesignDocument(json);

// Normalize historical documents to latest 0.7 representation (with layout: undefined)
const latestDoc = normalizeDesignDocument(versionedDoc);
```

### Critical Normalization Rule

Historical documents (V0.1–V0.6) normalize to V0.7 with `layout: undefined` and `layoutChild: undefined`.
Schema normalization does **NOT** perform retroactive layout inference from absolute coordinates.
Inference only occurs during live browser capture traversal.

## Semantic Auto Layout Model (V0.7)

In V0.7, `FrameNode` is extended with optional semantic Auto Layout metadata:

```ts
export interface AutoLayoutPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AutoLayout {
  type: "flex";
  direction: "horizontal" | "vertical";
  gap: number;
  padding: AutoLayoutPadding;
  primaryAlign: "start" | "center" | "end" | "space-between";
  crossAlign: "start" | "center" | "end" | "stretch";
  primarySizing?: "fixed" | "hug" | "fill";
  crossSizing?: "fixed" | "hug" | "fill";
  confidence: "high";
}
```

Child nodes (`FrameNode`, `RectangleNode`, `TextNode`, `ImageNode`, `SvgNode`) carry optional child layout metadata:

```ts
export interface AutoLayoutChild {
  grow?: boolean;
  stretch?: boolean;
  positioning?: "auto" | "absolute";
}
```

### Renderer-Neutral Contract

The schema layout model is strictly renderer-neutral:
- Uses `direction: "horizontal" | "vertical"` (not Figma `layoutMode: "HORIZONTAL"`).
- Uses `primaryAlign: "start" | "center" | "end" | "space-between"` (not Figma `primaryAxisAlignItems: "MIN"`).
- Preserves absolute layout coordinates (`x`, `y`, `width`, `height`) on all nodes unconditionally.
- CSS Grid semantics remain explicitly deferred (`GRID_LAYOUT_SEMANTICS_DEFERRED`).
