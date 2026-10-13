import { build } from "esbuild";
import { mkdir, copyFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), out = path.join(root, "dist");
await mkdir(out, { recursive: true });
await build({ entryPoints: { popup: path.join(root, "src/popup.ts"), content: path.join(root, "src/content.ts") }, outdir: out,
  bundle: true, format: "iife", platform: "browser", target: "chrome120", sourcemap: true, legalComments: "none" });
for (const file of ["popup.html", "popup.css"]) await copyFile(path.join(root, "public", file), path.join(out, file));
await copyFile(path.join(root, "manifest.json"), path.join(out, "manifest.json"));
const manifest = JSON.parse(await readFile(path.join(out, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3 || manifest.background || manifest.host_permissions) throw new Error("Unexpected extension architecture.");
for (const file of [manifest.action.default_popup, "popup.css", "popup.js", "content.js"]) await access(path.join(out, file));
console.info("Chrome MV3 unpacked build ready: " + out);
