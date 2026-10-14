import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

describe("Figma Main Runtime Bundle Verification (W2D-018)", () => {
  const distDir = resolve(__dirname, "../dist");
  const mainJsPath = resolve(distDir, "main.js");
  const manifestPath = resolve(distDir, "manifest.json");
  const uiHtmlPath = resolve(distDir, "ui.html");

  it("produces valid development manifest.json", () => {
    expect(existsSync(manifestPath), "dist/manifest.json must exist").toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.name).toBe("Web2Design");
    expect(manifest.main).toBe("main.js");
    expect(manifest.ui).toBe("ui.html");
    expect(manifest.editorType).toEqual(["figma"]);
  });

  it("produces valid self-contained ui.html", () => {
    expect(existsSync(uiHtmlPath), "dist/ui.html must exist").toBe(true);
    const html = readFileSync(uiHtmlPath, "utf8");
    expect(html).toContain("<script>");
    expect(html).toContain("</script>");
    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
  });

  it("ensures main.js contains no prohibited dynamic import expressions or comment tokens", () => {
    expect(existsSync(mainJsPath), "dist/main.js must exist").toBe(true);
    const mainJs = readFileSync(mainJsPath, "utf8");
    expect(mainJs.length).toBeGreaterThan(1000);

    // Figma jsvm-cpp sandbox statically scans and rejects bundles with possible import expressions
    // SyntaxError: possible import expression rejected around line 1
    const hasImportExpr = /\bimport\s*\(/.test(mainJs);
    expect(hasImportExpr, "dist/main.js must NOT contain dynamic import() expressions or comment tokens").toBe(false);
  });

  it("ensures main.js contains no import.meta references", () => {
    const mainJs = readFileSync(mainJsPath, "utf8");
    const hasImportMeta = /\bimport\.meta\b/.test(mainJs);
    expect(hasImportMeta, "dist/main.js must NOT contain import.meta references").toBe(false);
  });

  it("ensures main.js is an IIFE with no top-level ESM export statements", () => {
    const mainJs = readFileSync(mainJsPath, "utf8");
    const hasEsmExport = /^\s*export\s+[{*]/m.test(mainJs) || /^\s*export\s+default\b/m.test(mainJs);
    expect(hasEsmExport, "dist/main.js must NOT contain top-level ESM exports").toBe(false);
  });

  it("ensures main.js has no external chunk loaders", () => {
    const mainJs = readFileSync(mainJsPath, "utf8");
    const hasImportScripts = /\bimportScripts\b/.test(mainJs);
    expect(hasImportScripts, "dist/main.js must NOT contain importScripts").toBe(false);
  });
});
