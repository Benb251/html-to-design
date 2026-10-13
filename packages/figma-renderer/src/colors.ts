/// <reference types="@figma/plugin-typings" />
import type { Color, Fill } from "@web2design/design-schema";
import {
  toFigmaLinearGradientPaint,
  toFigmaRadialGradientPaint,
  type NodeBounds,
} from "./gradients.js";

export function toFigmaRgb(color: Color): RGB {
  return {
    r: Math.max(0, Math.min(1, color.r)),
    g: Math.max(0, Math.min(1, color.g)),
    b: Math.max(0, Math.min(1, color.b)),
  };
}

export function toFigmaRgba(color: Color): RGBA {
  return {
    r: Math.max(0, Math.min(1, color.r)),
    g: Math.max(0, Math.min(1, color.g)),
    b: Math.max(0, Math.min(1, color.b)),
    a: Math.max(0, Math.min(1, color.a)),
  };
}

export function toFigmaSolidPaint(color: Color): SolidPaint {
  return {
    type: "SOLID",
    color: toFigmaRgb(color),
    opacity: Math.max(0, Math.min(1, color.a)),
  };
}

export function toFigmaPaint(fill: Fill, bounds: NodeBounds): Paint {
  switch (fill.type) {
    case "solid":
      return toFigmaSolidPaint(fill.color);
    case "linear-gradient":
      return toFigmaLinearGradientPaint(fill, bounds);
    case "radial-gradient":
      return toFigmaRadialGradientPaint(fill);
  }
}

/**
 * Converts Design Schema fills to Figma Paint array.
 * Note on ordering:
 * In CSS, background-image (gradients) is layered ON TOP OF background-color (solid).
 * In Figma Plugin API, fills[0] is rendered on the bottom, and fills[length - 1] is on top.
 * Therefore, we map CSS top-to-bottom schema fills by reversing them into Figma's bottom-to-top order
 * so that solid background colors stay underneath gradient layers.
 */
export function toFigmaFills(
  fills?: readonly Fill[] | undefined,
  bounds: NodeBounds = { width: 100, height: 100 },
): Paint[] {
  if (!fills || fills.length === 0) {
    return [];
  }
  return [...fills].reverse().map((f) => toFigmaPaint(f, bounds));
}
