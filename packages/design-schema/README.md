# Design Schema V0.5

`@web2design/design-schema` is the stable wire contract between capture sources and design renderers.

Current wire producer version: `"0.5"`.

## Versions and Compatibility

Design Schema evolves with explicit version boundaries:

- **V0.1** (`"0.1"`): Solid fills only, uniform borders (`width: number`), single outer shadow.
- **V0.2** (`"0.2"`): Linear and radial gradient fills, ordered fill arrays.
- **V0.3** (`"0.3"`): Per-side borders (`top`, `right`, `bottom`, `left`), border styles, ordered multiple box shadows and inset shadows (`inset: boolean`).
- **V0.4** (`"0.4"`): Non-destructive descendant container clipping (`clip: { x: boolean, y: boolean }`) on `FrameNode`.
- **V0.5** (`"0.5"`): Current producer version. Renderer-neutral CSS 2D transforms and rotation (`transform?: Transform2D`) across all node types (`frame`, `rectangle`, `text`, `image`, `svg`).

### Read Compatibility & Normalization

All parser entrypoints (`parseDesignDocument`, `safeParseDesignDocument`) accept `"0.1"`, `"0.2"`, `"0.3"`, `"0.4"`, and `"0.5"` documents. Unknown versions (e.g. `"0.6"`, `"1.0"`) are explicitly rejected.

```ts
import {
  parseDesignDocument,
  safeParseDesignDocument,
  normalizeDesignDocument,
  upgradeDesignDocumentToLatest,
  type VersionedDesignDocument,
  type LatestDesignDocument,
} from "@web2design/design-schema";

// Parse any supported version (0.1, 0.2, 0.3, 0.4, or 0.5)
const versionedDoc = parseDesignDocument(json);

// Normalize historical documents to latest 0.5 representation without changing visual semantics
const latestDoc = normalizeDesignDocument(versionedDoc);
```

## CSS 2D Transform Model (V0.5)

Transforms represent renderer-neutral CSS 2D affine semantics while strictly distinguishing layout base bounds from visual post-transform bounding boxes:

```ts
export interface TransformMatrix2D {
  a: number; // m11 (scaleX * cos)
  b: number; // m12 (scaleX * sin)
  c: number; // m21 (-scaleY * sin)
  d: number; // m22 (scaleY * cos)
  e: number; // tx (translateX)
  f: number; // ty (translateY)
}

export interface TransformOrigin {
  x: number; // CSS pixels relative to base layout border box
  y: number; // CSS pixels relative to base layout border box
}

export interface BaseBounds {
  x: number; // Document layout X before this node's own CSS transform
  y: number; // Document layout Y before this node's own CSS transform
  width: number; // Untransformed layout border-box width
  height: number; // Untransformed layout border-box height
}

export interface Transform2D {
  matrix: TransformMatrix2D;
  origin: TransformOrigin;
  baseBounds: BaseBounds;
}
```

### Geometry Coexistence Rules

1. `node.x`, `node.y`, `node.width`, `node.height`: Final visual axis-aligned bounding box (AABB) in document coordinates (identical to legacy fidelity checks).
2. `node.transform.baseBounds`: Best-known layout border box before this node's own CSS transform was applied.
3. `node.transform.matrix`: Normalized 2D affine transform matrix (six numbers: `a, b, c, d, e, f`).
4. `node.transform.origin`: Transform origin in CSS pixels relative to `baseBounds` top-left.

## Container Clipping Model (V0.4 / V0.5)

Clipping is a container semantic rather than a paint or visual style. Defined exclusively on `FrameNode`:

```ts
interface ClipBehavior {
  x: boolean;
  y: boolean;
}

interface FrameNode extends BaseNode {
  type: "frame";
  clip?: ClipBehavior;
  children: DesignNode[];
}
```

## Border Model (V0.3 / V0.4 / V0.5)

Defined on `node.style.border`:

```ts
interface BorderSide {
  width: number;
  style: "solid" | "dashed" | "dotted" | "double";
  color: Color; // { r, g, b, a } in [0, 1]
}

interface Border {
  top: BorderSide;
  right: BorderSide;
  bottom: BorderSide;
  left: BorderSide;
}
```

## Shadow Model (V0.3 / V0.4 / V0.5)

Defined on `node.style.boxShadows`:

```ts
interface BoxShadow {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadRadius: number;
  color: Color; // { r, g, b, a } in [0, 1]
  inset?: boolean; // true for inset / INNER_SHADOW
}
```

## Fill Model (V0.2 / V0.3 / V0.4 / V0.5)

Visual style fills support an ordered array of fills:

```ts
type Fill = SolidFill | LinearGradientFill | RadialGradientFill;
```
