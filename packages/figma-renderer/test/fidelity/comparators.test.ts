import { describe, expect, it } from "vitest";
import type { DesignNode, TextNode } from "@web2design/design-schema";
import {
  buildSourceIndex,
  compareFill,
  compareGeometry,
  compareHierarchy,
  compareRadius,
  compareShadow,
  compareStroke,
  compareText,
  compareWarnings,
} from "../../src/fidelity/comparator.js";
import type { NormalizedRenderedNode } from "../../src/fidelity/types.js";

describe("W2D-008 - Fidelity Comparators", () => {
  const dummySchemaNode: DesignNode = {
    id: "node-1",
    type: "rectangle",
    x: 100,
    y: 200,
    width: 320,
    height: 48,
    visible: true,
    opacity: 1,
    children: [],
  };

  const dummyRenderedNode: NormalizedRenderedNode = {
    sourceId: "node-1",
    sourceType: "rectangle",
    figmaType: "RECTANGLE",
    name: "Rectangle",
    x: 100,
    y: 200,
    width: 320,
    height: 48,
    absoluteX: 100,
    absoluteY: 200,
    opacity: 1,
  };

  describe("compareGeometry", () => {
    it("passes when geometry matches within tolerance", () => {
      const rendered = { ...dummyRenderedNode, width: 320.05, height: 47.95 };
      const failures = compareGeometry(dummySchemaNode, rendered, "test-fixture", 0.1);
      expect(failures).toHaveLength(0);
    });

    it("fails with actionable diff when geometry exceeds tolerance", () => {
      const rendered = { ...dummyRenderedNode, width: 318 };
      const failures = compareGeometry(dummySchemaNode, rendered, "test-fixture", 0.1);
      expect(failures).toHaveLength(1);
      expect(failures[0]!).toMatchObject({
        category: "GEOMETRY",
        property: "width",
        expected: 320,
        actual: 318,
        difference: -2,
        tolerance: 0.1,
      });
      expect(failures[0]!.message).toContain("diff: -2.000");
    });
  });

  describe("compareFill", () => {
    it("passes when solid fills match", () => {
      const schema: DesignNode = {
        ...dummySchemaNode,
        style: { fills: [{ type: "solid", color: { r: 1, g: 0.5, b: 0, a: 1 } }] },
      };
      const rendered: NormalizedRenderedNode = {
        ...dummyRenderedNode,
        fills: [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0, a: 1 } }],
      };
      const failures = compareFill(schema, rendered, "test-fixture");
      expect(failures).toHaveLength(0);
    });

    it("detects accidental fills when schema has none", () => {
      const schema: DesignNode = { ...dummySchemaNode, style: {} };
      const rendered: NormalizedRenderedNode = {
        ...dummyRenderedNode,
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
      };
      const failures = compareFill(schema, rendered, "test-fixture");
      expect(failures).toHaveLength(1);
      expect(failures[0]!.category).toBe("FILL");
      expect(failures[0]!.message).toContain("accidental fill");
    });
  });

  describe("compareStroke", () => {
    it("passes when stroke width and color match", () => {
      const schema: DesignNode = {
        ...dummySchemaNode,
        style: {
          border: { width: 2, style: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
        },
      };
      const rendered: NormalizedRenderedNode = {
        ...dummyRenderedNode,
        strokes: [{ width: 2, color: { r: 0, g: 0, b: 0, a: 1 } }],
      };
      const failures = compareStroke(schema, rendered, "test-fixture");
      expect(failures).toHaveLength(0);
    });

    it("fails when stroke width differs", () => {
      const schema: DesignNode = {
        ...dummySchemaNode,
        style: {
          border: { width: 2, style: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
        },
      };
      const rendered: NormalizedRenderedNode = {
        ...dummyRenderedNode,
        strokes: [{ width: 1, color: { r: 0, g: 0, b: 0, a: 1 } }],
      };
      const failures = compareStroke(schema, rendered, "test-fixture");
      expect(failures).toHaveLength(1);
      expect(failures[0]!.category).toBe("BORDER");
      expect(failures[0]!.property).toBe("strokeWeight");
    });
  });

  describe("compareRadius", () => {
    it("passes for uniform corner radius", () => {
      const schema: DesignNode = {
        ...dummySchemaNode,
        style: { cornerRadius: 8 },
      };
      const rendered: NormalizedRenderedNode = {
        ...dummyRenderedNode,
        radius: { uniform: 8 },
      };
      expect(compareRadius(schema, rendered, "test-fixture")).toHaveLength(0);
    });

    it("passes for 4 individual corners", () => {
      const schema: DesignNode = {
        ...dummySchemaNode,
        style: {
          cornerRadius: { topLeft: 4, topRight: 8, bottomRight: 12, bottomLeft: 16 },
        },
      };
      const rendered: NormalizedRenderedNode = {
        ...dummyRenderedNode,
        radius: { topLeft: 4, topRight: 8, bottomRight: 12, bottomLeft: 16 },
      };
      expect(compareRadius(schema, rendered, "test-fixture")).toHaveLength(0);
    });
  });

  describe("compareShadow", () => {
    it("passes for single outer drop shadow", () => {
      const schema: DesignNode = {
        ...dummySchemaNode,
        style: {
          boxShadows: [
            {
              offsetX: 0,
              offsetY: 4,
              blurRadius: 10,
              spreadRadius: 2,
              color: { r: 0, g: 0, b: 0, a: 0.2 },
              inset: false,
            },
          ],
        },
      };
      const rendered: NormalizedRenderedNode = {
        ...dummyRenderedNode,
        effects: [
          {
            type: "DROP_SHADOW",
            offsetX: 0,
            offsetY: 4,
            blurRadius: 10,
            spreadRadius: 2,
            color: { r: 0, g: 0, b: 0, a: 0.2 },
          },
        ],
      };
      expect(compareShadow(schema, rendered, "test-fixture")).toHaveLength(0);
    });
  });

  describe("compareText", () => {
    const textSchema: TextNode = {
      id: "text-1",
      type: "text",
      x: 0,
      y: 0,
      width: 200,
      height: 24,
      visible: true,
      opacity: 1,
      children: [],
      characters: "Hello World",
      textStyle: {
        fontFamily: "Inter",
        fontFallbacks: ["sans-serif"],
        fontSize: 16,
        fontWeight: 400,
        fontStyle: "normal",
        lineHeight: 24,
        letterSpacing: 0,
        textAlign: "left",
        color: { r: 0, g: 0, b: 0, a: 1 },
      },
    };

    it("passes for matching text node", () => {
      const rendered: NormalizedRenderedNode = {
        sourceId: "text-1",
        sourceType: "text",
        figmaType: "TEXT",
        name: "Text",
        x: 0,
        y: 0,
        width: 200,
        height: 24,
        absoluteX: 0,
        absoluteY: 0,
        opacity: 1,
        text: {
          characters: "Hello World",
          fontFamily: "Inter",
          fontStyle: "Regular",
          fontSize: 16,
          lineHeight: 24,
          letterSpacing: 0,
          textAlignHorizontal: "LEFT",
        },
        fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
      };
      expect(compareText(textSchema, rendered, "test-fixture")).toHaveLength(0);
    });
  });

  describe("compareHierarchy & Source ID traceability", () => {
    it("detects duplicate source IDs in tree", () => {
      const tree: NormalizedRenderedNode = {
        ...dummyRenderedNode,
        sourceId: "dup-id",
        children: [
          {
            ...dummyRenderedNode,
            sourceId: "dup-id",
          },
        ],
      };
      const index = buildSourceIndex(tree);
      expect(index.duplicates).toEqual(["dup-id"]);
    });

    it("detects sourceId mismatch between schema and rendered node", () => {
      const rendered = { ...dummyRenderedNode, sourceId: "different-id" };
      const failures = compareHierarchy(dummySchemaNode, rendered, "test-fixture");
      expect(failures).toHaveLength(1);
      expect(failures[0]!.property).toBe("sourceId");
    });
  });

  describe("compareWarnings", () => {
    it("passes when actual warning matches expected baseline rule", () => {
      const res = compareWarnings(
        [{ code: "BORDER_STYLE_APPROXIMATED", message: "dashed", nodeId: "elem-1" }],
        [{ code: "BORDER_STYLE_APPROXIMATED", nodeId: "elem-1" }],
        "test-fixture",
      );
      expect(res.failures).toHaveLength(0);
      expect(res.expectedCount).toBe(1);
      expect(res.unexpectedCount).toBe(0);
    });

    it("fails when unexpected warning appears", () => {
      const res = compareWarnings(
        [{ code: "UNEXPECTED_ERROR", message: "boom", nodeId: "elem-1" }],
        [],
        "test-fixture",
      );
      expect(res.failures).toHaveLength(1);
      expect(res.unexpectedCount).toBe(1);
    });
  });
});
