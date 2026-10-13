import { describe, expect, it } from "vitest";
import {
  DESIGN_SCHEMA_VERSION,
  DesignDocumentValidationError,
  isSupportedSchemaVersion,
  normalizeDesignDocument,
  parseDesignDocument,
  safeParseDesignDocument,
  upgradeDesignDocumentToLatest,
  type DesignDocument,
  type ImageNode,
  type RectangleNode,
  type SolidFill,
  type TextNode,
} from "../src/index.js";

const black = { r: 0, g: 0, b: 0, a: 1 } as const;

function rectangleNode(): RectangleNode {
  return {
    id: "box", type: "rectangle", x: 20, y: 30, width: 200, height: 100,
    visible: true, opacity: 1, children: [],
  };
}

function textNode(): TextNode {
  return {
    ...rectangleNode(), id: "text", type: "text", characters: "Hello",
    textStyle: {
      fontFamily: "Inter", fontSize: 16, fontWeight: 400, fontStyle: "normal",
      lineHeight: 24, letterSpacing: 0, textAlign: "left", color: black,
    },
  };
}

function imageNode(): ImageNode {
  return { ...rectangleNode(), id: "image", type: "image", assetId: "asset" };
}

function createBaseDocument(): DesignDocument {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    capture: {
      capturedAt: "2026-10-13T07:00:00.000Z",
      source: { kind: "test" },
    },
    viewport: {
      width: 1280,
      height: 720,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
    },
    root: {
      id: "root",
      type: "frame",
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
      visible: true,
      opacity: 1,
      children: [],
    },
    assets: [],
  };
}

