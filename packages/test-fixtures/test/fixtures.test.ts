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

  it("parses and validates V0.4 per-side widths fixture", async () => {
    const { perSideWidthsFixture } = await import("../src/index.js");
    const doc = parseDesignDocument(perSideWidthsFixture);
    expect(doc.schemaVersion).toBe("0.7");
    const rect = doc.root.children[0];
    expect(rect?.style?.border?.top.width).toBe(1);
    expect(rect?.style?.border?.right.width).toBe(2);
    expect(rect?.style?.border?.bottom.width).toBe(3);
    expect(rect?.style?.border?.left.width).toBe(4);
  });

  it("parses and validates multiple shadows and inset shadows", async () => {
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

  it("upgrades and normalizes historical V0.1 fixture to V0.7", async () => {
    const { historicalV01Fixture } = await import("../src/index.js");
    const { normalizeDesignDocument } = await import("@web2design/design-schema");
    const parsed = parseDesignDocument(historicalV01Fixture);
    expect(parsed.schemaVersion).toBe("0.1");
    const doc = normalizeDesignDocument(parsed);
    expect(doc.schemaVersion).toBe("0.7");
    const rect = doc.root.children[0];
    expect(rect?.style?.border?.top.width).toBe(1);
    expect(rect?.style?.border?.right.width).toBe(1);
    expect(rect?.style?.boxShadows?.[0]?.blurRadius).toBe(12);
    expect(rect?.transform).toBeUndefined();
    expect(doc.root.layout).toBeUndefined();
  });

  it("upgrades and normalizes historical V0.2 gradient fixture to V0.7", async () => {
    const { historicalV02GradientFixture } = await import("../src/index.js");
    const { normalizeDesignDocument } = await import("@web2design/design-schema");
    const parsed = parseDesignDocument(historicalV02GradientFixture);
    expect(parsed.schemaVersion).toBe("0.2");
    const doc = normalizeDesignDocument(parsed);
    expect(doc.schemaVersion).toBe("0.7");
    const rect = doc.root.children[0];
    expect(rect?.style?.fills?.[0]?.type).toBe("linear-gradient");
    expect(rect?.style?.border?.top.width).toBe(2);
    expect(rect?.transform).toBeUndefined();
    expect(doc.root.layout).toBeUndefined();
  });

  it("upgrades and normalizes historical V0.3 border/shadow fixture to V0.7", async () => {
    const { historicalV03BorderShadowFixture } = await import("../src/index.js");
    const { normalizeDesignDocument } = await import("@web2design/design-schema");
    const parsed = parseDesignDocument(historicalV03BorderShadowFixture);
    expect(parsed.schemaVersion).toBe("0.3");
    const doc = normalizeDesignDocument(parsed);
    expect(doc.schemaVersion).toBe("0.7");
    const rect = doc.root.children[0];
    expect(rect?.style?.border?.top.width).toBe(1);
    expect(rect?.style?.border?.right.width).toBe(2);
    expect(rect?.style?.border?.bottom.width).toBe(3);
    expect(rect?.style?.border?.left.width).toBe(4);
    expect(rect?.style?.boxShadows).toHaveLength(2);
    expect(rect?.style?.boxShadows?.[0]?.inset).toBe(false);
    expect(rect?.style?.boxShadows?.[1]?.inset).toBe(true);
    expect(rect?.transform).toBeUndefined();
    expect(doc.root.layout).toBeUndefined();
  });

  it("parses and validates canonical clipping fixtures", async () => {
    const {
      bothAxisClipFixture,
      xOnlyClipFixture,
      yOnlyClipFixture,
      nestedClipsFixture,
      roundedClipFrameFixture,
    } = await import("../src/index.js");

    const bothDoc = parseDesignDocument(bothAxisClipFixture);
    expect(bothDoc.schemaVersion).toBe("0.7");
    expect((bothDoc.root.children[0] as { clip?: unknown }).clip).toEqual({ x: true, y: true });

    const xDoc = parseDesignDocument(xOnlyClipFixture);
    expect((xDoc.root.children[0] as { clip?: unknown }).clip).toEqual({ x: true, y: false });

    const yDoc = parseDesignDocument(yOnlyClipFixture);
    expect((yDoc.root.children[0] as { clip?: unknown }).clip).toEqual({ x: false, y: true });

    const nestedDoc = parseDesignDocument(nestedClipsFixture);
    const outer = nestedDoc.root.children[0] as { type: string; clip?: unknown; children: Array<{ clip?: unknown }> };
    expect(outer.clip).toEqual({ x: true, y: true });
    expect(outer.children[0]?.clip).toEqual({ x: true, y: false });

    const roundedDoc = parseDesignDocument(roundedClipFrameFixture);
    const rounded = roundedDoc.root.children[0] as { clip?: unknown; style?: { cornerRadius?: number } };
    expect(rounded.clip).toEqual({ x: true, y: true });
    expect(rounded.style?.cornerRadius).toBe(24);
  });

  it("upgrades and normalizes historical V0.4 clipping fixture to V0.7", async () => {
    const { historicalV04ClippingFixture } = await import("../src/index.js");
    const { normalizeDesignDocument } = await import("@web2design/design-schema");
    const parsed = parseDesignDocument(historicalV04ClippingFixture);
    expect(parsed.schemaVersion).toBe("0.4");
    const doc = normalizeDesignDocument(parsed);
    expect(doc.schemaVersion).toBe("0.7");
    expect(doc.root.clip).toEqual({ x: true, y: true });
    expect(doc.root.transform).toBeUndefined();
    expect(doc.root.layout).toBeUndefined();
  });

  it("parses and validates canonical V0.5 transform fixtures", async () => {
    const {
      rotationFixture,
      translationFixture,
      customOriginRotationFixture,
      uniformScaleFixture,
      nonUniformScaleFixture,
      nestedTransformFixture,
    } = await import("../src/index.js");

    const rotDoc = parseDesignDocument(rotationFixture);
    expect(rotDoc.schemaVersion).toBe("0.7");
    expect(rotDoc.root.children[0]?.transform?.matrix.a).toBe(0.7071);

    const transDoc = parseDesignDocument(translationFixture);
    expect(transDoc.schemaVersion).toBe("0.7");
    expect(transDoc.root.children[0]?.transform?.matrix.e).toBe(50);

    const customDoc = parseDesignDocument(customOriginRotationFixture);
    expect(customDoc.schemaVersion).toBe("0.7");
    expect(customDoc.root.children[0]?.transform?.origin).toEqual({ x: 0, y: 0 });

    const scaleDoc = parseDesignDocument(uniformScaleFixture);
    expect(scaleDoc.schemaVersion).toBe("0.7");
    expect(scaleDoc.root.children[0]?.transform?.matrix.a).toBe(1.5);

    const nonUniformDoc = parseDesignDocument(nonUniformScaleFixture);
    expect(nonUniformDoc.schemaVersion).toBe("0.7");
    expect(nonUniformDoc.root.children[0]?.transform?.matrix.a).toBe(2);

    const nestedDoc = parseDesignDocument(nestedTransformFixture);
    expect(nestedDoc.schemaVersion).toBe("0.7");
    const parent = nestedDoc.root.children[0];
    expect(parent?.transform?.matrix.a).toBe(0.866);
    expect(parent?.children[0]?.transform?.matrix.a).toBe(0.7071);
  });

  it("upgrades and normalizes historical V0.5 transform fixture to V0.7", async () => {
    const { historicalV05TransformFixture } = await import("../src/index.js");
    const { normalizeDesignDocument } = await import("@web2design/design-schema");
    const parsed = parseDesignDocument(historicalV05TransformFixture);
    expect(parsed.schemaVersion).toBe("0.5");
    const doc = normalizeDesignDocument(parsed);
    expect(doc.schemaVersion).toBe("0.7");
    const rectChild = doc.root.children[0] as { type: string; transform?: { matrix: { a: number } } };
    expect(rectChild.transform?.matrix.a).toBe(0.7071);
    expect(rectChild.type).toBe("rectangle");
    expect(doc.root.layout).toBeUndefined();
  });

  it("parses and validates canonical V0.6 rich text fixtures", async () => {
    const {
      richTextBoldFixture,
      richTextColorFixture,
      richTextNestedFixture,
      richTextHyperlinkFixture,
      richTextMixedFontFixture,
      richTextEmojiBoundaryFixture,
    } = await import("../src/index.js");

    const boldDoc = parseDesignDocument(richTextBoldFixture);
    expect(boldDoc.schemaVersion).toBe("0.7");
    const boldText = boldDoc.root.children[0] as { type: string; runs: Array<{ start: number; end: number; style: { fontWeight: number } }> };
    expect(boldText.runs).toHaveLength(3);
    expect(boldText.runs[1]?.style.fontWeight).toBe(700);

    const colorDoc = parseDesignDocument(richTextColorFixture);
    const colorText = colorDoc.root.children[0] as { type: string; runs: Array<{ start: number; end: number; style: { color: { r: number } } }> };
    expect(colorText.runs[1]?.style.color.r).toBe(1);

    const nestedDoc = parseDesignDocument(richTextNestedFixture);
    const nestedText = nestedDoc.root.children[0] as { type: string; runs: Array<{ style: { fontWeight: number; fontStyle: string } }> };
    expect(nestedText.runs[2]?.style.fontWeight).toBe(700);
    expect(nestedText.runs[2]?.style.fontStyle).toBe("italic");

    const linkDoc = parseDesignDocument(richTextHyperlinkFixture);
    const linkText = linkDoc.root.children[0] as { type: string; runs: Array<{ hyperlink?: string }> };
    expect(linkText.runs[1]?.hyperlink).toBe("https://example.com");

    const mixedFontDoc = parseDesignDocument(richTextMixedFontFixture);
    const mixedFontText = mixedFontDoc.root.children[0] as { type: string; runs: Array<{ style: { fontFamily: string } }> };
    expect(mixedFontText.runs[1]?.style.fontFamily).toBe("Roboto");

    const emojiDoc = parseDesignDocument(richTextEmojiBoundaryFixture);
    const emojiText = emojiDoc.root.children[0] as { characters: string; runs: Array<{ start: number; end: number }> };
    expect(emojiText.characters).toBe("Hello 👋 bold 🌍 world");
    expect(emojiText.runs[1]?.start).toBe(9);
    expect(emojiText.runs[1]?.end).toBe(13);
  });

  it("upgrades and normalizes historical V0.6 rich text fixture to V0.7", async () => {
    const { historicalV06RichTextFixture } = await import("../src/index.js");
    const { normalizeDesignDocument } = await import("@web2design/design-schema");
    const parsed = parseDesignDocument(historicalV06RichTextFixture);
    expect(parsed.schemaVersion).toBe("0.6");
    const doc = normalizeDesignDocument(parsed);
    expect(doc.schemaVersion).toBe("0.7");
    const textChild = doc.root.children[0] as { type: string; runs?: Array<unknown> };
    expect(textChild.type).toBe("text");
    expect(textChild.runs).toHaveLength(3);
    expect(doc.root.layout).toBeUndefined();
  });

  it("parses and validates canonical V0.7 Auto Layout fixtures", async () => {
    const {
      autoLayoutRowFixture,
      autoLayoutColumnFixture,
      autoLayoutGapPaddingFixture,
      autoLayoutSpaceBetweenFixture,
      autoLayoutGrowChildFixture,
      autoLayoutAbsoluteChildFixture,
      autoLayoutNestedFixture,
    } = await import("../src/index.js");

    const rowDoc = parseDesignDocument(autoLayoutRowFixture);
    expect(rowDoc.schemaVersion).toBe("0.7");
    const rowFrame = rowDoc.root.children[0] as { type: string; layout?: { direction: string; gap: number } };
    expect(rowFrame.layout?.direction).toBe("horizontal");
    expect(rowFrame.layout?.gap).toBe(16);

    const colDoc = parseDesignDocument(autoLayoutColumnFixture);
    const colFrame = colDoc.root.children[0] as { type: string; layout?: { direction: string; crossAlign: string } };
    expect(colFrame.layout?.direction).toBe("vertical");
    expect(colFrame.layout?.crossAlign).toBe("stretch");

    const gpDoc = parseDesignDocument(autoLayoutGapPaddingFixture);
    const gpFrame = gpDoc.root.children[0] as { layout?: { padding: { top: number; left: number } } };
    expect(gpFrame.layout?.padding.top).toBe(8);
    expect(gpFrame.layout?.padding.left).toBe(32);

    const sbDoc = parseDesignDocument(autoLayoutSpaceBetweenFixture);
    const sbFrame = sbDoc.root.children[0] as { layout?: { primaryAlign: string } };
    expect(sbFrame.layout?.primaryAlign).toBe("space-between");

    const growDoc = parseDesignDocument(autoLayoutGrowChildFixture);
    const growChild = (growDoc.root.children[0] as { children: Array<{ layoutChild?: { grow?: boolean } }> }).children[1];
    expect(growChild?.layoutChild?.grow).toBe(true);

    const absDoc = parseDesignDocument(autoLayoutAbsoluteChildFixture);
    const absChild = (absDoc.root.children[0] as { children: Array<{ layoutChild?: { positioning?: string } }> }).children[2];
    expect(absChild?.layoutChild?.positioning).toBe("absolute");

    const nestDoc = parseDesignDocument(autoLayoutNestedFixture);
    const outerFrame = nestDoc.root.children[0] as { layout?: { direction: string }; children: Array<{ layout?: { direction: string } }> };
    expect(outerFrame.layout?.direction).toBe("vertical");
    expect(outerFrame.children[0]?.layout?.direction).toBe("horizontal");
  });
});


