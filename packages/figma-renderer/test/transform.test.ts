import { describe, expect, it } from "vitest";
import type { DesignDocumentV05, FrameNode, RectangleNode } from "@web2design/design-schema";
import { FakeFigmaHost, type FakeTextNode } from "../src/fake-host.js";
import {
  calculateNodePlacement,
  cssAngleToFigmaRotation,
  invert2DPoint,
} from "../src/geometry.js";
import { renderDesignDocument } from "../src/renderer.js";

describe("figma-renderer - transform and rotation", () => {
  describe("cssAngleToFigmaRotation", () => {
    it("converts angles matching Figma sign convention exactly", () => {
      expect(cssAngleToFigmaRotation(15)).toBe(-15);
      expect(cssAngleToFigmaRotation(-15)).toBe(15);
      expect(cssAngleToFigmaRotation(45)).toBe(-45);
      expect(cssAngleToFigmaRotation(90)).toBe(-90);
      expect(cssAngleToFigmaRotation(180)).toBe(180);
      expect(cssAngleToFigmaRotation(270)).toBe(90);
      expect(cssAngleToFigmaRotation(0)).toBe(0);
      expect(cssAngleToFigmaRotation(360)).toBe(0);
    });
  });

  describe("invert2DPoint", () => {
    it("inverts 2D point transformation accurately", () => {
      // 90 deg rotation around (50, 50)
      const rad = (90 * Math.PI) / 180;
      const matrix = {
        a: Math.cos(rad),
        b: Math.sin(rad),
        c: -Math.sin(rad),
        d: Math.cos(rad),
        e: 0,
        f: 0,
      };
      const origin = { x: 50, y: 50 };
      // Forward: (0, 0) -> (100, 0)
      const inverted = invert2DPoint(matrix, origin, 100, 0);
      expect(inverted?.x).toBeCloseTo(0, 2);
      expect(inverted?.y).toBeCloseTo(0, 2);
    });
  });

  describe("calculateNodePlacement and origin compensation", () => {
    const parentNode: FrameNode = {
      id: "parent",
      type: "frame",
      name: "Parent",
      sourceTag: "div",
      x: 100,
      y: 100,
      width: 500,
      height: 500,
      visible: true,
      opacity: 1,
      children: [],
    };

    it("compensates center origin rotation (50% 50%)", () => {
      // 100x100 box at base (100, 100), rotated 90deg around center (50, 50)
      const childNode: RectangleNode = {
        id: "child",
        type: "rectangle",
        name: "Rect",
        sourceTag: "div",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        visible: true,
        opacity: 1,
        children: [],
        transform: {
          matrix: { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 },
          origin: { x: 50, y: 50 },
          baseBounds: { x: 100, y: 100, width: 100, height: 100 },
        },
      };

      const placement = calculateNodePlacement(childNode, parentNode);
      // baseX = 100 - 100 = 0.
      // m02 = 0 + 50 - 0*50 - (-1)*50 = 100.
      // m12 = 0 + 50 - 1*50 - 0*50 = 0.
      expect(placement.x).toBe(100);
      expect(placement.y).toBe(0);
      expect(placement.rotation).toBe(-90);
    });

    it("compensates top-left origin rotation (0, 0)", () => {
      const childNode: RectangleNode = {
        id: "child",
        type: "rectangle",
        name: "Rect",
        sourceTag: "div",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        visible: true,
        opacity: 1,
        children: [],
        transform: {
          matrix: { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 },
          origin: { x: 0, y: 0 },
          baseBounds: { x: 100, y: 100, width: 100, height: 100 },
        },
      };

      const placement = calculateNodePlacement(childNode, parentNode);
      expect(placement.x).toBe(0);
      expect(placement.y).toBe(0);
      expect(placement.rotation).toBe(-90);
    });

    it("compensates bottom-right origin rotation (100, 100)", () => {
      const childNode: RectangleNode = {
        id: "child",
        type: "rectangle",
        name: "Rect",
        sourceTag: "div",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        visible: true,
        opacity: 1,
        children: [],
        transform: {
          matrix: { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 },
          origin: { x: 100, y: 100 },
          baseBounds: { x: 100, y: 100, width: 100, height: 100 },
        },
      };

      const placement = calculateNodePlacement(childNode, parentNode);
      // baseX = 0, ox = 100, oy = 100.
      // m02 = 0 + 100 - 0*100 - (-1)*100 = 200.
      // m12 = 0 + 100 - 1*100 - 0*100 = 0.
      expect(placement.x).toBe(200);
      expect(placement.y).toBe(0);
    });

    it("compensates custom origin (25% 75%) -> (25, 75)", () => {
      const childNode: RectangleNode = {
        id: "child",
        type: "rectangle",
        name: "Rect",
        sourceTag: "div",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        visible: true,
        opacity: 1,
        children: [],
        transform: {
          matrix: { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 },
          origin: { x: 25, y: 75 },
          baseBounds: { x: 100, y: 100, width: 100, height: 100 },
        },
      };

      const placement = calculateNodePlacement(childNode, parentNode);
      // baseX = 0, ox = 25, oy = 75.
      // m02 = 0 + 25 - 0*25 - (-1)*75 = 100.
      // m12 = 0 + 75 - 1*25 - 0*75 = 50.
      expect(placement.x).toBe(100);
      expect(placement.y).toBe(50);
    });
  });

  describe("renderDesignDocument with transforms", () => {
    it("renders rotated text node as editable TextNode with rotation", async () => {
      const doc: DesignDocumentV05 = {
        schemaVersion: "0.5",
        capture: {
          capturedAt: "2026-10-14T00:00:00.000Z",
          source: { kind: "chrome-extension", name: "Web2Design", version: "0.1.0" },
          page: { url: "https://example.com", title: "Test" },
        },
        viewport: { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
        assets: [],
        warnings: [],
        root: {
          id: "root",
          type: "frame",
          name: "Root",
          sourceTag: "html",
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          visible: true,
          opacity: 1,
          children: [
            {
              id: "text-1",
              type: "text",
              name: "Heading",
              sourceTag: "h1",
              x: 100,
              y: 100,
              width: 200,
              height: 40,
              visible: true,
              opacity: 1,
              characters: "Rotated Editable Text",
              textStyle: {
                fontFamily: "Inter",
                fontSize: 24,
                fontWeight: 700,
                fontStyle: "normal",
                lineHeight: 32,
                letterSpacing: 0,
                textAlign: "left",
                color: { r: 0, g: 0, b: 0, a: 1 },
              },
              transform: {
                matrix: { a: 0.866, b: 0.5, c: -0.5, d: 0.866, e: 0, f: 0 }, // 30 deg
                origin: { x: 100, y: 20 },
                baseBounds: { x: 100, y: 100, width: 200, height: 40 },
              },
              children: [],
            },
          ],
        },
      };

      const host = new FakeFigmaHost();
      const res = await renderDesignDocument(doc, host);
      expect(res.skippedNodeCount).toBe(0);
      expect(res.createdNodeCount).toBe(2);

      const root = host.roots[0]!;
      const text = root.children[0]! as unknown as FakeTextNode;
      expect(text.type).toBe("TEXT");
      expect(text.characters).toBe("Rotated Editable Text");
      expect(text.rotation).toBeCloseTo(-30, 1);
    });

    it("rescales node when uniform scale is present", async () => {
      const doc: DesignDocumentV05 = {
        schemaVersion: "0.5",
        capture: {
          capturedAt: "2026-10-14T00:00:00.000Z",
          source: { kind: "chrome-extension", name: "Web2Design", version: "0.1.0" },
          page: { url: "https://example.com", title: "Test" },
        },
        viewport: { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
        assets: [],
        warnings: [],
        root: {
          id: "root",
          type: "frame",
          name: "Root",
          sourceTag: "html",
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          visible: true,
          opacity: 1,
          children: [
            {
              id: "rect-scale",
              type: "rectangle",
              name: "Scaled Rect",
              sourceTag: "div",
              x: 100,
              y: 100,
              width: 200,
              height: 200,
              visible: true,
              opacity: 1,
              style: {
                fills: [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }],
              },
              transform: {
                matrix: { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }, // 2x uniform scale
                origin: { x: 50, y: 50 },
                baseBounds: { x: 100, y: 100, width: 100, height: 100 },
              },
              children: [],
            },
          ],
        },
      };

      const host = new FakeFigmaHost();
      const res = await renderDesignDocument(doc, host);
      expect(res.skippedNodeCount).toBe(0);

      const root = host.roots[0]!;
      const rect = root.children[0]! as unknown as { width: number; height: number };
      expect(rect.width).toBe(200);
      expect(rect.height).toBe(200);
    });

    it("warns and approximates non-uniform scale", async () => {
      const doc: DesignDocumentV05 = {
        schemaVersion: "0.5",
        capture: {
          capturedAt: "2026-10-14T00:00:00.000Z",
          source: { kind: "chrome-extension", name: "Web2Design", version: "0.1.0" },
          page: { url: "https://example.com", title: "Test" },
        },
        viewport: { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
        assets: [],
        warnings: [],
        root: {
          id: "root",
          type: "frame",
          name: "Root",
          sourceTag: "html",
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          visible: true,
          opacity: 1,
          children: [
            {
              id: "rect-nonuniform",
              type: "rectangle",
              name: "Nonuniform",
              sourceTag: "div",
              x: 100,
              y: 100,
              width: 150,
              height: 50,
              visible: true,
              opacity: 1,
              style: {},
              transform: {
                matrix: { a: 1.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 },
                origin: { x: 50, y: 50 },
                baseBounds: { x: 100, y: 100, width: 100, height: 100 },
              },
              children: [],
            },
          ],
        },
      };

      const host = new FakeFigmaHost();
      const res = await renderDesignDocument(doc, host);
      expect(res.warnings.some((w) => w.code === "TRANSFORM_SCALE_APPROXIMATED")).toBe(true);
    });

    it("warns on negative scale / reflection", async () => {
      const doc: DesignDocumentV05 = {
        schemaVersion: "0.5",
        capture: {
          capturedAt: "2026-10-14T00:00:00.000Z",
          source: { kind: "chrome-extension", name: "Web2Design", version: "0.1.0" },
          page: { url: "https://example.com", title: "Test" },
        },
        viewport: { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
        assets: [],
        warnings: [],
        root: {
          id: "root",
          type: "frame",
          name: "Root",
          sourceTag: "html",
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          visible: true,
          opacity: 1,
          children: [
            {
              id: "rect-mirror",
              type: "rectangle",
              name: "Mirrored",
              sourceTag: "div",
              x: 100,
              y: 100,
              width: 100,
              height: 100,
              visible: true,
              opacity: 1,
              style: {},
              transform: {
                matrix: { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 },
                origin: { x: 50, y: 50 },
                baseBounds: { x: 100, y: 100, width: 100, height: 100 },
              },
              children: [],
            },
          ],
        },
      };

      const host = new FakeFigmaHost();
      const res = await renderDesignDocument(doc, host);
      expect(res.warnings.some((w) => w.code === "TRANSFORM_REFLECTION_UNSUPPORTED")).toBe(true);
    });
  });
});
