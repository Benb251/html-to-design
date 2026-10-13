import { describe, expect, it } from "vitest";
import { parseDesignDocument, type DesignNode, type SolidFill } from "@web2design/design-schema";
import {
  representativeFixtures,
  nestedFramesFixture,
  styledRectangleFixture,
  textCardFixture,
  shadowFixture,
  imageFixture,
} from "../src/index.js";

describe("representative Design Schema fixtures", () => {
  for (const [name, fixture] of Object.entries(representativeFixtures)) {
    it(`parses ${name}`, () => {
      expect(parseDesignDocument(fixture)).toEqual(fixture);
    });
    it(`round-trips ${name} through JSON`, () => {
      expect(parseDesignDocument(JSON.parse(JSON.stringify(fixture)))).toEqual(fixture);
    });
  }

  it("preserves absolute child positions independently of parent geometry", () => {
    const outer = parseDesignDocument(nestedFramesFixture).root.children[0];
    expect(outer?.type).toBe("frame");
    if (outer?.type !== "frame") throw new Error("Expected outer frame");
    const inner = outer.children[0];
    expect(inner?.type).toBe("frame");
    if (inner?.type !== "frame") throw new Error("Expected inner frame");
    expect(outer.x).toBe(40);
    expect(inner.x).toBe(80);
    expect(inner.children[0]?.x).toBe(96);
  });

  it("preserves the important visual and asset properties", () => {
    const card = parseDesignDocument(styledRectangleFixture).root.children[0];
    expect((card?.style?.fills?.[0] as SolidFill)?.color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(card?.style?.border?.top.width).toBe(1);
    expect(card?.style?.cornerRadius).toBe(12);
    const shadow = parseDesignDocument(shadowFixture).root.children[0]?.style?.boxShadows?.[0];
    expect(shadow?.blurRadius).toBe(12);
    expect(shadow?.color.a).toBe(0.18);
    const image = parseDesignDocument(imageFixture);
    const imageNode = image.root.children[0];
    if (imageNode?.type !== "image") throw new Error("Expected image");
    expect(image.assets.find((asset) => asset.id === imageNode.assetId)?.kind).toBe("image");
    const frame = parseDesignDocument(textCardFixture).root.children[0];
    if (frame?.type !== "frame") throw new Error("Expected text card");
    expect(frame.children.map((node: DesignNode) => node.type)).toEqual(["text", "text"]);
  });

  it("parses and validates V0.3 per-side widths fixture", async () => {
    const { perSideWidthsFixture } = await import("../src/index.js");
    const doc = parseDesignDocument(perSideWidthsFixture);
    expect(doc.schemaVersion).toBe("0.3");
    const rect = doc.root.children[0];
    expect(rect?.style?.border?.top.width).toBe(1);
    expect(rect?.style?.border?.right.width).toBe(2);
    expect(rect?.style?.border?.bottom.width).toBe(3);
    expect(rect?.style?.border?.left.width).toBe(4);
  });

  it("parses and validates V0.3 multiple shadows and inset shadows", async () => {
    const { multipleDropShadowsFixture, insetShadowFixture, mixedShadowStackFixture } = await import("../src/index.js");
    const multiDoc = parseDesignDocument(multipleDropShadowsFixture);
    expect(multiDoc.root.children[0]?.style?.boxShadows).toHaveLength(2);
    const insetDoc = parseDesignDocument(insetShadowFixture);
    expect(insetDoc.root.children[0]?.style?.boxShadows?.[0]?.inset).toBe(true);
    const mixedDoc = parseDesignDocument(mixedShadowStackFixture);
    expect(mixedDoc.root.children[0]?.style?.boxShadows).toHaveLength(2);
    expect(mixedDoc.root.children[0]?.style?.boxShadows?.[0]?.inset).toBe(false);
    expect(mixedDoc.root.children[0]?.style?.boxShadows?.[1]?.inset).toBe(true);
  });

  it("upgrades and normalizes historical V0.1 fixture to V0.3", async () => {
    const { historicalV01Fixture } = await import("../src/index.js");
    const { normalizeDesignDocument } = await import("@web2design/design-schema");
    const parsed = parseDesignDocument(historicalV01Fixture);
    expect(parsed.schemaVersion).toBe("0.1");
    const doc = normalizeDesignDocument(parsed);
    expect(doc.schemaVersion).toBe("0.3");
    const rect = doc.root.children[0];
    expect(rect?.style?.border?.top.width).toBe(1);
    expect(rect?.style?.border?.right.width).toBe(1);
    expect(rect?.style?.boxShadows?.[0]?.blurRadius).toBe(12);
  });

  it("upgrades and normalizes historical V0.2 gradient fixture to V0.3", async () => {
    const { historicalV02GradientFixture } = await import("../src/index.js");
    const { normalizeDesignDocument } = await import("@web2design/design-schema");
    const parsed = parseDesignDocument(historicalV02GradientFixture);
    expect(parsed.schemaVersion).toBe("0.2");
    const doc = normalizeDesignDocument(parsed);
    expect(doc.schemaVersion).toBe("0.3");
    const rect = doc.root.children[0];
    expect(rect?.style?.fills?.[0]?.type).toBe("linear-gradient");
    expect(rect?.style?.border?.top.width).toBe(2);
  });
});

