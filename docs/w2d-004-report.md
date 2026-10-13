# W2D-004 — Geometry + Basic Style Fidelity

Validated 2026-10-13, Asia/Saigon. Implementation and required automated validation are complete. No commit or push was performed. Figma rendering and image/SVG asset capture were not implemented.

## Repository before work

- Branch: `main`.
- HEAD: unavailable. The repository has no commits (unborn HEAD).
- Git status: `?? .gitignore`, `?? README.md`, `?? apps/`, `?? docs/`, `?? eslint.config.mjs`, `?? package-lock.json`, `?? package.json`, `?? packages/`, `?? tsconfig.base.json`.
- Inspected W2D-003 report/verification, extension and capture README/source/tests, Design Schema V0.1 source/contract, landing fixture, smoke harness and prior smoke JSON before editing.
- No applicable repository AGENTS.md was found. Existing files were preserved; a SHA-256 baseline in ignored `.smoke/w2d-004-before.json` identifies changed source files despite the lack of a Git commit. Schema files, original fixture package, extension popup/content/orchestration implementation, manifest, dependency files and Figma shell remain unchanged.

## W2D-003 sanity result

Before fidelity edits, `npm run build` and the existing `npm run smoke -w @web2design/extension` both passed. The landing capture contained 21 nodes and 10 text nodes, passed V0.1 parsing, stayed geometrically stable after scroll and retained idempotent content injection.

Interactive Chrome GUI was available. The unpacked Web2Design extension was observed enabled; Chrome's extension settings independently confirmed its path was `D:\Tool\html-to-design\apps\extension\dist`. The real toolbar popup opened on the supplied local landing fixture. Capture Page produced Success, Nodes: 21, Warnings: 1 and JSON. Copy JSON reported success; system clipboard contents were independently parsed successfully with the real V0.1 validator and retained in `.smoke/interactive-clipboard.json`.

Download JSON opened Chrome's actual Save As dialog with the expected filename. Saving the file was not completed. The user stopped Computer Use with physical Escape, and GUI automation ceased. Loading/fixture navigation involved user interaction as well as agent observation; this is an observed interactive sanity result, not a claim that the entire installation was autonomously performed. No real capture defect was found. The final rebuilt W2D-004 extension was not reloaded/retested through the GUI.

## Implemented

