import { describe, expect, it } from "vitest";
import {
  classifyTransform,
  multiplyMatrix2D,
  parseCssAngleToRad,
  parseMatrixString,
  processElementTransform,
  reconstructBaseBounds,
  resolveTransformOrigin,
  round4,
} from "../src/transform.js";

describe("transform.ts unit tests", () => {
  it("multiplies 2D affine matrices correctly", () => {
    // Identity * Identity = Identity
    const id = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    expect(multiplyMatrix2D(id, id)).toEqual(id);

    // Translate by (10, 20) then translate by (5, -3) -> translate by (15, 17)
    const t1 = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
    const t2 = { a: 1, b: 0, c: 0, d: 1, e: 5, f: -3 };
    const combined = multiplyMatrix2D(t1, t2);
    expect(combined).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 15, f: 17 });
  });

  it("parses CSS angles into radians", () => {
    expect(parseCssAngleToRad("90deg")).toBeCloseTo(Math.PI / 2);
    expect(parseCssAngleToRad("180deg")).toBeCloseTo(Math.PI);
    expect(parseCssAngleToRad("-45deg")).toBeCloseTo(-Math.PI / 4);
    expect(parseCssAngleToRad("1rad")).toBeCloseTo(1);
    expect(parseCssAngleToRad("200grad")).toBeCloseTo(Math.PI);
    expect(parseCssAngleToRad("0.5turn")).toBeCloseTo(Math.PI);
    expect(parseCssAngleToRad("invalid")).toBeNull();
  });

  it("resolves transform origin properly", () => {
    // Default 50% 50%
    expect(resolveTransformOrigin(undefined, 100, 200)).toEqual({ x: 50, y: 100 });
    expect(resolveTransformOrigin("50% 50%", 100, 200)).toEqual({ x: 50, y: 100 });
    expect(resolveTransformOrigin("center center", 100, 200)).toEqual({ x: 50, y: 100 });
    expect(resolveTransformOrigin("top left", 100, 200)).toEqual({ x: 0, y: 0 });
    expect(resolveTransformOrigin("right bottom", 100, 200)).toEqual({ x: 100, y: 200 });
    expect(resolveTransformOrigin("25% 75%", 100, 200)).toEqual({ x: 25, y: 150 });
    expect(resolveTransformOrigin("10px 30px", 100, 200)).toEqual({ x: 10, y: 30 });
  });

  it("parses matrix() and reducible matrix3d() strings", () => {
    const m = parseMatrixString("matrix(1, 0, 0, 1, 10, 20)");
    expect(m).not.toBeNull();
    expect(m?.matrix).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
    expect(m?.is3D).toBe(false);

    // Reducible matrix3d
    const m3dReducible = parseMatrixString(
      "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 15, 25, 0, 1)",
    );
    expect(m3dReducible).not.toBeNull();
    expect(m3dReducible?.is3D).toBe(false);
    expect(m3dReducible?.matrix.e).toBe(15);
    expect(m3dReducible?.matrix.f).toBe(25);

    // Non-reducible 3D matrix (e.g. perspective or 3D rotation)
    const m3dTrue = parseMatrixString(
      "matrix3d(1, 0, 0, 0.002, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
    );
    expect(m3dTrue?.is3D).toBe(true);
  });

  describe("Base bounds reconstruction and inverse AABB validation", () => {
    // 1. 100x100 rotate 45deg around center
    it("reconstructs 100x100 rotate 45deg", () => {
      const baseW = 100;
      const baseH = 100;
      const rad = (45 * Math.PI) / 180;
      const matrix = {
        a: Math.cos(rad),
        b: Math.sin(rad),
        c: -Math.sin(rad),
        d: Math.cos(rad),
        e: 0,
        f: 0,
      };
      const origin = { x: 50, y: 50 };
      // Forward calculation to determine visualRect
      const corners: Array<[number, number]> = [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ];
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const [lx, ly] of corners) {
        const x = 50 + matrix.a * (lx - 50) + matrix.c * (ly - 50);
        const y = 50 + matrix.b * (lx - 50) + matrix.d * (ly - 50);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const visualRect = {
        x: 200 + minX,
        y: 100 + minY,
        width: maxX - minX,
        height: maxY - minY,
      };

      const result = reconstructBaseBounds(visualRect, baseW, baseH, matrix, origin);
      expect(result.baseBounds.x).toBeCloseTo(200, 1);
      expect(result.baseBounds.y).toBeCloseTo(100, 1);
      expect(result.baseBounds.width).toBe(100);
      expect(result.baseBounds.height).toBe(100);
      expect(result.maxError).toBeLessThan(0.01);
    });

    // 2. 300x100 rotate 30deg
    it("reconstructs 300x100 rotate 30deg", () => {
      const baseW = 300;
      const baseH = 100;
      const rad = (30 * Math.PI) / 180;
      const matrix = {
        a: Math.cos(rad),
        b: Math.sin(rad),
        c: -Math.sin(rad),
        d: Math.cos(rad),
        e: 0,
        f: 0,
      };
      const origin = { x: 150, y: 50 };
      const baseOrigin = { x: 50, y: 80 };
      const corners: Array<[number, number]> = [
        [0, 0],
        [300, 0],
        [300, 100],
        [0, 100],
      ];
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const [lx, ly] of corners) {
        const x = baseOrigin.x + origin.x + matrix.a * (lx - origin.x) + matrix.c * (ly - origin.y);
        const y = baseOrigin.y + origin.y + matrix.b * (lx - origin.x) + matrix.d * (ly - origin.y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const visualRect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

      const result = reconstructBaseBounds(visualRect, baseW, baseH, matrix, origin);
      expect(result.baseBounds.x).toBeCloseTo(baseOrigin.x, 1);
      expect(result.baseBounds.y).toBeCloseTo(baseOrigin.y, 1);
      expect(result.baseBounds.width).toBe(300);
      expect(result.baseBounds.height).toBe(100);
      expect(result.maxError).toBeLessThan(0.01);
    });

    // 3. 100x300 rotate -20deg
    it("reconstructs 100x300 rotate -20deg", () => {
      const baseW = 100;
      const baseH = 300;
      const rad = (-20 * Math.PI) / 180;
      const matrix = {
        a: Math.cos(rad),
        b: Math.sin(rad),
        c: -Math.sin(rad),
        d: Math.cos(rad),
        e: 0,
        f: 0,
      };
      const origin = { x: 50, y: 150 };
      const baseOrigin = { x: 120, y: 40 };
      const corners: Array<[number, number]> = [
        [0, 0],
        [100, 0],
        [100, 300],
        [0, 300],
      ];
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const [lx, ly] of corners) {
        const x = baseOrigin.x + origin.x + matrix.a * (lx - origin.x) + matrix.c * (ly - origin.y);
        const y = baseOrigin.y + origin.y + matrix.b * (lx - origin.x) + matrix.d * (ly - origin.y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const visualRect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

      const result = reconstructBaseBounds(visualRect, baseW, baseH, matrix, origin);
      expect(result.baseBounds.x).toBeCloseTo(baseOrigin.x, 1);
      expect(result.baseBounds.y).toBeCloseTo(baseOrigin.y, 1);
      expect(result.maxError).toBeLessThan(0.01);
    });

    // 4. Translation only
    it("reconstructs translation only", () => {
      const matrix = { a: 1, b: 0, c: 0, d: 1, e: 40, f: -20 };
      const origin = { x: 50, y: 50 };
      const visualRect = { x: 140, y: 80, width: 100, height: 100 };
      const result = reconstructBaseBounds(visualRect, 100, 100, matrix, origin);
      expect(result.baseBounds.x).toBe(100);
      expect(result.baseBounds.y).toBe(100);
      expect(result.maxError).toBe(0);
    });

    // 5. Uniform scale
    it("reconstructs uniform scale", () => {
      const matrix = { a: 1.5, b: 0, c: 0, d: 1.5, e: 0, f: 0 };
      const origin = { x: 50, y: 50 };
      // Centered scale of 100x100 at (100, 100) -> visual size 150x150, min x = 100 - 25 = 75
      const visualRect = { x: 75, y: 75, width: 150, height: 150 };
      const result = reconstructBaseBounds(visualRect, 100, 100, matrix, origin);
      expect(result.baseBounds.x).toBe(100);
      expect(result.baseBounds.y).toBe(100);
      expect(result.maxError).toBe(0);
    });

    // 6. Non-uniform scale
    it("reconstructs non-uniform scale", () => {
      const matrix = { a: 2, b: 0, c: 0, d: 0.5, e: 0, f: 0 };
      const origin = { x: 0, y: 0 }; // top-left
      const visualRect = { x: 50, y: 50, width: 200, height: 50 };
      const result = reconstructBaseBounds(visualRect, 100, 100, matrix, origin);
      expect(result.baseBounds.x).toBe(50);
      expect(result.baseBounds.y).toBe(50);
      expect(result.maxError).toBe(0);
    });

    // 7. Rotation + translation
    it("reconstructs rotation + translation", () => {
      const rad = (90 * Math.PI) / 180;
      const matrix = {
        a: round4(Math.cos(rad)),
        b: round4(Math.sin(rad)),
        c: round4(-Math.sin(rad)),
        d: round4(Math.cos(rad)),
        e: 20,
        f: 30,
      };
      const origin = { x: 50, y: 50 };
      // 90 deg around (50, 50) swaps width/height, keeps center at (250, 150), then translates +20, +30 -> center (270, 180)
      const visualRect = { x: 220, y: 130, width: 100, height: 100 };
      const result = reconstructBaseBounds(visualRect, 100, 100, matrix, origin);
      expect(result.baseBounds.x).toBe(200);
      expect(result.baseBounds.y).toBe(100);
    });
  });

  describe("Classification and warning rules", () => {
    it("classifies pure rotation without approximation warning", () => {
      const rad = (45 * Math.PI) / 180;
      const matrix = {
        a: Math.cos(rad),
        b: Math.sin(rad),
        c: -Math.sin(rad),
        d: Math.cos(rad),
        e: 0,
        f: 0,
      };
      const warnings = classifyTransform(matrix, false, 0);
      expect(warnings).toEqual([]);
    });

    it("classifies pure translation without approximation warning", () => {
      const matrix = { a: 1, b: 0, c: 0, d: 1, e: 50, f: 100 };
      const warnings = classifyTransform(matrix, false, 0);
      expect(warnings).toEqual([]);
    });

    it("classifies true 3D as TRANSFORM_3D_UNSUPPORTED", () => {
      const matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      const warnings = classifyTransform(matrix, true, 0);
      expect(warnings.some((w) => w.code === "TRANSFORM_3D_UNSUPPORTED")).toBe(true);
    });

    it("classifies reflection/mirroring as TRANSFORM_REFLECTION_UNSUPPORTED", () => {
      const matrix = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      const warnings = classifyTransform(matrix, false, 0);
      expect(warnings.some((w) => w.code === "TRANSFORM_REFLECTION_UNSUPPORTED")).toBe(true);
    });

    it("classifies skew as TRANSFORM_SKEW_APPROXIMATED", () => {
      // Skew along x: matrix(1, 0, 0.5, 1, 0, 0) -> dot product = 1*0.5 + 0*1 = 0.5 > 0
      const matrix = { a: 1, b: 0, c: 0.5, d: 1, e: 0, f: 0 };
      const warnings = classifyTransform(matrix, false, 0);
      expect(warnings.some((w) => w.code === "TRANSFORM_SKEW_APPROXIMATED")).toBe(true);
    });

    it("classifies non-uniform scale as TRANSFORM_SCALE_APPROXIMATED", () => {
      const matrix = { a: 2, b: 0, c: 0, d: 1, e: 0, f: 0 };
      const warnings = classifyTransform(matrix, false, 0);
      expect(warnings.some((w) => w.code === "TRANSFORM_SCALE_APPROXIMATED")).toBe(true);
    });
  });

  describe("processElementTransform integration", () => {
    it("combines style.translate and style.rotate and returns transform struct", () => {
      const style = {
        transform: "none",
        translate: "10px 20px",
        rotate: "90deg",
        scale: "none",
        transformOrigin: "50% 50%",
      };
      const visualRect = { x: 10, y: 20, width: 100, height: 100 };
      const res = processElementTransform(style, visualRect, 100, 100);
      expect(res.transform).toBeDefined();
      expect(res.transform?.matrix.b).toBe(1);
      expect(res.transform?.matrix.c).toBe(-1);
      expect(res.transform?.matrix.e).toBe(10);
      expect(res.transform?.matrix.f).toBe(20);
      expect(res.warnings).toEqual([]);
    });

    it("returns empty when transform is identity", () => {
      const style = {
        transform: "none",
        translate: "none",
        rotate: "none",
        scale: "none",
      };
      const visualRect = { x: 0, y: 0, width: 100, height: 100 };
      const res = processElementTransform(style, visualRect, 100, 100);
      expect(res.transform).toBeUndefined();
      expect(res.warnings).toEqual([]);
    });
  });
});
