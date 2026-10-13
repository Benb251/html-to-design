# Web2Design foundation report

Validated on 2026-10-13 (Asia/Saigon). Scope: M0 foundation tooling, W2D-001 workspace bootstrap, W2D-002 Design Schema V0.1.

## Repository before work

- Workspace: `D:\Tool\html-to-design`.
- Classification: empty/new workspace, with no existing files or architecture.
- Git: not initialized; branch and HEAD were unavailable.
- Clean/dirty state: not applicable before initialization; no pre-existing user changes.
- Current repository: initialized on `main`, no commits and no HEAD. Task files remain untracked; nothing has been pushed.

## Implemented

- npm workspaces, reproducible lockfile, strict TypeScript, ESLint, Vitest, and root build/typecheck/lint/test scripts.
- Build output isolated to ignored `dist/` directories; failed compilation does not emit artifacts.
- Shared schema contract without DOM or Figma API dependencies; TypeScript's base library excludes browser globals.
- Design Schema `"0.1"`, with capture/viewport metadata, frame root, assets, and warnings.
- Frame, text, rectangle, image, and SVG node types, normalized style/typography, and absolute CSS-pixel geometry.
- Runtime validation of structure, ranges, unique node/asset IDs, asset kind/references, and warning node references.
- Strict unknown-field rejection and explicit unknown-version rejection.
- Public parse/safe-parse APIs, exported document/node/style/asset types, and library-independent validation errors.
- Seven deterministic schema fixtures, semantic assertions, rejection tests, and JSON round-trip tests.
- Extension/plugin package shells, documentation, and explicit non-goals.
- Removed the 28 accidentally emitted source artifacts. Updated development dependencies; final audit found no vulnerabilities.

## Structure

```text
apps/
  extension/
    package.json
    README.md
  figma-plugin/
    package.json
    README.md
packages/
  design-schema/
    src/{api,assets,document,index,nodes,style,version}.ts
    test/design-schema.test.ts
    package.json
    tsconfig.json
    tsconfig.build.json
    README.md
  test-fixtures/
    src/index.ts
    test/fixtures.test.ts
    package.json
    tsconfig.json
    tsconfig.build.json
    README.md
docs/
  foundation-report.md
```

`capture-engine` and `figma-renderer` are deferred until their implementations begin.

## Schema decisions

- Geometry uses absolute CSS pixels relative to the document top-left, with positive x rightward and y downward. Scroll offsets are capture context; coordinates are not parent-relative.
- Frames own ordered children; text/rectangle/image/SVG nodes have empty children. Local opacity avoids multiplying inherited opacity twice.
- Assets use URL, data URL, or embedded base64 sources, with optional provider-supplied hash, MIME type, and intrinsic dimensions.
- SVG requires inline content or an SVG-kind asset reference; inline content takes precedence when both exist.
- Wire version `"0.1"` is separate from npm package version `0.1.0`. Future contract changes need explicit revisions and pure migrations at the schema boundary. No speculative migration framework exists.
- No raw computed-style bag, DOM object dependency, screenshot fallback, layout inference, or asset fetching is present.

## Validation actually run

Environment: Node.js `22.22.3`, npm `10.9.8`.

| Command/check | Final result |
| --- | --- |
| `npm ci` | PASS, exit 0 |
| `npm run build` | PASS, exit 0; both implemented packages compiled |
| `npm run typecheck` | PASS, exit 0; source and tests checked |
| `npm run lint` | PASS, exit 0 |
| `npm test` | PASS, exit 0; 53 schema tests + 16 fixture tests = 69 |
| `npm audit` | PASS, exit 0; 0 vulnerabilities |
| Compiled public-export smoke check | PASS; 7 fixtures parsed and validation error verified |
| Generated artifacts in schema source | 0 |

The tests do not claim browser capture, visual output, or Figma import acceptance. The app shells contain no executable sources and are not application builds.

## Meaningful files created/modified

All final files are new relative to the originally empty workspace:

- Root: `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `eslint.config.mjs`, `README.md`.
- Schema: `packages/design-schema/package.json`, both tsconfig files, `README.md`, seven source modules, `test/design-schema.test.ts`.
- Fixtures: `packages/test-fixtures/package.json`, both tsconfig files, `README.md`, `src/index.ts`, `test/fixtures.test.ts`.
- App shells: `package.json` and `README.md` in each of `apps/extension` and `apps/figma-plugin`.
- Report: `docs/foundation-report.md`.

## Deferred and limitations

Auto Layout, CSS Grid reconstruction, component detection, design-system extraction, full DOM capture, full Figma rendering, Playwright crawling, cloud/backend, authentication, billing, AI redesign, and React/Tailwind export are deferred.

Gradients, clipping, transforms, per-side borders, elliptical radii, mixed text runs, and complex CSS effects are not modeled in V0.1; future capture sources must report warnings instead of silently flattening them. Asset downloading, hash/MIME verification, SVG sanitization, and font resolution belong to future capture/import work.

## Risks and next task

No blocking foundation issue remains. The broader Notion M0 milestone also mentions runnable app builds; that application-runtime exit criterion remains pending W2D-003/W2D-006, outside this run's narrowed scope.

Proceed with **W2D-003 — Chrome Extension shell + first capture pipeline**. It should normalize its first capture into this public schema API and document unsupported features.
