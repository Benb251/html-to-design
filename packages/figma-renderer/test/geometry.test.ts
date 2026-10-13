import { describe, expect, it } from "vitest";
import { calculateLocalCoordinates, calculateRootPlacement } from "../src/geometry.js";

describe("figma-renderer - geometry", () => {
  describe("calculateLocalCoordinates", () => {
    it("converts direct child coordinates relative to parent", () => {
      const child = { x: 100, y: 150 };
      const parent = { x: 40, y: 50 };
      const local = calculateLocalCoordinates(child, parent);

      expect(local.x).toBe(60);
      expect(local.y).toBe(100);
    });

    it("handles deeply nested hierarchy correctly", () => {
      const root = { x: 0, y: 0 };
      const outerFrame = { x: 100, y: 100 };
      const innerFrame = { x: 140, y: 160 };
      const leafNode = { x: 150, y: 190 };

      // outer relative to root
      const outerLocal = calculateLocalCoordinates(outerFrame, root);
      expect(outerLocal).toEqual({ x: 100, y: 100 });

      // inner relative to outer
      const innerLocal = calculateLocalCoordinates(innerFrame, outerFrame);
      expect(innerLocal).toEqual({ x: 40, y: 60 });

      // leaf relative to inner
      const leafLocal = calculateLocalCoordinates(leafNode, innerFrame);
      expect(leafLocal).toEqual({ x: 10, y: 30 });
    });

    it("handles fractional CSS pixel positions accurately", () => {
      const child = { x: 12.34, y: 56.78 };
      const parent = { x: 10.14, y: 50.28 };
      const local = calculateLocalCoordinates(child, parent);

      expect(local.x).toBeCloseTo(2.2, 5);
      expect(local.y).toBeCloseTo(6.5, 5);
    });

    it("handles negative and offscreen positions", () => {
      const child = { x: -20, y: -40 };
      const parent = { x: 50, y: 80 };
      const local = calculateLocalCoordinates(child, parent);

      expect(local.x).toBe(-70);
      expect(local.y).toBe(-120);
    });

    it("handles child inside parent with non-zero document coordinates", () => {
      const parent = { x: 320, y: 480 };
      const child = { x: 350, y: 500 };
      const local = calculateLocalCoordinates(child, parent);

      expect(local.x).toBe(30);
      expect(local.y).toBe(20);
    });
  });

  describe("calculateRootPlacement", () => {
    it("centers root frame on specified viewport center", () => {
      const placement = calculateRootPlacement(
        { width: 800, height: 600 },
        { x: 1000, y: 1000 },
      );
      expect(placement).toEqual({ x: 600, y: 700 });
    });

    it("falls back to (0, 0) center if viewportCenter is undefined", () => {
      const placement = calculateRootPlacement({ width: 800, height: 600 }, undefined);
      expect(placement).toEqual({ x: -400, y: -300 });
    });

    it("rounds coordinates to integer values", () => {
      const placement = calculateRootPlacement(
        { width: 333, height: 555 },
        { x: 100.5, y: 200.7 },
      );
      expect(Number.isInteger(placement.x)).toBe(true);
      expect(Number.isInteger(placement.y)).toBe(true);
    });
  });
});
