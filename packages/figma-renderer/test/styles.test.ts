import { describe, expect, it } from "vitest";
import { applyVisualStyle, type StyleableNode } from "../src/styles.js";
import { WarningCollector } from "../src/warnings.js";

function createMockNode(): StyleableNode {
  return {
    opacity: 1,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    effects: [],
  };
}

describe("figma-renderer - styles", () => {
  it("applies fills and local opacity", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = {
      fills: [{ type: "solid" as const, color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }],
    };

    applyVisualStyle(node, style, 0.75, warnings, "test-node");

    expect(node.opacity).toBe(0.75);
    const fills = node.fills as readonly Paint[];
    expect(fills.length).toBe(1);
    expect(fills[0]!.type).toBe("SOLID");
    expect(warnings.getWarnings().length).toBe(0);
  });

  it("clears default styles if style is undefined", () => {
    const node = createMockNode();
    node.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    const warnings = new WarningCollector();

    applyVisualStyle(node, undefined, 1, warnings, "test-node");

    expect(node.fills).toEqual([]);
    expect(node.strokes).toEqual([]);
    expect(node.strokeWeight).toBe(0);
    expect(node.effects).toEqual([]);
  });

  it("applies uniform solid border", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = {
      border: {
        width: 2,
        style: "solid" as const,
        color: { r: 0, g: 0, b: 0, a: 1 },
      },
    };

    applyVisualStyle(node, style, 1, warnings, "test-node");

    expect(node.strokeWeight).toBe(2);
    expect(node.strokes.length).toBe(1);
    expect(node.strokes[0]!.type).toBe("SOLID");
    expect(warnings.getWarnings().length).toBe(0);
  });

  it("warns when border style is non-solid and renders as solid stroke", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = {
      border: {
        width: 1,
        style: "dashed" as const,
        color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
      },
    };

    applyVisualStyle(node, style, 1, warnings, "test-node");

    expect(node.strokeWeight).toBe(1);
    expect(warnings.getWarnings().some((w) => w.code === "BORDER_STYLE_APPROXIMATED")).toBe(true);
  });

  it("applies numeric uniform corner radius", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = { cornerRadius: 16 };

    applyVisualStyle(node, style, 1, warnings, "test-node");

    expect(node.cornerRadius).toBe(16);
  });

  it("applies per-corner radius when corners are asymmetric", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = {
      cornerRadius: {
        topLeft: 12,
        topRight: 8,
        bottomRight: 4,
        bottomLeft: 0,
      },
    };

    applyVisualStyle(node, style, 1, warnings, "test-node");

    expect(node.topLeftRadius).toBe(12);
    expect(node.topRightRadius).toBe(8);
    expect(node.bottomRightRadius).toBe(4);
    expect(node.bottomLeftRadius).toBe(0);
  });

  it("simplifies per-corner radius to uniform when all four corners match", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = {
      cornerRadius: {
        topLeft: 10,
        topRight: 10,
        bottomRight: 10,
        bottomLeft: 10,
      },
    };

    applyVisualStyle(node, style, 1, warnings, "test-node");

    expect(node.cornerRadius).toBe(10);
  });

  it("applies outer DROP_SHADOW effect", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = {
      boxShadows: [
        {
          offsetX: 0,
          offsetY: 4,
          blurRadius: 12,
          spreadRadius: 2,
          color: { r: 0, g: 0, b: 0, a: 0.15 },
          inset: false,
        },
      ],
    };

    applyVisualStyle(node, style, 1, warnings, "test-node");

    expect(node.effects.length).toBe(1);
    const effect = node.effects[0]! as DropShadowEffect;
    expect(effect.type).toBe("DROP_SHADOW");
    expect(effect.offset).toEqual({ x: 0, y: 4 });
    expect(effect.radius).toBe(12);
    expect(effect.spread).toBe(2);
    expect(effect.color).toEqual({ r: 0, g: 0, b: 0, a: 0.15 });
  });

  it("warns and omits inset box shadows", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = {
      boxShadows: [
        {
          offsetX: 0,
          offsetY: 2,
          blurRadius: 4,
          spreadRadius: 0,
          color: { r: 0, g: 0, b: 0, a: 0.2 },
          inset: true,
        },
      ],
    };

    applyVisualStyle(node, style, 1, warnings, "test-node");

    expect(node.effects.length).toBe(0);
    expect(warnings.getWarnings().some((w) => w.code === "BOX_SHADOW_INSET_UNSUPPORTED")).toBe(true);
  });

  it("warns when multiple box shadows are present and renders only the first", () => {
    const node = createMockNode();
    const warnings = new WarningCollector();
    const style = {
      boxShadows: [
        {
          offsetX: 0,
          offsetY: 2,
          blurRadius: 4,
          spreadRadius: 0,
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          inset: false,
        },
        {
          offsetX: 0,
          offsetY: 8,
          blurRadius: 16,
          spreadRadius: 0,
          color: { r: 0, g: 0, b: 0, a: 0.05 },
          inset: false,
        },
      ],
    };

    applyVisualStyle(node, style, 1, warnings, "test-node");

    expect(node.effects.length).toBe(1);
    expect(warnings.getWarnings().some((w) => w.code === "MULTIPLE_BOX_SHADOWS_APPROXIMATED")).toBe(true);
  });
});
