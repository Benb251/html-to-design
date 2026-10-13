import { describe, expect, it } from "vitest";
import { parseDesignDocument } from "@web2design/design-schema";
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
    expect(card?.style?.fills?.[0]?.color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(card?.style?.border?.width).toBe(1);
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
    expect(frame.children.map((node) => node.type)).toEqual(["text", "text"]);
  });
});

