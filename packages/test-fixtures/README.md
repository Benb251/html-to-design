# Design Schema fixtures

Seven deterministic TypeScript documents cover:

1. Simple text.
2. Rectangle/card with solid fill, border, and corner radius.
3. Card with multiple text children.
4. Image with an asset reference.
5. Inline SVG.
6. Basic box shadow.
7. Nested frames with absolute coordinates.

Import individual fixtures or `representativeFixtures` from `@web2design/test-fixtures` after building the workspace. Timestamps, IDs, geometry, and styles are fixed. Tests parse every fixture and round-trip it through JSON, with explicit assertions for geometry/style/asset semantics.

URLs under `example.com` are illustrative references; tests never access the network. These are schema fixtures, not captured HTML pages or visual-renderer acceptance evidence.
