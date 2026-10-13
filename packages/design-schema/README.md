# Design Schema V0.2

`@web2design/design-schema` is the stable boundary between capture sources and design renderers.

Current wire version: `"0.2"`.

## Versions and Compatibility

Design Schema evolves with explicit version boundaries:

- **V0.1** (`"0.1"`): Solid fills only (`type: "solid"`). Strict schema rejecting gradient fills.
- **V0.2** (`"0.2"`): Current producer version. Adds first-class renderer-neutral gradient fills (`linear-gradient` and `radial-gradient`).

### Read Compatibility & Normalization

All parser entrypoints (`parseDesignDocument`, `safeParseDesignDocument`) accept both `"0.1"` and `"0.2"` documents. Unknown versions (e.g. `"0.3"`, `"1.0"`) are explicitly rejected.

```ts
import {
  parseDesignDocument,
  safeParseDesignDocument,
  normalizeDesignDocument,
  upgradeDesignDocumentToLatest,
  type VersionedDesignDocument,
  type LatestDesignDocument,
} from "@web2design/design-schema";

// Parse any supported version (0.1 or 0.2)
const versionedDoc = parseDesignDocument(json);

// Normalize 0.1 documents to latest 0.2 representation without changing visual semantics
const latestDoc = normalizeDesignDocument(versionedDoc);
```

## Coordinates

All node geometry uses CSS pixels. `x` and `y` are absolute coordinates relative to the captured document origin, not relative to the current viewport and not relative to the parent node. `width` and `height` are rendered CSS-pixel dimensions. Viewport scroll offsets are stored separately as capture metadata.

This choice makes documents deterministic and keeps renderers focused on visual fidelity. Parent-relative layout and Auto Layout inference can be derived later.

The origin is the document's top-left corner; positive x points right and positive y points down. Negative positions and fractional CSS pixels are preserved.

## Document shape

A document contains:

- the explicit `schemaVersion` (`"0.2"` current wire version; `"0.1"` supported for backward compatibility),
- capture metadata,
- viewport metadata,
- a frame root node,
- an asset registry,
- optional warnings for unsupported or approximated features.

Node kinds are `frame`, `text`, `rectangle`, `image`, and `svg`. Leaf nodes carry an empty `children` array; frames own nested nodes.

## Fill Model (V0.2)

In V0.2, visual style fills support an ordered array of fills:

```ts
type Fill = SolidFill | LinearGradientFill | RadialGradientFill;
```

### 1. Solid Fill

```ts
interface SolidFill {
  type: "solid";
  color: Color; // { r, g, b, a } in [0, 1]
}
```

### 2. Linear Gradient Fill

Renderer-neutral representation of linear CSS gradients:

```ts
interface LinearGradientFill {
  type: "linear-gradient";
  angle: number; // 0..360 degrees (0deg = to top, 90deg = to right, 180deg = to bottom)
  stops: GradientStop[]; // at least 2 stops
}
```

### 3. Radial Gradient Fill

Renderer-neutral representation of radial CSS gradients:

```ts
interface RadialGradientFill {
  type: "radial-gradient";
  center: { x: number; y: number }; // normalized [0, 1] relative to element box
  radius: { x: number; y: number }; // normalized [0, 1] relative to element box
  shape?: "circle" | "ellipse";
  stops: GradientStop[]; // at least 2 stops
}
```

### 4. Gradient Stops

```ts
interface GradientStop {
  position: number; // normalized [0, 1], non-decreasing
  color: Color; // { r, g, b, a } in [0, 1]
}
```

## Layer Ordering

CSS layers multiple backgrounds and background images over background colors:
- In Design Schema, `fills` is ordered from top layer (`fills[0]`) to underlying layer (`fills[length - 1]`).
- For example, a gradient painted over a solid color has `fills: [LinearGradientFill, SolidFill]`.
- Renderers map this collection to target platform paint ordering (e.g. Figma plugin API bottom-to-top Paint order).

## Style and text units

- Color uses normalized sRGB `r/g/b/a` channels in [0, 1]. An omitted color alpha becomes 1.
- `opacity` is local to the node/group, in [0, 1]; capture sources avoid multiplying inherited opacity into children.
- Border width, corner radii, shadow offsets/blur/spread, font size, resolved line height, and letter spacing are all CSS pixels.
- Borders are uniform around the box. Radii are a uniform scalar or four named circular corners.
- Shadows support ordered basic box shadows; an omitted `inset` becomes false.
- `fontFamily` is the primary requested family. `fontFallbacks` preserves ordered fallback candidates.
- Text uses one style per node.
