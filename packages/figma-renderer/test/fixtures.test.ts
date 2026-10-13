import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDesignDocument } from "../src/renderer.js";
import { representativeFixtures } from "@web2design/test-fixtures";
import type { DesignDocument } from "@web2design/design-schema";
import { FakeFigmaHost } from "./helpers/fake-figma-host.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("figma-renderer - representative fixtures & real smoke capture", () => {
  describe("Representative fixtures", () => {
    for (const [name, fixture] of Object.entries(representativeFixtures)) {
      it(`successfully renders representative fixture: ${name}`, async () => {
        const host = new FakeFigmaHost();
        const result = await renderDesignDocument(fixture, host);

        expect(result.createdNodeCount).toBeGreaterThan(0);
        expect(result.skippedNodeCount).toBe(0);
        expect(host.roots.length).toBe(1);
        expect(host.roots[0]!.id).toBe(result.rootNodeId);
      });
    }
  });

  describe("Real Chrome Extension capture smoke outputs", () => {
    const smokeDir = resolve(__dirname, "../../../apps/extension/.smoke");
    const smokeFiles = [
      "fidelity-assets.json",
      "fidelity-geometry.json",
      "fidelity-styles.json",
      "fidelity-text.json",
      "fidelity-limits.json",
      "fidelity-pseudo.json",
      "fidelity-gradients.json",
      "fidelity-borders-shadows.json",
      "capture.json",
    ];

    for (const filename of smokeFiles) {
      it(`successfully renders real Chrome capture JSON: ${filename}`, async () => {
        const filePath = resolve(smokeDir, filename);
        if (!existsSync(filePath)) {
          return;
        }

        const raw = readFileSync(filePath, "utf-8");
        const doc = JSON.parse(raw) as DesignDocument;

        const host = new FakeFigmaHost();
        const result = await renderDesignDocument(doc, host);

        expect(result.createdNodeCount).toBeGreaterThan(0);
        expect(host.roots.length).toBe(1);
        expect(host.selection.length).toBe(1);
      });
    }
  });
});
