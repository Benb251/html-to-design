# Controlled fidelity fixtures

All pages use local CSS and system fonts, without remote assets.

| Page | Coverage |
| --- | --- |
| landing.html | Original W2D-003 popup/manual sanity and scroll fixture |
| fidelity-geometry.html | Padding, border, margin, both box-sizing modes, nested/fractional boxes, negative positions, long/offscreen document and both scroll axes |
| fidelity-text.html | Padded text, multiline Ranges, multiple direct text runs, standalone spaces, normal/pre/pre-wrap/nowrap/pre-line, leading breaks, BR, NBSP/pre spaces and typography |
| fidelity-styles.html | Solid/translucent/transparent fills, body canvas, uniform borders, circular/per-corner/overlapping radius, shadow-only grouping, nested opacity and color(srgb) |
| fidelity-limits.html | Multiple/inset shadows, gradient, asymmetric border, ellipse, transform, z-index, fixed/sticky, hidden subtrees, visible override and wrapper pruning |
| fidelity-assets.html | PNG/data images, relative/srcset URLs, URL deduplication, inline/styled/defs SVGs, broken images, and canvas/media warnings |

`npm run fixture -w @web2design/extension` serves `/` as the landing page and these exact filenames at `http://127.0.0.1:4173/`. It accepts only the fixed fixture list.

`npm run smoke -w @web2design/extension` extends the existing Chrome CDP harness at 800×600 CSS pixels. The actual compiled content path is checked against independent browser measurements and concrete expected values with 0.04px geometry and 0.000001 color tolerance. Captures and named result totals are written to ignored `.smoke/` files. Chrome message transport is stubbed; this is not installation/clipboard/download evidence.