describe("Design Schema V0.1", () => {
  it("returns a library-independent validation error", () => {
    const input = { ...createBaseDocument(), schemaVersion: "future" };
    const result = safeParseDesignDocument(input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected rejection");
    expect(result.issues).toContainEqual({
      path: ["schemaVersion"], code: "invalid_value", message: expect.any(String),
    });
    try {
      parseDesignDocument(input);
      throw new Error("Expected parser to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DesignDocumentValidationError);
      if (error instanceof DesignDocumentValidationError) {
        expect(error.issues).toEqual(result.issues);
      }
    }
  });

  it.each([undefined, null, "1.0", 0.1])("rejects schema version %s", (schemaVersion) => {
    expect(safeParseDesignDocument({ ...createBaseDocument(), schemaVersion }).success).toBe(false);
  });

  it.each([
    { x: NaN }, { y: Infinity }, { width: -1 }, { height: -1 },
    { opacity: -0.1 }, { opacity: 1.1 }, { visible: "true" },
  ])("rejects invalid node geometry/visibility %j", (override) => {
    const document = createBaseDocument();
    const input = { ...document, root: { ...document.root, ...override } };
    expect(safeParseDesignDocument(input).success).toBe(false);
  });

  it("preserves fractional and negative absolute positions", () => {
    const document = createBaseDocument();
    document.root.children = [{ ...rectangleNode(), x: -1.25, y: 30.5, width: 0 }];
    expect(parseDesignDocument(document).root.children[0]).toEqual(document.root.children[0]);
  });

  it.each([
    { fontSize: 0 }, { fontWeight: 0 }, { fontWeight: 1001 }, { fontWeight: 400.5 },
    { fontStyle: "bold" }, { lineHeight: -1 }, { textAlign: "middle" },
    { fontFamily: "" }, { fontFallbacks: [""] }, { color: { ...black, r: 2 } },
  ])("rejects invalid typography %j", (override) => {
    const node = textNode();
    const document = createBaseDocument();
    const input = {
      ...document,
      root: { ...document.root, children: [{ ...node, textStyle: { ...node.textStyle, ...override } }] },
    };
    expect(safeParseDesignDocument(input).success).toBe(false);
  });

  it("accepts fallback families, negative tracking and variable font weights", () => {
    const document = createBaseDocument();
    const node = textNode();
    node.textStyle.fontFallbacks = ["Arial", "sans-serif"];
    node.textStyle.fontWeight = 525;
    node.textStyle.letterSpacing = -0.5;
    document.root.children = [node];
    expect(parseDesignDocument(document).root.children[0]).toEqual(node);
  });

  it.each(["ellipse", "TEXT", "unknown"])("rejects unknown node discriminator %s", (type) => {
    const document = createBaseDocument();
    const input = { ...document, root: { ...document.root, children: [{ ...rectangleNode(), type }] } };
    expect(safeParseDesignDocument(input).success).toBe(false);
  });

  it("rejects a text discriminator without text content/style", () => {
    const document = createBaseDocument();
    const input = { ...document, root: { ...document.root, children: [{ ...rectangleNode(), type: "text" }] } };
    expect(safeParseDesignDocument(input).success).toBe(false);
  });

  it("rejects children on a leaf and requires a frame root", () => {
    const document = createBaseDocument();
    const input = {
      ...document,
      root: { ...document.root, children: [{ ...rectangleNode(), children: [textNode()] }] },
    };
    expect(safeParseDesignDocument(input).success).toBe(false);
    expect(safeParseDesignDocument({ ...document, root: rectangleNode() }).success).toBe(false);
  });

  it("rejects unknown fields at document, node and style boundaries", () => {
    const document = createBaseDocument();
    expect(safeParseDesignDocument({ ...document, futureField: true }).success).toBe(false);
    expect(safeParseDesignDocument({
      ...document, root: { ...document.root, rawComputedStyle: { display: "grid" } },
    }).success).toBe(false);
    expect(safeParseDesignDocument({
      ...document, root: { ...document.root, style: { gradient: "unmodeled" } },
    }).success).toBe(false);
  });

  it.each([
    { border: { width: -1, style: "solid", color: black } },
    { cornerRadius: -1 },
    { boxShadows: [{ offsetX: 0, offsetY: 0, blurRadius: -1, spreadRadius: 0, color: black }] },
  ])("rejects invalid visual style %j", (style) => {
    const document = createBaseDocument();
    expect(safeParseDesignDocument({ ...document, root: { ...document.root, style } }).success).toBe(false);
  });

  it("normalizes documented color and shadow defaults", () => {
    const document = createBaseDocument();
    const parsed = parseDesignDocument({
      ...document,
      root: { ...document.root, style: {
        fills: [{ type: "solid", color: { r: 0, g: 0.5, b: 1 } }],
        boxShadows: [{ offsetX: -2, offsetY: 4, blurRadius: 0, spreadRadius: -1, color: black }],
        cornerRadius: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 },
      } },
    });
    expect((parsed.root.style?.fills?.[0] as SolidFill)?.color.a).toBe(1);
    expect(parsed.root.style?.boxShadows?.[0]?.inset).toBe(false);
    expect(parsed.root.style?.cornerRadius).toEqual({
      topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4,
    });
  });

  it.each([
    { type: "url", url: "https://example.com/image.png" },
    { type: "data-url", dataUrl: "data:image/png;base64,aGVsbG8=" },
    { type: "embedded", encoding: "base64", data: "aGVsbG8=" },
  ])("accepts image asset source %j", (source) => {
    const document = createBaseDocument();
    const input = {
      ...document, root: { ...document.root, children: [imageNode()] },
      assets: [{ id: "asset", kind: "image", source, mimeType: "image/png",
        contentHash: "sha256:example", intrinsicDimensions: { width: 200, height: 100 } }],
    };
    const parsed = parseDesignDocument(input);
    expect(parsed.assets[0]?.source).toEqual(source);
    expect(parsed.root.children[0]?.type).toBe("image");
  });

  it.each([
    { type: "url", url: "not a URL" },
    { type: "data-url", dataUrl: "data:" },
    { type: "embedded", encoding: "base64", data: "not base64!" },
    { type: "embedded", encoding: "binary", data: "aGVsbG8=" },
  ])("rejects malformed asset source %j", (source) => {
    expect(safeParseDesignDocument({
      ...createBaseDocument(), assets: [{ id: "asset", kind: "image", source }],
    }).success).toBe(false);
  });

  it("rejects duplicate assets and wrong asset kinds", () => {
    const document = createBaseDocument();
    const asset = { id: "asset", kind: "svg", source: {
      type: "url", url: "https://example.com/icon.svg",
    } };
    expect(safeParseDesignDocument({ ...document, assets: [asset, asset] }).success).toBe(false);
    expect(safeParseDesignDocument({
      ...document, root: { ...document.root, children: [imageNode()] }, assets: [asset],
    }).success).toBe(false);
  });

  it("requires inline SVG content or an SVG asset reference", () => {
    const document = createBaseDocument();
    const base = { ...rectangleNode(), type: "svg" };
    expect(safeParseDesignDocument({
      ...document, root: { ...document.root, children: [base] },
    }).success).toBe(false);
    expect(safeParseDesignDocument({
      ...document, root: { ...document.root, children: [{ ...base, inlineSvg: "" }] },
    }).success).toBe(false);
    const parsed = parseDesignDocument({
      ...document, root: { ...document.root, children: [{ ...base, assetId: "svg-asset" }] },
      assets: [{ id: "svg-asset", kind: "svg", source: {
        type: "url", url: "https://example.com/icon.svg",
      } }],
    });
    expect(parsed.root.children[0]?.type).toBe("svg");
    expect(safeParseDesignDocument({
      ...parsed, assets: [{ ...parsed.assets[0], kind: "image" }],
    }).success).toBe(false);
    expect(safeParseDesignDocument({ ...parsed, assets: [] }).success).toBe(false);
  });

  it("reports the exact path for nested dangling references", () => {
    const document = createBaseDocument();
    document.root.children = [{
      ...document.root, id: "nested", children: [imageNode()],
    }];
    const result = safeParseDesignDocument(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.path).toEqual(["root", "children", 0, "children", 0, "assetId"]);
    }
  });

  it("validates warning node references without requiring a node for global warnings", () => {
    const document = createBaseDocument();
    document.warnings = [{ code: "unsupported", message: "Unsupported feature", nodeId: "root" }];
    expect(parseDesignDocument(document).warnings).toEqual(document.warnings);
    expect(safeParseDesignDocument({
      ...document, warnings: [{ ...document.warnings[0], nodeId: "missing" }],
    }).success).toBe(false);
    expect(parseDesignDocument({
      ...document, warnings: [{ code: "partial", message: "Partial capture" }],
    }).warnings?.[0]?.nodeId).toBeUndefined();
  });

  it("parses a valid document", () => {
    const document = createBaseDocument();
    expect(parseDesignDocument(document)).toEqual(document);
  });

  it("rejects an invalid schema version", () => {
    const document = { ...createBaseDocument(), schemaVersion: "0.3" };
    expect(safeParseDesignDocument(document).success).toBe(false);
  });

  it("discriminates node types", () => {
    const document = createBaseDocument();
    document.root.children.push({
      id: "headline",
      type: "text",
      x: 24,
      y: 32,
      width: 300,
      height: 40,
      visible: true,
      opacity: 1,
      children: [],
      characters: "Web2Design",
      textStyle: {
        fontFamily: "Inter",
        fontSize: 32,
        fontWeight: 700,
        fontStyle: "normal",
        lineHeight: 40,
        letterSpacing: 0,
        textAlign: "left",
        color: black,
      },
    });

    const parsed = parseDesignDocument(document);
    const node = parsed.root.children[0];
    expect(node?.type).toBe("text");
    if (node?.type === "text") {
      expect(node.characters).toBe("Web2Design");
    }
  });

  it("supports nested frames", () => {
    const document = createBaseDocument();
    document.root.children.push({
      id: "outer",
      type: "frame",
      x: 10,
      y: 10,
      width: 200,
      height: 200,
      visible: true,
      opacity: 1,
      children: [
        {
          id: "inner",
          type: "frame",
          x: 20,
          y: 20,
          width: 100,
          height: 100,
          visible: true,
          opacity: 1,
          children: [],
        },
      ],
    });

    expect(parseDesignDocument(document).root.children[0]?.type).toBe("frame");
  });

  it("rejects invalid text styles", () => {
    const document = createBaseDocument();
    document.root.children.push({
      id: "bad-text",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      visible: true,
      opacity: 1,
      children: [],
      characters: "Bad",
      textStyle: {
        fontFamily: "Inter",
        fontSize: -1,
        fontWeight: 400,
        fontStyle: "normal",
        lineHeight: 20,
        letterSpacing: 0,
        textAlign: "left",
        color: black,
      },
    });

    expect(safeParseDesignDocument(document).success).toBe(false);
  });

  it("validates image asset references", () => {
    const document = createBaseDocument();
    document.root.children.push({
      id: "hero-image",
      type: "image",
      x: 0,
      y: 0,
      width: 640,
      height: 360,
      visible: true,
      opacity: 1,
      children: [],
      assetId: "missing",
    });

    const result = safeParseDesignDocument(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.message.includes("missing or non-image asset"))).toBe(true);
    }
  });

  it("rejects duplicate node ids", () => {
    const document = createBaseDocument();
    document.root.children.push({
      id: "duplicate",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      visible: true,
      opacity: 1,
      children: [],
    });
    document.root.children.push({
      id: "duplicate",
      type: "rectangle",
      x: 20,
      y: 20,
      width: 10,
      height: 10,
      visible: true,
      opacity: 1,
      children: [],
    });

    expect(safeParseDesignDocument(document).success).toBe(false);
  });

  it("round-trips through JSON serialization", () => {
    const document = createBaseDocument();
    const first = parseDesignDocument(document);
    const serialized = JSON.stringify(first);
    const second = parseDesignDocument(JSON.parse(serialized));
    expect(second).toEqual(first);
  });
});

