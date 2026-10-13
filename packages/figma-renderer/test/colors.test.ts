import { describe, expect, it } from "vitest";
import { toFigmaFills, toFigmaRgb, toFigmaRgba, toFigmaSolidPaint } from "../src/colors.js";

describe("figma-renderer - colors", () => {
  it("converts opaque color correctly", () => {
    const color = { r: 0.2, g: 0.4, b: 0.6, a: 1 };
    expect(toFigmaRgb(color)).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
    expect(toFigmaRgba(color)).toEqual({ r: 0.2, g: 0.4, b: 0.6, a: 1 });

    const paint = toFigmaSolidPaint(color);
    expect(paint).toEqual({
      type: "SOLID",
      color: { r: 0.2, g: 0.4, b: 0.6 },
      opacity: 1,
    });
  });

  it("converts semi-transparent color keeping alpha separate from node opacity", () => {
    const color = { r: 1, g: 0, b: 0, a: 0.5 };
    expect(toFigmaRgb(color)).toEqual({ r: 1, g: 0, b: 0 });
    expect(toFigmaRgba(color)).toEqual({ r: 1, g: 0, b: 0, a: 0.5 });

    const paint = toFigmaSolidPaint(color);
    expect(paint.opacity).toBe(0.5);
    expect(paint.color).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("clamps out-of-range color values between 0 and 1", () => {
    const color = { r: -0.5, g: 1.5, b: 0.5, a: 2 };
    expect(toFigmaRgb(color)).toEqual({ r: 0, g: 1, b: 0.5 });
    expect(toFigmaRgba(color)).toEqual({ r: 0, g: 1, b: 0.5, a: 1 });
  });

  it("converts multiple fills reversing CSS top-to-bottom order to Figma bottom-to-top paint order", () => {
    const fills = [
      { type: "solid" as const, color: { r: 1, g: 1, b: 1, a: 1 } },
      { type: "solid" as const, color: { r: 0, g: 0, b: 0, a: 0.8 } },
    ];
    const figmaFills = toFigmaFills(fills);
    expect(figmaFills.length).toBe(2);
    expect(figmaFills[0]!.type).toBe("SOLID");
    expect(figmaFills[0]!.opacity).toBe(0.8);
    expect(figmaFills[1]!.opacity).toBe(1);
  });

  it("returns empty array for undefined or empty fills", () => {
    expect(toFigmaFills(undefined)).toEqual([]);
    expect(toFigmaFills([])).toEqual([]);
  });
});
