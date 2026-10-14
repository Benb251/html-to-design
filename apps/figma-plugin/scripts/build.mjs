import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { representativeFixtures } from "@web2design/test-fixtures";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
await mkdir(out, { recursive: true });

// 1. Build plugin main runtime
// Minification strips all internal/dependency comments (including comments with literal `import()`)
// ensuring Figma's jsvm-cpp sandbox scanner does not reject the bundle with:
// "SyntaxError: possible import expression rejected around line 1"
await build({
  entryPoints: [path.join(root, "src/main.ts")],
  outfile: path.join(out, "main.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  legalComments: "none",
  minify: true,
});

// 2. Build UI script
await build({
  entryPoints: [path.join(root, "src/ui.ts")],
  outfile: path.join(out, "ui.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  legalComments: "none",
  minify: true,
});

// 3. Assemble self-contained ui.html for Figma __html__
const htmlTemplate = await readFile(path.join(root, "public/ui.html"), "utf8");
const cssContent = await readFile(path.join(root, "public/ui.css"), "utf8");
const jsContent = await readFile(path.join(out, "ui.js"), "utf8");

const standaloneHtml = htmlTemplate
  .replace('<link rel="stylesheet" href="ui.css">', `<style>${cssContent}</style>`)
  .replace('<script src="ui.js"></script>', `<script>${jsContent}</script>`);

await writeFile(path.join(out, "ui.html"), standaloneHtml, "utf8");

// 4. Copy manifest.json to dist
await copyFile(path.join(root, "manifest.json"), path.join(out, "manifest.json"));

// 5. Generate deterministic sample document artifact (Requirement 18)
const sampleDocument = representativeFixtures.image;
await writeFile(
  path.join(out, "sample-w2d-document.json"),
  JSON.stringify(sampleDocument, null, 2),
  "utf8",
);

// 6. Verify required outputs exist
for (const file of ["manifest.json", "main.js", "ui.html", "sample-w2d-document.json"]) {
  await access(path.join(out, file));
}

// 7. Deterministic Figma main runtime compatibility guard
// Statically verifies dist/main.js to prevent runtime rejection by Figma Desktop's jsvm-cpp sandbox
const mainBundle = await readFile(path.join(out, "main.js"), "utf8");

// Guard 1: Dynamic import expressions (e.g. import(...) or `import(...)`)
if (/\bimport\s*\(/.test(mainBundle)) {
  throw new Error(
    "Figma Compatibility Guard Failed: Prohibited dynamic import() expression or comment token detected in dist/main.js. " +
    "Figma's jsvm-cpp sandbox statically scans and rejects bundles containing possible import expressions with: " +
    "SyntaxError: possible import expression rejected around line 1."
  );
}

// Guard 2: ESM metadata (import.meta)
if (/\bimport\.meta\b/.test(mainBundle)) {
  throw new Error(
    "Figma Compatibility Guard Failed: Prohibited import.meta reference detected in dist/main.js. " +
    "Figma plugins execute in a non-ESM sandbox where import.meta is invalid syntax."
  );
}

// Guard 3: Top-level ESM export statements
if (/^\s*export\s+[{*]/m.test(mainBundle) || /^\s*export\s+default\b/m.test(mainBundle)) {
  throw new Error(
    "Figma Compatibility Guard Failed: Top-level ESM export detected in dist/main.js. " +
    "Figma main bundle must be a self-contained IIFE without top-level exports."
  );
}

// Guard 4: External chunk loaders (importScripts)
if (/\bimportScripts\b/.test(mainBundle)) {
  throw new Error(
    "Figma Compatibility Guard Failed: External chunk loader (importScripts) detected in dist/main.js. " +
    "Figma main bundle must be fully self-contained."
  );
}

console.info("Figma plugin build ready: " + out);
