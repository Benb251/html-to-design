import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DesignDocument } from "@web2design/design-schema";
import {
  FakeFigmaHost,
  FIXTURE_MANIFEST,
  normalizeRenderedTree,
  renderDesignDocument,
  runDocumentFidelity,
} from "../../src/index.js";

describe("W2D-008 - Real Chrome Capture Fidelity", () => {
  const chromeManifestEntries = FIXTURE_MANIFEST.filter((e) => e.kind === "chrome-capture");
  const rootDir = resolve(__dirname, "../../../../");

  for (const entry of chromeManifestEntries) {
    it(`verifies fidelity & golden snapshot for: ${entry.id} (${entry.name})`, async () => {
      const capturePath = resolve(rootDir, entry.sourcePath!);
      expect(existsSync(capturePath)).toBe(true);

      const doc = JSON.parse(readFileSync(capturePath, "utf-8")) as DesignDocument;
      const host = new FakeFigmaHost();
      const result = await renderDesignDocument(doc, host);

      expect(host.roots).toHaveLength(1);
      const rootFrame = host.roots[0]!;

      // 1. Normalized tree matches golden baseline
      const normalized = normalizeRenderedTree(rootFrame, doc.root.x, doc.root.y);
      const goldenPath = resolve(__dirname, `../../golden/${entry.id}.golden.json`);
      expect(existsSync(goldenPath)).toBe(true);
      const golden = JSON.parse(readFileSync(goldenPath, "utf-8"));
      expect(normalized).toEqual(golden);

      // 2. Structural & semantic fidelity checks
      const { failures, stats } = runDocumentFidelity(doc, normalized, entry, result.warnings);

      expect(failures).toEqual([]);
      expect(stats.warningsUnexpected).toBe(0);
      expect(stats.nodesCompared).toBeGreaterThan(0);
      expect(stats.geometryChecks).toBeGreaterThan(0);
    });
  }
});