describe("Design Schema V0.2 & Gradient Fill Support", () => {
  function createV01Document() {
    return {
      schemaVersion: "0.1" as const,
      capture: {
        capturedAt: "2026-10-13T07:00:00.000Z",
        source: { kind: "test" },
      },
      viewport: {
        width: 1280,
        height: 720,
        devicePixelRatio: 1,
        scrollX: 0,
        scrollY: 0,
      },
      root: {
        id: "root",
        type: "frame" as const,
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        visible: true,
        opacity: 1,
        style: {
          fills: [{ type: "solid" as const, color: { r: 1, g: 0, b: 0, a: 1 } }],
        },
        children: [],
      },
      assets: [],
    };
  }

  it("identifies supported versions correctly", () => {
    expect(isSupportedSchemaVersion("0.1")).toBe(true);
    expect(isSupportedSchemaVersion("0.2")).toBe(true);
    expect(isSupportedSchemaVersion("0.3")).toBe(false);
    expect(isSupportedSchemaVersion("1.0")).toBe(false);
    expect(isSupportedSchemaVersion(null)).toBe(false);
  });

  it("parses valid V0.1 documents without modification", () => {
    const v01Doc = createV01Document();
    const parsed = parseDesignDocument(v01Doc);
    expect(parsed.schemaVersion).toBe("0.1");
    expect(parsed.root.style?.fills?.[0]?.type).toBe("solid");
  });

  it("upgrades/normalizes V0.1 documents to V0.2 with identical semantics", () => {
    const v01Doc = createV01Document();
    const parsed = parseDesignDocument(v01Doc);
    const upgraded = normalizeDesignDocument(parsed);
    expect(upgraded.schemaVersion).toBe("0.2");
    expect(upgraded.root.id).toBe(v01Doc.root.id);
    expect(upgraded.root.style?.fills).toEqual(v01Doc.root.style.fills);
    expect(upgradeDesignDocumentToLatest(parsed)).toEqual(upgraded);
  });

  it("strictly rejects gradient fills in V0.1 documents", () => {
    const docWithGradient = {
      ...createV01Document(),
      root: {
        ...createV01Document().root,
        style: {
          fills: [
            {
              type: "linear-gradient",
              angle: 90,
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
                { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
              ],
            },
          ],
        },
      },
    };
    const result = safeParseDesignDocument(docWithGradient);
    expect(result.success).toBe(false);
  });

  it("parses valid V0.2 linear gradient fills", () => {
    const v02Doc = {
      ...createV01Document(),
      schemaVersion: "0.2" as const,
      root: {
        ...createV01Document().root,
        style: {
          fills: [
            {
              type: "linear-gradient" as const,
              angle: 135,
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0, a: 0.5 } },
                { position: 0.5, color: { r: 0, g: 1, b: 0, a: 1 } },
                { position: 1, color: { r: 0, g: 0, b: 1, a: 0.8 } },
              ],
            },
          ],
        },
      },
    };
    const parsed = parseDesignDocument(v02Doc);
    expect(parsed.schemaVersion).toBe("0.2");
    expect(parsed.root.style?.fills?.[0]?.type).toBe("linear-gradient");
  });

  it("parses valid V0.2 radial gradient fills", () => {
    const v02Doc = {
      ...createV01Document(),
      schemaVersion: "0.2" as const,
      root: {
        ...createV01Document().root,
        style: {
          fills: [
            {
              type: "radial-gradient" as const,
              center: { x: 0.25, y: 0.75 },
              radius: { x: 0.5, y: 0.5 },
              shape: "circle" as const,
              stops: [
                { position: 0, color: { r: 1, g: 1, b: 0, a: 1 } },
                { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } },
              ],
            },
          ],
        },
      },
    };
    const parsed = parseDesignDocument(v02Doc);
    expect(parsed.schemaVersion).toBe("0.2");
    expect(parsed.root.style?.fills?.[0]?.type).toBe("radial-gradient");
  });

  it("parses layered fills (gradient + solid) preserving order", () => {
    const v02Doc = {
      ...createV01Document(),
      schemaVersion: "0.2" as const,
      root: {
        ...createV01Document().root,
        style: {
          fills: [
            {
              type: "linear-gradient" as const,
              angle: 90,
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0, a: 0.5 } },
                { position: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } },
              ],
            },
            {
              type: "solid" as const,
              color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
            },
          ],
        },
      },
    };
    const parsed = parseDesignDocument(v02Doc);
    expect(parsed.root.style?.fills?.length).toBe(2);
    expect(parsed.root.style?.fills?.[0]?.type).toBe("linear-gradient");
    expect(parsed.root.style?.fills?.[1]?.type).toBe("solid");
  });

  it("strictly rejects invalid gradient fills in V0.2", () => {
    const base = {
      ...createV01Document(),
      schemaVersion: "0.2" as const,
    };

    // Unknown gradient type
    expect(
      safeParseDesignDocument({
        ...base,
        root: {
          ...base.root,
          style: {
            fills: [{ type: "conic-gradient", stops: [] }],
          },
        },
      }).success,
    ).toBe(false);

    // Fewer than 2 stops
    expect(
      safeParseDesignDocument({
        ...base,
        root: {
          ...base.root,
          style: {
            fills: [
              {
                type: "linear-gradient",
                angle: 90,
                stops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }],
              },
            ],
          },
        },
      }).success,
    ).toBe(false);

    // Stop position out of range
    expect(
      safeParseDesignDocument({
        ...base,
        root: {
          ...base.root,
          style: {
            fills: [
              {
                type: "linear-gradient",
                angle: 90,
                stops: [
                  { position: -0.1, color: { r: 1, g: 0, b: 0, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
                ],
              },
            ],
          },
        },
      }).success,
    ).toBe(false);

    // Angle out of range
    expect(
      safeParseDesignDocument({
        ...base,
        root: {
          ...base.root,
          style: {
            fills: [
              {
                type: "linear-gradient",
                angle: 400,
                stops: [
                  { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
                ],
              },
            ],
          },
        },
      }).success,
    ).toBe(false);

    // Unknown extra field
    expect(
      safeParseDesignDocument({
        ...base,
        root: {
          ...base.root,
          style: {
            fills: [
              {
                type: "linear-gradient",
                angle: 90,
                extraField: "forbidden",
                stops: [
                  { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
                ],
              },
            ],
          },
        },
      }).success,
    ).toBe(false);
  });
});

