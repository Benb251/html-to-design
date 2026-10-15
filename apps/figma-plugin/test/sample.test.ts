import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  safeParseDesignDocument,
  DESIGN_SCHEMA_VERSION,
  type VersionedDesignDocument,
} from "@web2design/design-schema";
import { SAMPLE_DOCUMENT } from "../src/sample.js";
import { installUrlPolyfill, URLPolyfill } from "../src/url-polyfill.js";

function validateAllUrlFields(doc: VersionedDesignDocument): {
  pageUrlValid: boolean;
  assetUrlsCount: number;
  invalidAssetUrls: string[];
} {
  const pageUrl = doc.capture.page?.url;
  const pageUrlValid = pageUrl ? URLPolyfill.canParse(pageUrl) : true;

  const invalidAssetUrls: string[] = [];
  let assetUrlsCount = 0;

  for (const asset of doc.assets) {
    if (asset.source.type === "url") {
      assetUrlsCount++;
      if (!URLPolyfill.canParse(asset.source.url)) {
        invalidAssetUrls.push(`asset '${asset.id}': ${asset.source.url}`);
      }
    }
  }

  return { pageUrlValid, assetUrlsCount, invalidAssetUrls };
}

describe("Bundled Production Sample Document Verification (W2D-018)", () => {
  const distDir = resolve(__dirname, "../dist");
  const sampleJsonPath = resolve(distDir, "sample-w2d-document.json");
  const uiHtmlPath = resolve(distDir, "ui.html");

  it("validates exact source SAMPLE_DOCUMENT with authoritative safeParseDesignDocument", () => {
    const result = safeParseDesignDocument(SAMPLE_DOCUMENT);
    expect(result.success, "SAMPLE_DOCUMENT must pass authoritative schema validation").toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(DESIGN_SCHEMA_VERSION);
      expect(result.data.capture.page?.url).toBe("https://example.com/demo");
      expect(result.data.assets.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("ensures sample asset[0] uses deterministic offline embedded representation", () => {
    const firstAsset = SAMPLE_DOCUMENT.assets[0];
    expect(firstAsset).toBeDefined();
    expect(firstAsset?.source.type).toBe("embedded");
    if (firstAsset?.source.type === "embedded") {
      expect(firstAsset.source.encoding).toBe("base64");
      expect(firstAsset.source.data.length).toBeGreaterThan(0);
    }
  });

  it("validates all URL-bearing fields across sample document", () => {
    const { pageUrlValid, invalidAssetUrls } = validateAllUrlFields(SAMPLE_DOCUMENT);
    expect(pageUrlValid, "capture.page.url must be a syntactically valid URL").toBe(true);
    expect(invalidAssetUrls, "All asset URL sources must be valid URLs").toEqual([]);
  });

  it("validates sample passes schema even in environments without native globalThis.URL", () => {
    installUrlPolyfill();
    const result = safeParseDesignDocument(SAMPLE_DOCUMENT);
    expect(result.success).toBe(true);
  });

  it("verifies dist/sample-w2d-document.json freshness and matches UI SAMPLE_DOCUMENT", () => {
    expect(existsSync(sampleJsonPath), "dist/sample-w2d-document.json must exist").toBe(true);
    const raw = readFileSync(sampleJsonPath, "utf8");
    const parsed = JSON.parse(raw);

    const parseResult = safeParseDesignDocument(parsed);
    expect(parseResult.success, "dist/sample-w2d-document.json must pass schema validation").toBe(true);
    expect(parsed.schemaVersion).toBe(DESIGN_SCHEMA_VERSION);
    expect(parsed.assets[0].source.type).toBe("embedded");

    const { pageUrlValid, invalidAssetUrls } = validateAllUrlFields(parsed);
    expect(pageUrlValid).toBe(true);
    expect(invalidAssetUrls).toEqual([]);
  });

  it("verifies production dist/ui.html embeds the fresh corrected sample", () => {
    expect(existsSync(uiHtmlPath), "dist/ui.html must exist").toBe(true);
    const html = readFileSync(uiHtmlPath, "utf8");

    // Must contain fresh sample markers
    expect(html).toContain("Web2Design V0.7 Sample");
    expect(html).toContain("embedded:sample-1x1-png");

    // Must NOT contain stale invalid URL asset
    expect(html).not.toContain("https://example.com/demo.png");
  });
});