- Preserved absolute document-origin CSS-pixel geometry, including fractions, negative/offscreen positions, nested containers, box model and both scroll axes. Root extents now include fractional HTML/BODY measurements.
- Kept individual direct DOM text nodes editable and Range-measured. Added browser-driven handling of collapsed edge whitespace, standalone inline spaces, NBSP, preformatted whitespace-only runs and pre-line leading breaks. CR/CRLF normalize to LF.
- Added safe normalization of computed `color(srgb ...)` alongside rgb/rgba/hex/transparent. Alpha remains separate from local node opacity.
- Improved normalized per-side equality checks for uniform borders. Supported solid/dashed/dotted/double styles stay intact; asymmetric borders are omitted with warnings.
- Preserved supported circular pixel uniform/per-corner radii and reduced overlapping corners to their used circular size. Elliptical/percentage corners warn and omit.
- Implemented single outer box-shadow capture: offsetX/Y, blurRadius, signed spreadRadius, color alpha, inset=false. `none` is empty; multiple/inset/unresolved shadows warn and omit the complete shadow feature.
- Preserved shadow-only groups and nested opacity ancestors. Children keep local opacity rather than ancestor products.
- Captured HTML/BODY canvas solid backgrounds once, avoiding duplicate translucent BODY fills when propagated to the canvas, following [CSS background propagation](https://www.w3.org/TR/css-backgrounds-3/#body-background).
- Added deterministic representative feature/node warnings with valid references. Preserved DOM order and fixed/sticky omission; explicit z-index/flex order and transforms warn.
- Expanded the existing compiled-content Chrome smoke and manual fixture server, without another browser harness or crawler.

## Capture-engine changes

`src/text.ts` measures direct text Ranges and uses edge Range widths to distinguish collapsed-away spacing. Multiline/bidirectional text remains one editable union box with a warning. Typography retains requested family/fallbacks, positive pixel size/line height, weight/style/alignment/tracking and normalized color. Normal line-height remains the documented warned 1.2 × size policy; normal tracking is 0. Unresolved weight/tracking now warn.

`styles.ts` tokenizes shadows at parenthesis depth zero, so rgba commas are not mistaken for multiple shadows. Border comparisons use normalized values. Pixel corners respect overlap reduction using the browser's untransformed rendered box dimensions. Node opacity never absorbs color alpha.

Traversal stays bounded: one computed-style read per element, constant Range measurements per text run, no repeated full-DOM scans or O(n²) parent searches. Warnings deduplicate by code and reference the first emitted affected node when possible; references to pruned/omitted nodes are removed before public schema validation.

## Fixture coverage

Four readable pages supplement the unchanged landing fixture:

1. Geometry: content/padding/border/margin, content-box/border-box, nested/fractional boxes, negative/partially offscreen boxes, long documents and horizontal/vertical scroll stability.
2. Text: multiline, padded container, direct text-node separation, inline spaces, typography, normal/pre/pre-wrap/nowrap/pre-line, leading breaks, BR, NBSP and preformatted spaces.
3. Styles: solid/translucent/transparent backgrounds, BODY canvas, uniform solid/dashed/dotted/double borders, uniform/per-corner/overlapping radius, single shadow, shadow-only hierarchy, nested opacity and computed sRGB color syntax.
4. Limits: gradients, multiple/inset shadows, asymmetric border, ellipse, transform, z-index, fixed/sticky, hidden/non-rendered content, visible overrides, display-contents and safe wrapper pruning.

The 34 named headless fidelity checks compare actual compiled output with independent browser rectangles/Ranges and concrete expected styles. Geometry tolerance is 0.04 CSS pixels; normalized color tolerance is 0.000001. Final documents pass the unchanged public parser. Evidence: `.smoke/capture.json`, four fidelity JSON files, `fidelity-results.json`, `w2d-004-validation.json`.

## Supported fidelity matrix

| Feature | Status |
| --- | --- |
| Geometry | Supported: absolute document-origin border boxes, fractions preserved |
| Text geometry | Improved/basic: per-DOM-run Range; multiline union warning |
| Solid fill / text color | Supported for normalized computed sRGB forms |
| Typography | Supported/basic; normal line-height is explicit approximation |
| Uniform border | Supported: solid, dashed, dotted, double |
| Circular pixel radius | Supported: uniform and per-corner, overlap reduction |
| Single outer shadow | Supported |
| Opacity | Supported/local |
| DOM hierarchy/order | Supported within documented capture scope |
| Gradient/background images/layers | Unsupported/warning |
| Per-side borders, elliptical/percentage radii | Unsupported/omitted with warning |
| Multiple/inset shadows | Unsupported/omitted with warning |
| Transform semantics | Partial/browser-rendered box with warning |
| Fixed/sticky | Unsupported/omitted with warning |
| Full stacking contexts | Unsupported; obvious ordering differences warn |
| Images/SVG | Deferred W2D-005 |

## Tests

**182 unit tests pass across 6 files**, up from 130: extension 21, capture-engine 92 (40 original + 52 new), schema 53, schema fixtures 16. No original tests were removed. One original pre-line expectation was corrected to match browser space collapsing around line breaks. Initial fixture/mock failures and a test-only TypeScript error were corrected; the final checks below were rerun successfully.

Separately: **34 headless rendered fidelity checks pass across 5 fixture pages**, plus the preserved landing smoke assertions. These are distinct from the 182 Vitest tests.

## Validation

| Command | Final result |
| --- | --- |
| `npm run build` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0 |
| `npm test` | PASS, exit 0; 182 tests |
| `npm run smoke -w @web2design/extension` | PASS, exit 0; 34 fidelity checks / 5 pages |

Final `apps/extension/dist` contains a verified Manifest V3 package and required popup HTML/CSS/JS and content bundle. Headless tests execute that actual compiled content bundle in an isolated world with only Chrome message transport stubbed. Popup copy/download tests use mocks and are not OS/browser verification.

## Manual verification

- Automated verification: **PASS**.
- Headless rendered-browser verification: **PASS**.
- Interactive Load unpacked verification: **PASS for pre-change W2D-003 sanity** — observed enabled from this dist path, actual toolbar capture/count/JSON succeeded. **Final W2D-004 GUI reload/retest: NOT AVAILABLE for the remainder of this run after Computer Use was stopped**.
- Real clipboard verification: **PASS for W2D-003 sanity** — actual clipboard JSON parsed successfully; final W2D-004 GUI copy was not retested.
- Real browser download verification: **NOT TESTED to completion** — actual Save As dialog opened; file save/read-back not completed.

## Schema changes

**None.** Wire version remains `"0.1"`. Schema source, strict validation, public API and existing schema tests are unchanged. V0.1 already supports the basic shadow, border patterns and per-corner circular radius needed here.

## Known limitations

Multiline text is a union box rather than independently reconstructed lines. Normal line-height is approximated. Custom tab stops, baselines/shaping, actual font resolution, mixed element runs and text decoration remain deferred. Wide-gamut colors are warned rather than guessed.

Complex clipping/overflow/internal scrollers, pseudo-elements, generated content, full stacking/occlusion, transforms, filters, backgrounds/layers, complete root/group compositor semantics, fixed/sticky, iframe/shadow DOM, assets, responsive layout and lazy loading remain limited or unsupported. Capture reflects the currently loaded page and does not freeze animations or mutations. Warnings provide representative affected nodes rather than every occurrence. Exact dashed/dotted border dash placement is not encoded.

## Files changed

- `packages/capture-engine/src/capture.ts`, `styles.ts`, `index.ts`; new `text.ts`.
- `packages/capture-engine/test/capture.test.ts`; new `fidelity.test.ts`.
- `apps/extension/scripts/smoke.mjs`, `serve-fixture.mjs`.
- Four new `apps/extension/fixtures/fidelity-*.html` pages and fixture README.
- Root, extension and capture-engine READMEs; this report.
- Ignored regenerated extension/package builds and verification evidence.

## Recommended next step

**W2D-005 — Image + SVG asset capture.** No corrective W2D-004 implementation defect remains in the checks performed. Keep the final-build GUI reload, actual clipboard and completed download verification as a pending manual checklist; headless results do not replace it. Do not begin Figma rendering as part of this completed task.
