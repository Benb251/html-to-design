import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { representativeFixtures } from "@web2design/test-fixtures";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
await mkdir(out, { recursive: true });

// 1. Build plugin main runtime
await build({
  entryPoints: [path.join(root, "src/main.ts")],
  outfile: path.join(out, "main.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  legalComments: "none",
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

console.info("Figma plugin build ready: " + out);
