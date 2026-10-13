# Design Schema V0.1

`@web2design/design-schema` is the stable boundary between capture sources and design renderers.

## Coordinates

All node geometry uses CSS pixels. `x` and `y` are absolute coordinates relative to the captured document origin, not relative to the current viewport and not relative to the parent node. `width` and `height` are rendered CSS-pixel dimensions. Viewport scroll offsets are stored separately as capture metadata.

This choice makes a V0.1 document deterministic and keeps the first renderer focused on visual fidelity. Parent-relative layout and Auto Layout inference can be derived later.

The origin is the document's top-left corner; positive x points right and positive y points down. Negative positions and fractional CSS pixels are preserved, with no implicit rounding or device-pixel scaling. A browser capture can normalize viewport rectangles by adding captured scroll offsets. The viewport describes the capture context, not the root's maximum dimensions. A renderer deriving local coordinates subtracts the parent's absolute position from the child's.

Geometry is an axis-aligned rendered border box. Rotation, skew, clipping, and arbitrary transforms are not modeled by V0.1 and should generate capture warnings when fidelity is affected.

## Document shape

A document contains:

- the explicit `schemaVersion` (`"0.1"`),
- capture metadata,
- viewport metadata,
- a frame root node,
- an asset registry,
- optional warnings for unsupported or approximated features.

V0.1 node kinds are `frame`, `text`, `rectangle`, `image`, and `svg`. Leaf nodes carry an empty `children` array; frames own nested nodes.

Visual styles model normalized fills, border, corner radius, and basic box shadows. Text nodes model normalized typography. The schema deliberately does not expose a raw CSS-property bag as its main styling contract.

Children and fills are ordered from back to front; preserve that order when rendering. Frames are structural groups and do not imply clipping or layout inference. IDs are unique within each document. References to assets and warning nodes are checked across the entire nested tree.

## Style and text units

- Color uses normalized sRGB `r/g/b/a` channels in [0, 1]. An omitted color alpha becomes 1.
- `opacity` is local to the node/group, in [0, 1]; capture sources must avoid multiplying inherited opacity into every child again.
- Border width, corner radii, shadow offsets/blur/spread, font size, resolved line height, and letter spacing are all CSS pixels.
- Borders are uniform around the box. Radii are a uniform scalar or four named circular corners. Elliptical radii and per-side borders require warnings until modeled in a later version.
- Fills support solid color only. Shadows support ordered basic box shadows; an omitted `inset` becomes false.
- `fontFamily` is the primary requested family. Optional `fontFallbacks` preserves ordered fallback candidates without committing the schema to a Figma font-resolution strategy.
- Text uses one style per node. Mixed-style runs, text decorations, gradients, filters, blend modes, and CSS stacking-context reconstruction are deferred; capture sources must report unsupported or approximated features.

## Assets

Image and SVG nodes may reference asset records by ID. Asset sources support URL, data URL, and embedded base64 payloads. Records can carry a content hash, MIME type, and intrinsic dimensions. Downloading or resolving those assets belongs to a capture implementation and is outside this package.

Asset IDs are unique. Image nodes require image-kind assets; SVG references require SVG-kind assets. Inline SVG content or an SVG asset reference is required. If both are supplied, inline content takes precedence, and the reference must still be valid.

Convert blob-derived bytes to the embedded base64 source when a portable payload is needed; browser-local blob object handles are not schema values. Hashes are optional opaque provider-supplied fingerprints (prefer an algorithm-prefixed digest). The validator does not download URLs, verify bytes against hashes/MIME types, parse SVG XML, sanitize SVG, or resolve fonts; those responsibilities belong to future capture/import implementations.

## Developer API

```ts
import {
  parseDesignDocument,
  safeParseDesignDocument,
  DesignDocumentValidationError,
  type DesignDocument,
  type DesignNode,
} from "@web2design/design-schema";

const result = safeParseDesignDocument(payload);
if (result.success) {
  const document: DesignDocument = result.data;
  // Renderer consumes this portable schema, independent of the capture source.
} else {
  // result.issues contains path, code, and message.
}
```

`parseDesignDocument(input: unknown)` returns a validated document or throws `DesignDocumentValidationError` with normalized `issues`. `safeParseDesignDocument(input: unknown)` returns a success/failure union. No Zod schemas or errors are exposed through the package entry point. Parsing does not mutate the input; normalized defaults are present in the returned document.

Inputs are JSON-compatible, acyclic documents. In-process circular object graphs are outside the wire contract. Warnings may be global or refer to an existing node; each has a stable code and a human-readable message.

## Version evolution

Unknown schema versions are rejected. A future schema revision should introduce a new explicit version and a deliberate migration step before parsing into the current renderer contract. Breaking changes must never be silently accepted as V0.1.

Unknown object fields are rejected rather than silently discarded. New contract fields or changed semantics require an explicit schema revision; readers must not reinterpret a newer payload as `"0.1"`. The package's npm version (`0.1.0`) and the document wire version (`"0.1"`) have separate purposes: implementation patches can leave the wire version unchanged.

Future migrations should be pure functions between explicit version contracts, selected at the package boundary before renderer use. No unused migration registry is introduced until another version exists.

