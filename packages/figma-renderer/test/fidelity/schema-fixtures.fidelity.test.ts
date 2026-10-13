import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { representativeFixtures } from "@web2design/test-fixtures";
import {
  FakeFigmaHost,
  FIXTURE_MANIFEST,
  normalizeRenderedTree,
  renderDesignDocument,
  runDocumentFidelity,
} from "../../src/index.js";

describe("W2D-008 - Canonical Schema Fixtures Fidelity", () => {
  const schemaManifestEntries = FIXTURE_MANIFEST.filter((e) => e.kind === "schema-fixture");

  const fixtureMap: Record<string, (typeof representativeFixtures)[keyof typeof representativeFixtures]> = {
    "canonical-simple-text": representativeFixtures.simpleText,
    "canonical-styled-rectangle": representativeFixtures.styledRectangle,
    "canonical-text-card": representativeFixtures.textCard,
    "canonical-image": representativeFixtures.image,
    "canonical-inline-svg": representativeFixtures.inlineSvg,
    "canonical-shadow": representativeFixtures.shadow,
    "canonical-nested-frames": representativeFixtures.nestedFrames,
  };

  for (const entry of schemaManifestEntries) {
    it(`verifies fidelity & golden snapshot for: ${entry.id} (${entry.name})`, async () => {
      const doc = fixtureMap[entry.id];
      if (!doc) {
        throw new Error(`Fixture not found: ${entry.id}`);
      }

      const host = new FakeFigmaHost();
      const result = await renderDesignDocument(doc, host);

      expect(host.roots).toHaveLength(1);
      const rootFrame = host.roots[0]!;

      // 1. Normalized tree matches golden baseline
      const normalized = normalizeRenderedTree(rootFrame, doc.root.x, doc.root.y);
      const goldenPath = resolve(__dirname, `../../golden/${entry.id}.golden.json`);
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
