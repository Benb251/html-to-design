import { describe, expect, it } from "vitest";
import { representativeFixtures } from "@web2design/test-fixtures";
import {
  FakeFigmaHost,
  FIXTURE_MANIFEST,
  normalizeRenderedTree,
  renderDesignDocument,
  runDocumentFidelity,
} from "../../src/index.js";

describe("W2D-008 - Fidelity Determinism (Section 44)", () => {
  it("produces identical normalized scenes and statistics across two consecutive runs", async () => {
    async function executeFullRun() {
      const results: Record<string, { normalized: unknown; warnings: unknown; stats: unknown }> = {};

      for (const entry of FIXTURE_MANIFEST) {
        if (entry.kind !== "schema-fixture") continue;

        const doc = representativeFixtures[
          entry.id.replace("canonical-", "").replace(/-([a-z])/g, (_, g) => g.toUpperCase()) as keyof typeof representativeFixtures
        ] ?? representativeFixtures.simpleText;

        const host = new FakeFigmaHost();
        const renderRes = await renderDesignDocument(doc, host);
        const root = host.roots[0]!;
        const normalized = normalizeRenderedTree(root, doc.root.x, doc.root.y);
        const { stats } = runDocumentFidelity(doc, normalized, entry, renderRes.warnings);

        results[entry.id] = {
          normalized,
          warnings: renderRes.warnings,
          stats,
        };
      }

      return results;
    }

    const run1 = await executeFullRun();
    const run2 = await executeFullRun();

    expect(run1).toEqual(run2);
  });
});
