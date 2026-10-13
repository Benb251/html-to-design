/// <reference types="@figma/plugin-typings" />
import type { Color, SolidFill } from "@web2design/design-schema";

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

export function toFigmaFills(fills?: readonly SolidFill[] | undefined): SolidPaint[] {
  if (!fills || fills.length === 0) {
    return [];
  }
  return fills.map((f) => toFigmaSolidPaint(f.color));
}
