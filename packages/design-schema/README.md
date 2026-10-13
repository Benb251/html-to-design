# Design Schema V0.3

`@web2design/design-schema` is the stable wire contract between capture sources and design renderers.

Current wire version: `"0.3"`.

## Versions and Compatibility

Design Schema evolves with explicit version boundaries:

- **V0.1** (`"0.1"`): Solid fills only, uniform borders (`width: number`), single outer shadow.
- **V0.2** (`"0.2"`): Linear and radial gradient fills, ordered fill arrays.
- **V0.3** (`"0.3"`): Current producer version. Per-side borders (`top`, `right`, `bottom`, `left`), border styles, ordered multiple box shadows and inset shadows (`inset: boolean`).

### Read Compatibility & Normalization

All parser entrypoints (`parseDesignDocument`, `safeParseDesignDocument`) accept `"0.1"`, `"0.2"`, and `"0.3"` documents. Unknown versions (e.g. `"0.4"`, `"1.0"`) are explicitly rejected.

```ts
import {
  parseDesignDocument,
  safeParseDesignDocument,
  normalizeDesignDocument,
  upgradeDesignDocumentToLatest,
  type VersionedDesignDocument,
  type LatestDesignDocument,
} from "@web2design/design-schema";

// Parse any supported version (0.1, 0.2, or 0.3)
const versionedDoc = parseDesignDocument(json);

// Normalize 0.1 or 0.2 documents to latest 0.3 representation without changing visual semantics
const latestDoc = normalizeDesignDocument(versionedDoc);
```

## Border Model (V0.3)

In V0.3, borders represent all four CSS sides independently:

```ts
type BorderStyle =
  | "none"
  | "hidden"
  | "solid"
  | "dashed"
  | "dotted"
  | "double"
  | "groove"
  | "ridge"
  | "inset"
  | "outset";

interface BorderSide {
  width: number; // CSS px >= 0
  style: BorderStyle;
  color: Color; // { r, g, b, a } in [0, 1]
}

interface Borders {
  top: BorderSide;
  right: BorderSide;
  bottom: BorderSide;
  left: BorderSide;
}
```

## Shadow Model (V0.3)

In V0.3, box shadows represent an ordered list preserving computed CSS stack order:

```ts
interface BoxShadow {
  offsetX: number; // CSS px (positive right)
  offsetY: number; // CSS px (positive down)
  blurRadius: number; // CSS px >= 0
  spreadRadius?: number; // CSS px
  color: Color; // { r, g, b, a } in [0, 1]
  inset?: boolean; // true for inset / INNER_SHADOW
}
```

## Fill Model (V0.2 / V0.3)

Visual style fills support an ordered array of fills:

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
```ts
interface LinearGradientFill {
  type: "linear-gradient";
  angle: number; // 0..360 degrees (0deg = to top, 90deg = to right, 180deg = to bottom)
  stops: GradientStop[]; // at least 2 stops
}
```

### 3. Radial Gradient Fill
```ts
interface RadialGradientFill {
  type: "radial-gradient";
  center: { x: number; y: number }; // normalized [0, 1] relative to element box
  radius: { x: number; y: number }; // normalized [0, 1] relative to element box
  shape?: "circle" | "ellipse";
  stops: GradientStop[]; // at least 2 stops
}
```

## Layer Ordering

CSS layers multiple backgrounds and background images over background colors:
- In Design Schema, `fills` is ordered from top layer (`fills[0]`) to underlying layer (`fills[length - 1]`).
- `boxShadows` is ordered from top shadow (`boxShadows[0]`) to bottom shadow (`boxShadows[length - 1]`).
- Renderers map these collections to target platform paint and effect ordering.
