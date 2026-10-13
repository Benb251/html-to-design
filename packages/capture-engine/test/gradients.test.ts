import { describe, expect, it, vi } from "vitest";
import type { LinearGradientFill, SolidFill } from "@web2design/design-schema";
import {
  parseBackgroundGradientLayers,
  parseLinearGradient,
  parseRadialGradient,
  splitBackgroundLayers,
} from "../src/gradients.js";
import { visualStyle } from "../src/styles.js";

describe("CSS Gradient Parser & Layer Tokenizer (W2D-012)", () => {
  describe("splitBackgroundLayers", () => {
    it("splits only at top-level commas outside parentheses and quotes", () => {
      const input = "linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255)), radial-gradient(circle, red, blue)";
      const layers = splitBackgroundLayers(input);
      expect(layers).toHaveLength(2);
      expect(layers[0]).toBe("linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))");
      expect(layers[1]).toBe("radial-gradient(circle, red, blue)");
    });

    it("handles quotes and nested commas properly", () => {
      const input = "url('https://example.com/img,with,commas.png'), linear-gradient(rgb(1, 2, 3), #fff)";
      const layers = splitBackgroundLayers(input);
      expect(layers).toHaveLength(2);
      expect(layers[0]).toBe("url('https://example.com/img,with,commas.png')");
      expect(layers[1]).toBe("linear-gradient(rgb(1, 2, 3), #fff)");
    });

    it("handles single layer cleanly", () => {
      expect(splitBackgroundLayers("linear-gradient(red, blue)")).toEqual(["linear-gradient(red, blue)"]);
    });
  });

  describe("Linear Gradient parsing", () => {
    it("supports default direction (to bottom = 180deg)", () => {
      const warn = vi.fn();
      const result = parseLinearGradient("rgb(255, 0, 0), rgb(0, 0, 255)", undefined, warn);
      expect(result).toBeDefined();
      expect(result?.angle).toBe(180);
      expect(result?.stops).toHaveLength(2);
      expect(result?.stops[0]).toEqual({ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } });
      expect(result?.stops[1]).toEqual({ position: 1, color: { r: 0, g: 0, b: 1, a: 1 } });
    });

    it("supports all cardinal direction keywords", () => {
      const warn = vi.fn();
      expect(parseLinearGradient("to top, red, blue", undefined, warn)?.angle).toBe(0);
      expect(parseLinearGradient("to right, red, blue", undefined, warn)?.angle).toBe(90);
      expect(parseLinearGradient("to bottom, red, blue", undefined, warn)?.angle).toBe(180);
      expect(parseLinearGradient("to left, red, blue", undefined, warn)?.angle).toBe(270);
    });

    it("supports diagonal direction keywords on square and rectangular boxes", () => {
      const warn = vi.fn();
      // Square box: atan2(100, 100) = 45deg
      const sq = { width: 100, height: 100 };
      expect(parseLinearGradient("to top right, red, blue", sq, warn)?.angle).toBe(45);
      expect(parseLinearGradient("to bottom right, red, blue", sq, warn)?.angle).toBe(135);
      expect(parseLinearGradient("to bottom left, red, blue", sq, warn)?.angle).toBe(225);
      expect(parseLinearGradient("to top left, red, blue", sq, warn)?.angle).toBe(315);

      // Landscape box: 300x100 -> atan2(300, 100) ~ 71.565deg
      const landscape = { width: 300, height: 100 };
      const landAngle = parseLinearGradient("to top right, red, blue", landscape, warn)?.angle;
      expect(landAngle).toBeCloseTo(71.565, 2);

      // Portrait box: 100x300 -> atan2(100, 300) ~ 18.435deg
      const portrait = { width: 100, height: 300 };
      const portAngle = parseLinearGradient("to top right, red, blue", portrait, warn)?.angle;
      expect(portAngle).toBeCloseTo(18.435, 2);
    });

    it("supports arbitrary CSS angles and normalizes to [0, 360)", () => {
      const warn = vi.fn();
      expect(parseLinearGradient("0deg, red, blue", undefined, warn)?.angle).toBe(0);
      expect(parseLinearGradient("45deg, red, blue", undefined, warn)?.angle).toBe(45);
      expect(parseLinearGradient("90deg, red, blue", undefined, warn)?.angle).toBe(90);
      expect(parseLinearGradient("180deg, red, blue", undefined, warn)?.angle).toBe(180);
      expect(parseLinearGradient("270deg, red, blue", undefined, warn)?.angle).toBe(270);
      expect(parseLinearGradient("360deg, red, blue", undefined, warn)?.angle).toBe(0);
      expect(parseLinearGradient("-45deg, red, blue", undefined, warn)?.angle).toBe(315);
      expect(parseLinearGradient("0.5turn, red, blue", undefined, warn)?.angle).toBe(180);
      expect(parseLinearGradient("100grad, red, blue", undefined, warn)?.angle).toBe(90);
    });

    it("supports multi-stop gradients with implicit and explicit positions", () => {
      const warn = vi.fn();
      // 3 stops with missing middle position -> 0, 0.5, 1
      const res3 = parseLinearGradient("red, green, blue", undefined, warn);
      expect(res3?.stops).toHaveLength(3);
      expect(res3?.stops[0]?.position).toBe(0);
      expect(res3?.stops[1]?.position).toBe(0.5);
      expect(res3?.stops[2]?.position).toBe(1);

      // Explicit outer stops, implicit middle
      const res4 = parseLinearGradient("red 20%, green, blue 80%", undefined, warn);
      expect(res4?.stops[0]?.position).toBe(0.2);
      expect(res4?.stops[1]?.position).toBe(0.5);
      expect(res4?.stops[2]?.position).toBe(0.8);
    });

    it("supports alpha stops without losing alpha channel", () => {
      const warn = vi.fn();
      const res = parseLinearGradient("rgba(255, 0, 0, 0.5), rgba(0, 0, 255, 0.25)", undefined, warn);
      expect(res?.stops[0]?.color.a).toBe(0.5);
      expect(res?.stops[1]?.color.a).toBe(0.25);
    });

    it("preserves hard stops (equal positions)", () => {
      const warn = vi.fn();
      const res = parseLinearGradient("red 0%, red 50%, blue 50%, blue 100%", undefined, warn);
      expect(res?.stops).toHaveLength(4);
      expect(res?.stops[1]?.position).toBe(0.5);
      expect(res?.stops[2]?.position).toBe(0.5);
      expect(res?.stops[1]?.color).toEqual({ r: 1, g: 0, b: 0, a: 1 });
      expect(res?.stops[2]?.color).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    });

    it("supports multi-position stops (e.g. orange 10% 30%)", () => {
      const warn = vi.fn();
      const res = parseLinearGradient("red 0%, orange 10% 30%, blue 100%", undefined, warn);
      expect(res?.stops).toHaveLength(4);
      expect(res?.stops[1]?.position).toBe(0.1);
      expect(res?.stops[2]?.position).toBe(0.3);
    });

    it("approximates color hints with a warning", () => {
      const warn = vi.fn();
      const res = parseLinearGradient("red 10%, 30%, blue 90%", undefined, warn);
      expect(res?.stops).toHaveLength(2);
      expect(warn).toHaveBeenCalledWith("GRADIENT_COLOR_HINT_APPROXIMATED", expect.any(String));
    });

    it("approximates modern color interpolation keywords with a warning", () => {
      const warn = vi.fn();
      const res = parseLinearGradient("in oklab to right, red, blue", undefined, warn);
      expect(res?.stops).toHaveLength(2);
      expect(warn).toHaveBeenCalledWith("GRADIENT_INTERPOLATION_APPROXIMATED", expect.any(String));
    });
  });

  describe("Radial Gradient parsing", () => {
    it("supports basic radial-gradient with default center and ellipse shape", () => {
      const warn = vi.fn();
      const res = parseRadialGradient("red, blue", { width: 200, height: 100 }, warn);
      expect(res).toBeDefined();
      expect(res?.center).toEqual({ x: 0.5, y: 0.5 });
      expect(res?.shape).toBe("ellipse");
      expect(res?.stops).toHaveLength(2);
    });

    it("supports circle shape keyword", () => {
      const warn = vi.fn();
      const res = parseRadialGradient("circle, red, blue", { width: 200, height: 100 }, warn);
      expect(res?.shape).toBe("circle");
    });

    it("supports positioned center keywords and percentages", () => {
      const warn = vi.fn();
      const res1 = parseRadialGradient("circle at 25% 75%, red, blue", { width: 100, height: 100 }, warn);
      expect(res1?.center).toEqual({ x: 0.25, y: 0.75 });

      const res2 = parseRadialGradient("at left top, red, blue", { width: 100, height: 100 }, warn);
      expect(res2?.center).toEqual({ x: 0, y: 0 });

      const res3 = parseRadialGradient("circle at right bottom, red, blue", { width: 100, height: 100 }, warn);
      expect(res3?.center).toEqual({ x: 1, y: 1 });
    });
  });

  describe("Unsupported background images & gradient warnings", () => {
    it("emits GRADIENT_TYPE_UNSUPPORTED for repeating gradients", () => {
      const warn = vi.fn();
      parseBackgroundGradientLayers("repeating-linear-gradient(red, blue 20px)", undefined, warn);
      expect(warn).toHaveBeenCalledWith("GRADIENT_TYPE_UNSUPPORTED", expect.stringContaining("Repeating gradients"));
    });

    it("emits GRADIENT_TYPE_UNSUPPORTED for conic gradients", () => {
      const warn = vi.fn();
      parseBackgroundGradientLayers("conic-gradient(red, yellow, green)", undefined, warn);
      expect(warn).toHaveBeenCalledWith("GRADIENT_TYPE_UNSUPPORTED", expect.stringContaining("Conic gradients"));
    });

    it("emits BACKGROUND_IMAGE_UNSUPPORTED for remote url(...) images", () => {
      const warn = vi.fn();
      parseBackgroundGradientLayers("url('https://example.com/bg.png')", undefined, warn);
      expect(warn).toHaveBeenCalledWith("BACKGROUND_IMAGE_UNSUPPORTED", expect.any(String));
    });
  });

  describe("visualStyle gradient and background layer integration", () => {
    function mockStyle(overrides: Partial<CSSStyleDeclaration> = {}): CSSStyleDeclaration {
      return {
        backgroundColor: "transparent",
        backgroundImage: "none",
        borderTopWidth: "0px",
        borderRightWidth: "0px",
        borderBottomWidth: "0px",
        borderLeftWidth: "0px",
        borderTopStyle: "none",
        borderRightStyle: "none",
        borderBottomStyle: "none",
        borderLeftStyle: "none",
        borderTopColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: "transparent",
        borderLeftColor: "transparent",
        borderTopLeftRadius: "0px",
        borderTopRightRadius: "0px",
        borderBottomRightRadius: "0px",
        borderBottomLeftRadius: "0px",
        boxShadow: "none",
        ...overrides,
      } as unknown as CSSStyleDeclaration;
    }

    it("captures linear gradient fill onto VisualStyle", () => {
      const warn = vi.fn();
      const vs = visualStyle(
        mockStyle({ backgroundImage: "linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))" }),
        warn,
      );
      expect(vs.fills).toHaveLength(1);
      expect(vs.fills?.[0]?.type).toBe("linear-gradient");
      expect((vs.fills?.[0] as LinearGradientFill)?.angle).toBe(90);
    });

    it("captures gradient over solid background color preserving top-to-bottom order", () => {
      const warn = vi.fn();
      const vs = visualStyle(
        mockStyle({
          backgroundImage: "linear-gradient(to bottom, rgba(255, 0, 0, 0.5), rgba(0, 0, 255, 0.5))",
          backgroundColor: "rgb(20, 20, 20)",
        }),
        warn,
      );
      expect(vs.fills).toHaveLength(2);
      expect(vs.fills?.[0]?.type).toBe("linear-gradient");
      expect(vs.fills?.[1]?.type).toBe("solid");
      expect((vs.fills?.[1] as SolidFill)?.color).toEqual({ r: 20 / 255, g: 20 / 255, b: 20 / 255, a: 1 });
    });

    it("emits GRADIENT_TEXT_UNSUPPORTED when background-clip: text is present", () => {
      const warn = vi.fn();
      const vs = visualStyle(
        mockStyle({
          backgroundImage: "linear-gradient(red, blue)",
          backgroundClip: "text",
        }),
        warn,
      );
      expect(warn).toHaveBeenCalledWith("GRADIENT_TEXT_UNSUPPORTED", expect.any(String));
      expect(vs.fills).toBeUndefined();
    });
  });
});
