import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleUiMessage } from "../src/main.js";
import type { PluginToUiMessage } from "../src/messages.js";
import {
  representativeFixtures,
  simpleTextFixture,
  styledRectangleFixture,
  textCardFixture,
  imageFixture,
  inlineSvgFixture,
  shadowFixture,
  nestedFramesFixture,
} from "@web2design/test-fixtures";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runValidation(raw: unknown): PluginToUiMessage {
  let result: PluginToUiMessage | null = null;
  const postMessage = (msg: PluginToUiMessage) => {
    result = msg;
  };
  const notify = vi.fn();
  handleUiMessage({ type: "validate-document", raw }, postMessage, notify);
  if (!result) {
    throw new Error("No response message received from handleUiMessage");
  }
  return result;
}

describe("W2D-006 Section 17 - Representative and Real Document Validation", () => {
  describe("Representative fixtures validation", () => {
    it("validates 1. simple fixture document (simpleTextFixture)", () => {
      const res = runValidation(simpleTextFixture);
      expect(res.type).toBe("validation-success");
      if (res.type === "validation-success") {
        expect(res.summary.schemaVersion).toBe("0.5");
        expect(res.summary.totalNodes).toBe(2);
        expect(res.summary.nodeCounts.text).toBe(1);
        expect(res.summary.assetCount).toBe(0);
      }
      const resV04 = runValidation({ ...simpleTextFixture, schemaVersion: "0.4" });
      expect(resV04.type).toBe("validation-success");
      if (resV04.type === "validation-success") {
        expect(resV04.summary.schemaVersion).toBe("0.4");
      }
      const resV03 = runValidation({ ...simpleTextFixture, schemaVersion: "0.3" });
      expect(resV03.type).toBe("validation-success");
      if (resV03.type === "validation-success") {
        expect(resV03.summary.schemaVersion).toBe("0.3");
      }
      const resV02 = runValidation({ ...simpleTextFixture, schemaVersion: "0.2" });
      expect(resV02.type).toBe("validation-success");
      if (resV02.type === "validation-success") {
        expect(resV02.summary.schemaVersion).toBe("0.2");
      }
      const resV01 = runValidation({ ...simpleTextFixture, schemaVersion: "0.1" });
      expect(resV01.type).toBe("validation-success");
      if (resV01.type === "validation-success") {
        expect(resV01.summary.schemaVersion).toBe("0.1");
      }
    });

    it("validates 2. W2D-004 styled document (styledRectangleFixture & shadowFixture)", () => {
      const resRect = runValidation(styledRectangleFixture);
      expect(resRect.type).toBe("validation-success");
      if (resRect.type === "validation-success") {
        expect(resRect.summary.nodeCounts.rectangle).toBe(1);
      }

      const resShadow = runValidation(shadowFixture);
      expect(resShadow.type).toBe("validation-success");
      if (resShadow.type === "validation-success") {
        expect(resShadow.summary.nodeCounts.rectangle).toBe(1);
      }
    });

    it("validates text card and nested frames fixtures", () => {
      const resCard = runValidation(textCardFixture);
      expect(resCard.type).toBe("validation-success");
      if (resCard.type === "validation-success") {
        expect(resCard.summary.nodeCounts.frame).toBe(2);
        expect(resCard.summary.nodeCounts.text).toBe(2);
        expect(resCard.summary.totalNodes).toBe(4);
      }

      const resNested = runValidation(nestedFramesFixture);
      expect(resNested.type).toBe("validation-success");
      if (resNested.type === "validation-success") {
        expect(resNested.summary.totalNodes).toBe(4);
        expect(resNested.summary.nodeCounts.frame).toBe(3);
        expect(resNested.summary.nodeCounts.text).toBe(1);
      }
    });

    it("validates 3 & 4. document containing image assets (imageFixture / W2D-005 asset document)", () => {
      const res = runValidation(imageFixture);
      expect(res.type).toBe("validation-success");
      if (res.type === "validation-success") {
        expect(res.summary.nodeCounts.image).toBe(1);
        expect(res.summary.assetCount).toBe(1);
        expect(res.summary.assetCounts.image).toBe(1);
        expect(res.document.assets?.[0]?.mimeType).toBe("image/png");
      }
    });

    it("validates 5. document containing inline SVG (inlineSvgFixture)", () => {
      const res = runValidation(inlineSvgFixture);
      expect(res.type).toBe("validation-success");
      if (res.type === "validation-success") {
        expect(res.summary.nodeCounts.svg).toBe(1);
        expect(res.summary.assetCount).toBe(0);
      }
    });

    it("validates all exported representative fixtures from @web2design/test-fixtures", () => {
      for (const [name, fixture] of Object.entries(representativeFixtures)) {
        const res = runValidation(fixture);
        expect(res.type, `Fixture "${name}" should validate successfully`).toBe("validation-success");
      }
    });
  });

  describe("Error cases requirement checks", () => {
    it("handles 6. malformed JSON", () => {
      const res = runValidation("{ bad: json, ");
      expect(res.type).toBe("validation-error");
      if (res.type === "validation-error") {
        expect(res.error.message).toContain("JSON syntax error");
      }
    });

    it("handles 7. invalid schema version", () => {
      const res = runValidation({ ...simpleTextFixture, schemaVersion: "0.6" });
      expect(res.type).toBe("validation-error");
      if (res.type === "validation-error") {
        expect(res.error.issues.some((i) => i.path.includes("schemaVersion"))).toBe(true);
      }
    });

    it("handles 8. invalid asset reference", () => {
      const res = runValidation({ ...imageFixture, assets: [] });
      expect(res.type).toBe("validation-error");
      if (res.type === "validation-error") {
        expect(res.error.issues.some((i) => i.message.includes("missing or non-image asset"))).toBe(true);
      }
    });

    it("handles 9. unknown schema field", () => {
      const res = runValidation({ ...simpleTextFixture, unexpectedRootField: true });
      expect(res.type).toBe("validation-error");
      if (res.type === "validation-error") {
        expect(res.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
      }
    });
  });

  describe("Real Chrome Extension capture smoke outputs", () => {
    const smokeDir = resolve(__dirname, "../../extension/.smoke");

    const smokeFiles = [
      "fidelity-assets.json",
      "fidelity-geometry.json",
      "fidelity-styles.json",
      "fidelity-text.json",
      "fidelity-limits.json",
      "fidelity-pseudo.json",
      "fidelity-gradients.json",
      "fidelity-borders-shadows.json",
      "fidelity-clipping.json",
      "fidelity-transforms.json",
      "capture.json",
    ];

    for (const filename of smokeFiles) {
      it(`validates real Chrome capture output: ${filename}`, () => {
        const filePath = resolve(smokeDir, filename);
        if (!existsSync(filePath)) {
          // Skip if smoke dir wasn't run yet in this workspace instance
          return;
        }

        const rawJson = readFileSync(filePath, "utf-8");
        const res = runValidation(rawJson);

        expect(res.type, `Smoke capture "${filename}" should validate successfully`).toBe("validation-success");
        if (res.type === "validation-success") {
          expect(["0.1", "0.2", "0.3", "0.4", "0.5"]).toContain(res.summary.schemaVersion);
          expect(res.summary.totalNodes).toBeGreaterThan(0);
          expect(res.summary.viewport.width).toBeGreaterThan(0);
          expect(res.summary.viewport.height).toBeGreaterThan(0);
        }
      });
    }
  });
});
