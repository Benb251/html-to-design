import { describe, expect, it } from "vitest";
import { renderDesignDocument, deriveNodeName } from "../src/renderer.js";
import {
  imageFixture,
  inlineSvgFixture,
  nestedFramesFixture,
  simpleTextFixture,
  styledRectangleFixture,
} from "@web2design/test-fixtures";
import { FakeFigmaHost, type FakeFrameNode, type FakeRectangleNode, type FakeTextNode } from "./helpers/fake-figma-host.js";

describe("figma-renderer - renderDesignDocument", () => {
  it("renders simpleTextFixture with root frame and child text node", async () => {
    const host = new FakeFigmaHost();
    const result = await renderDesignDocument(simpleTextFixture, host);

    expect(result.createdNodeCount).toBe(2); // root + text
    expect(result.skippedNodeCount).toBe(0);
    expect(result.warnings.length).toBe(0);

    expect(host.roots.length).toBe(1);
    const root = host.roots[0]!;
    expect(root.name).toBe("Web2Design — Fixture");
    expect(root.width).toBe(800);
    expect(root.height).toBe(600);

    // Centered placement based on viewportCenter { x: 500, y: 500 }
    expect(root.x).toBe(100); // 500 - 400
    expect(root.y).toBe(200); // 500 - 300

    // Traceability metadata
    expect(root.getPluginData("web2design:id")).toBe("root");
    expect(root.getPluginData("web2design:type")).toBe("frame");
    expect(root.getPluginData("web2design:schemaVersion")).toBe("0.2");

    // Children
    expect(root.children.length).toBe(1);
    const textNode = root.children[0]! as unknown as FakeTextNode;
    expect(textNode.type).toBe("TEXT");
    expect(textNode.characters).toBe("Hello Web2Design");
    expect(textNode.x).toBe(24);
    expect(textNode.y).toBe(24);
    expect(textNode.getPluginData("web2design:id")).toBe("text-1");

    // Selection & scroll into view
    expect(host.selection).toEqual([root]);
    expect(host.viewedNodes).toEqual([root]);
  });

  it("converts nested frame coordinates recursively", async () => {
    const host = new FakeFigmaHost();
    const result = await renderDesignDocument(nestedFramesFixture, host);

    expect(result.createdNodeCount).toBe(4); // root -> outer -> inner -> text
    const root = host.roots[0]!;

    // outer-frame inside root: x: 40, y: 40
    const outer = root.children[0]! as unknown as FakeFrameNode;
    expect(outer.x).toBe(40);
    expect(outer.y).toBe(40);
    expect(outer.width).toBe(400);
    expect(outer.height).toBe(300);

    // inner-frame inside outer-frame: schema x: 80, y: 80 -> local x: 40, y: 40
    const inner = outer.children[0]! as unknown as FakeFrameNode;
    expect(inner.x).toBe(40);
    expect(inner.y).toBe(40);
    expect(inner.width).toBe(200);
    expect(inner.height).toBe(120);

    // nested-text inside inner-frame: schema x: 96, y: 96 -> local x: 16, y: 16
    const text = inner.children[0]! as unknown as FakeTextNode;
    expect(text.x).toBe(16);
    expect(text.y).toBe(16);
    expect(text.characters).toBe("Nested");
  });

  it("renders styled rectangle with borders, fills, and corner radius", async () => {
    const host = new FakeFigmaHost();
    const result = await renderDesignDocument(styledRectangleFixture, host);

    expect(result.createdNodeCount).toBe(2);
    const root = host.roots[0]!;
    const rect = root.children[0]! as unknown as FakeRectangleNode;

    expect(rect.type).toBe("RECTANGLE");
    expect(rect.width).toBe(320);
    expect(rect.height).toBe(180);
    expect(rect.cornerRadius).toBe(12);
    expect(rect.strokeWeight).toBe(1);
    expect(rect.fills.length).toBe(1);
    expect(rect.strokes.length).toBe(1);
  });

  it("renders image node with image fill from asset record", async () => {
    const host = new FakeFigmaHost();
    const result = await renderDesignDocument(imageFixture, host);

    expect(result.createdNodeCount).toBe(2);
    const root = host.roots[0]!;
    const imageRect = root.children[0]! as unknown as FakeRectangleNode;

    expect(imageRect.type).toBe("RECTANGLE");
    expect(imageRect.getPluginData("web2design:type")).toBe("image");
    expect(imageRect.fills.length).toBe(1);
    expect(imageRect.fills[0]!.type).toBe("IMAGE");
  });

  it("renders inline SVG node", async () => {
    const host = new FakeFigmaHost();
    const result = await renderDesignDocument(inlineSvgFixture, host);

    expect(result.createdNodeCount).toBe(2);
    const root = host.roots[0]!;
    const svgFrame = root.children[0]! as unknown as FakeFrameNode;

    expect(svgFrame.type).toBe("FRAME");
    expect(svgFrame.getPluginData("web2design:type")).toBe("svg");
    expect(svgFrame.width).toBe(24);
    expect(svgFrame.height).toBe(24);
  });

  it("rolls back and cleans up root frame on fatal host error", async () => {
    const host = new FakeFigmaHost();
    // Simulate fatal error on appendRoot
    host.appendRoot = () => {
      throw new Error("Fatal figma canvas crash");
    };

    await expect(renderDesignDocument(simpleTextFixture, host)).rejects.toThrow("Fatal figma canvas crash");
  });

  describe("deriveNodeName", () => {
    it("uses explicit name when present", () => {
      const node = { id: "1", type: "frame" as const, name: "Hero Section", x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 1, children: [] };
      expect(deriveNodeName(node)).toBe("Hero Section");
    });

    it("creates preview name for text nodes", () => {
      const node = {
        id: "2",
        type: "text" as const,
        characters: "Build faster with Web2Design",
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        visible: true,
        opacity: 1,
        children: [] as [],
        textStyle: {
          fontFamily: "Inter",
          fontSize: 14,
          fontWeight: 400,
          fontStyle: "normal" as const,
          lineHeight: 20,
          letterSpacing: 0,
          textAlign: "left" as const,
          color: { r: 0, g: 0, b: 0, a: 1 },
        },
      };
      expect(deriveNodeName(node)).toBe('Text — "Build faster with Web2De…"');
    });

    it("uses sourceTag when available", () => {
      const node = { id: "3", type: "rectangle" as const, sourceTag: "section", x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 1, children: [] as [] };
      expect(deriveNodeName(node)).toBe("section");
    });
  });
});
