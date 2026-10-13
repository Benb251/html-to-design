import { describe, expect, it } from "vitest";
import {
  calculateLinearGradientTransform,
  calculateRadialGradientTransform,
  toFigmaColorStops,
} from "../src/gradients.js";
import { toFigmaFills } from "../src/colors.js";
import { FakeFigmaHost, type FakeFrameNode } from "../src/fake-host.js";
import { renderDesignDocument } from "../src/renderer.js";
import type {
  LinearGradientFill,
  RadialGradientFill,
  VersionedDesignDocument,
} from "@web2design/design-schema";

describe("Figma Renderer Gradient Fill Support (W2D-012)", () => {
  describe("Linear Gradient Transform Math", () => {
    it("computes correct matrix for cardinal directions on square box (100x100)", () => {
      const sq = { width: 100, height: 100 };

      // 0deg = to top -> gradient line from bottom (0.5, 1) to top (0.5, 0)
      const t0 = calculateLinearGradientTransform(0, sq);
      expect(t0[0][2]).toBeCloseTo(0.5, 3); // tx
      expect(t0[1][2]).toBeCloseTo(1, 3);   // ty (start at bottom)
      expect(t0[0][0] + t0[0][2]).toBeCloseTo(0.5, 3); // end X
      expect(t0[1][0] + t0[1][2]).toBeCloseTo(0, 3);   // end Y (end at top)

      // 90deg = to right -> from left (0, 0.5) to right (1, 0.5)
      const t90 = calculateLinearGradientTransform(90, sq);
      expect(t90[0][2]).toBeCloseTo(0, 3);   // tx (start at left)
      expect(t90[1][2]).toBeCloseTo(0.5, 3); // ty
      expect(t90[0][0] + t90[0][2]).toBeCloseTo(1, 3); // end X (end at right)
      expect(t90[1][0] + t90[1][2]).toBeCloseTo(0.5, 3); // end Y

      // 180deg = to bottom -> from top (0.5, 0) to bottom (0.5, 1)
      const t180 = calculateLinearGradientTransform(180, sq);
      expect(t180[0][2]).toBeCloseTo(0.5, 3);
      expect(t180[1][2]).toBeCloseTo(0, 3);
      expect(t180[0][0] + t180[0][2]).toBeCloseTo(0.5, 3);
      expect(t180[1][0] + t180[1][2]).toBeCloseTo(1, 3);

      // 270deg = to left -> from right (1, 0.5) to left (0, 0.5)
      const t270 = calculateLinearGradientTransform(270, sq);
      expect(t270[0][2]).toBeCloseTo(1, 3);
      expect(t270[1][2]).toBeCloseTo(0.5, 3);
      expect(t270[0][0] + t270[0][2]).toBeCloseTo(0, 3);
      expect(t270[1][0] + t270[1][2]).toBeCloseTo(0.5, 3);
    });

    it("computes correct matrix for diagonal directions (45deg)", () => {
      const sq = { width: 100, height: 100 };
      const t45 = calculateLinearGradientTransform(45, sq);
      // At 45deg on square, gradient vector points up-right (positive X, negative Y)
      const startX = t45[0][2];
      const startY = t45[1][2];
      const endX = t45[0][0] + t45[0][2];
      const endY = t45[1][0] + t45[1][2];

      expect(endX).toBeGreaterThan(startX);
      expect(endY).toBeLessThan(startY);
    });

    it("accounts for rectangular aspect ratios (300x100 landscape vs 100x300 portrait)", () => {
      const landscape = { width: 300, height: 100 };
      const portrait = { width: 100, height: 300 };

      const tLand = calculateLinearGradientTransform(45, landscape);
      const tPort = calculateLinearGradientTransform(45, portrait);

      // In landscape, W > H, so gradient line length L = |300*sin(45)| + |100*cos(45)| = 400*sqrt(2)/2
      // sx = 0.5 - 200/600 = 0.1667; sy = 0.5 + 200/200 = 1.5
      expect(tLand[0][2]).toBeCloseTo(0.1667, 3);
      expect(tLand[1][2]).toBeCloseTo(1.5, 3);

      // In portrait, W < H, so sx = 0.5 - 200/200 = -0.5; sy = 0.5 + 200/600 = 0.8333
      expect(tPort[0][2]).toBeCloseTo(-0.5, 3);
      expect(tPort[1][2]).toBeCloseTo(0.8333, 3);
    });
  });

  describe("Radial Gradient Transform Math", () => {
    it("maps centered radial gradient correctly", () => {
      const fill: RadialGradientFill = {
        type: "radial-gradient",
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0.7071, y: 0.7071 },
        stops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
        ],
      };
      const t = calculateRadialGradientTransform(fill);
      expect(t[0][2]).toBe(0.5); // cx
      expect(t[1][2]).toBe(0.5); // cy
      expect(t[0][0]).toBe(0.7071); // rx
      expect(t[1][1]).toBe(0.7071); // ry
    });

    it("maps offset center and elliptical radial gradients correctly", () => {
      const fill: RadialGradientFill = {
        type: "radial-gradient",
        center: { x: 0.25, y: 0.75 },
        radius: { x: 1.0, y: 0.5 },
        stops: [
          { position: 0, color: { r: 1, g: 1, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
        ],
      };
      const t = calculateRadialGradientTransform(fill);
      expect(t[0][2]).toBe(0.25);
      expect(t[1][2]).toBe(0.75);
      expect(t[0][0]).toBe(1.0);
      expect(t[1][1]).toBe(0.5);
    });
  });

  describe("Gradient Stops and Paint Opacity", () => {
    it("preserves color stop positions, RGB values, and alpha without multiplying alpha", () => {
      const stops = [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 0.5 } },
        { position: 0.5, color: { r: 0, g: 1, b: 0, a: 0.75 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 0.25 } },
      ];
      const figmaStops = toFigmaColorStops(stops);
      expect(figmaStops).toHaveLength(3);
      expect(figmaStops[0]?.position).toBe(0);
      expect(figmaStops[0]?.color).toEqual({ r: 1, g: 0, b: 0, a: 0.5 });
      expect(figmaStops[1]?.position).toBe(0.5);
      expect(figmaStops[1]?.color).toEqual({ r: 0, g: 1, b: 0, a: 0.75 });
      expect(figmaStops[2]?.position).toBe(1);
      expect(figmaStops[2]?.color).toEqual({ r: 0, g: 0, b: 1, a: 0.25 });
    });

    it("preserves hard stops with identical positions", () => {
      const stops = [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 0.5, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 0.5, color: { r: 0, g: 0, b: 1, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ];
      const figmaStops = toFigmaColorStops(stops);
      expect(figmaStops).toHaveLength(4);
      expect(figmaStops[1]?.position).toBe(0.5);
      expect(figmaStops[2]?.position).toBe(0.5);
    });
  });

  describe("Layered Paints (Gradients + Solid)", () => {
    it("maps CSS top gradient + underlying solid to Figma bottom solid + top gradient", () => {
      const linearFill: LinearGradientFill = {
        type: "linear-gradient",
        angle: 90,
        stops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 0.5 } },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } },
        ],
      };
      const solidFill = {
        type: "solid" as const,
        color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      };

      // In CSS schema: fills[0] is top gradient, fills[1] is bottom solid
      const figmaPaints = toFigmaFills([linearFill, solidFill]);
      expect(figmaPaints).toHaveLength(2);

      // In Figma Paint array: index 0 is rendered at bottom, index 1 is on top
      expect(figmaPaints[0]?.type).toBe("SOLID");
      expect(figmaPaints[1]?.type).toBe("GRADIENT_LINEAR");
    });
  });

  describe("End-to-End Renderer with FakeFigmaHost", () => {
    it("renders linear and radial gradient paints onto Figma nodes", async () => {
      const host = new FakeFigmaHost();
      const doc: VersionedDesignDocument = {
        schemaVersion: "0.2",
        capture: {
          capturedAt: "2026-10-13T07:00:00.000Z",
          source: { kind: "test" },
        },
        viewport: { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
        root: {
          id: "root",
          type: "frame",
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          visible: true,
          opacity: 1,
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
          children: [
            {
              id: "radial-card",
              type: "rectangle",
              x: 50,
              y: 50,
              width: 300,
              height: 200,
              visible: true,
              opacity: 1,
              style: {
                fills: [
                  {
                    type: "radial-gradient",
                    center: { x: 0.5, y: 0.5 },
                    radius: { x: 0.7071, y: 0.7071 },
                    shape: "ellipse",
                    stops: [
                      { position: 0, color: { r: 1, g: 1, b: 0, a: 1 } },
                      { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } },
                    ],
                  },
                ],
              },
              children: [],
            },
          ],
        },
        assets: [],
      };

      const result = await renderDesignDocument(doc, host);
      expect(result.createdNodeCount).toBe(2);

      const root = host.roots[0]!;
      expect(root.fills).toHaveLength(1);
      expect((root.fills as readonly Paint[])[0]!.type).toBe("GRADIENT_LINEAR");

      const card = root.children[0] as unknown as FakeFrameNode;
      expect(card.fills).toHaveLength(1);
      expect((card.fills as readonly Paint[])[0]!.type).toBe("GRADIENT_RADIAL");
    });
  });
});
