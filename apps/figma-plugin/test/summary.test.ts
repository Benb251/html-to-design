import { describe, expect, it } from "vitest";
import { computeDocumentSummary } from "../src/summary.js";
import { imageFixture, inlineSvgFixture, nestedFramesFixture, simpleTextFixture } from "@web2design/test-fixtures";

describe("Figma plugin - computeDocumentSummary", () => {
  it("computes accurate summary for simple text document", () => {
    const summary = computeDocumentSummary(simpleTextFixture);
    expect(summary.schemaVersion).toBe("0.7");
    const summaryV06 = computeDocumentSummary({ ...simpleTextFixture, schemaVersion: "0.6" });
    expect(summaryV06.schemaVersion).toBe("0.6");
    const summaryV05 = computeDocumentSummary({ ...simpleTextFixture, schemaVersion: "0.5" });
    expect(summaryV05.schemaVersion).toBe("0.5");
    const summaryV04 = computeDocumentSummary({ ...simpleTextFixture, schemaVersion: "0.4" });
    expect(summaryV04.schemaVersion).toBe("0.4");
    const summaryV03 = computeDocumentSummary({ ...simpleTextFixture, schemaVersion: "0.3" });
    expect(summaryV03.schemaVersion).toBe("0.3");
    const summaryV02 = computeDocumentSummary({ ...simpleTextFixture, schemaVersion: "0.2" });
    expect(summaryV02.schemaVersion).toBe("0.2");
    const summaryV01 = computeDocumentSummary({ ...simpleTextFixture, schemaVersion: "0.1" });
    expect(summaryV01.schemaVersion).toBe("0.1");
    expect(summary.totalNodes).toBe(2); // root (frame) + text-1
    expect(summary.nodeCounts).toEqual({
      frame: 1,
      text: 1,
      rectangle: 0,
      image: 0,
      svg: 0,
    });
    expect(summary.assetCount).toBe(0);
    expect(summary.viewport).toEqual({ width: 800, height: 600 });
    expect(summary.pageTitle).toBe("Fixture");
    expect(summary.pageUrl).toBe("https://example.com/fixture");
  });

  it("computes accurate node counts and asset breakdown for image document", () => {
    const summary = computeDocumentSummary(imageFixture);
    expect(summary.totalNodes).toBe(2); // root + image-1
    expect(summary.nodeCounts.image).toBe(1);
    expect(summary.nodeCounts.frame).toBe(1);
    expect(summary.assetCount).toBe(1);
    expect(summary.assetCounts).toEqual({
      image: 1,
      svg: 0,
      font: 0,
      binary: 0,
    });
  });

  it("computes accurate node counts for inline SVG document", () => {
    const summary = computeDocumentSummary(inlineSvgFixture);
    expect(summary.totalNodes).toBe(2); // root + svg-1
    expect(summary.nodeCounts.svg).toBe(1);
    expect(summary.assetCount).toBe(0);
  });

  it("recursively visits nested frames and calculates total node count", () => {
    const summary = computeDocumentSummary(nestedFramesFixture);
    // root (frame) -> outer-frame (frame) -> inner-frame (frame) -> nested-text (text)
    expect(summary.totalNodes).toBe(4);
    expect(summary.nodeCounts.frame).toBe(3);
    expect(summary.nodeCounts.text).toBe(1);
  });

  it("collects deduplicated warning codes", () => {
    const docWithWarnings = {
      ...simpleTextFixture,
      warnings: [
        { code: "CAPTURE_SCOPE", message: "scope" },
        { code: "LINE_HEIGHT_APPROXIMATED", message: "lh1" },
        { code: "LINE_HEIGHT_APPROXIMATED", message: "lh2" },
      ],
    };
    const summary = computeDocumentSummary(docWithWarnings);
    expect(summary.warningCount).toBe(3);
    expect(summary.warningCodes).toEqual(["CAPTURE_SCOPE", "LINE_HEIGHT_APPROXIMATED"]);
  });
});
