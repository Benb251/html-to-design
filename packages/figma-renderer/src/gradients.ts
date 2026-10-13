/// <reference types="@figma/plugin-typings" />
import type {
  GradientStop,
  LinearGradientFill,
  RadialGradientFill,
} from "@web2design/design-schema";

export interface NodeBounds {
  width: number;
  height: number;
}

function round4(val: number): number {
  const rounded = Math.round(val * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function toFigmaColorStops(stops: readonly GradientStop[]): ColorStop[] {
  return stops.map((s) => ({
    position: round4(Math.max(0, Math.min(1, s.position))),
    color: {
      r: round4(Math.max(0, Math.min(1, s.color.r))),
      g: round4(Math.max(0, Math.min(1, s.color.g))),
      b: round4(Math.max(0, Math.min(1, s.color.b))),
      a: round4(Math.max(0, Math.min(1, s.color.a))),
    },
  }));
}

/**
 * Calculates Figma gradientTransform for GRADIENT_LINEAR accounting for CSS angle
 * semantics and non-square box geometry.
 *
 * In CSS, angle alpha is measured clockwise from 12 o'clock (0deg = up).
 * Direction vector in screen coords: D = (sin(alpha), -cos(alpha)).
 * Gradient line length: L = |W * sin(alpha)| + |H * cos(alpha)|.
 * Normalized start point sx, sy and end point ex, ey are mapped to Figma's
 * unit coordinate system [0, 1] x [0, 1].
 */
export function calculateLinearGradientTransform(
  angleDeg: number,
  bounds: NodeBounds,
): Transform {
  const w = Math.max(0.01, bounds.width);
  const h = Math.max(0.01, bounds.height);
  const alpha = (angleDeg * Math.PI) / 180;

  const sinA = Math.sin(alpha);
  const cosA = Math.cos(alpha);

  // Gradient line length in pixels
  const L = Math.abs(w * sinA) + Math.abs(h * cosA);

  // Normalized start point
  const sx = 0.5 - (L * sinA) / (2 * w);
  const sy = 0.5 + (L * cosA) / (2 * h);

  // Normalized end point
  const ex = 0.5 + (L * sinA) / (2 * w);
  const ey = 0.5 - (L * cosA) / (2 * h);

  // Vector from start to end in normalized unit space
  const a = ex - sx;
  const b = ey - sy;
  const tx = sx;
  const ty = sy;

  // Orthogonal vector for Figma 2x3 affine matrix
  const c = -b;
  const d = a;

  return [
    [round4(a), round4(c), round4(tx)],
    [round4(b), round4(d), round4(ty)],
  ];
}

/**
 * Calculates Figma gradientTransform for GRADIENT_RADIAL.
 * Maps normalized center (cx, cy) and radii (rx, ry) to Figma unit space.
 */
export function calculateRadialGradientTransform(
  fill: RadialGradientFill,
): Transform {
  const cx = fill.center.x;
  const cy = fill.center.y;
  const rx = fill.radius.x;
  const ry = fill.radius.y;

  return [
    [round4(rx), 0, round4(cx)],
    [0, round4(ry), round4(cy)],
  ];
}

export function toFigmaLinearGradientPaint(
  fill: LinearGradientFill,
  bounds: NodeBounds,
): GradientPaint {
  return {
    type: "GRADIENT_LINEAR",
    gradientTransform: calculateLinearGradientTransform(fill.angle, bounds),
    gradientStops: toFigmaColorStops(fill.stops),
    opacity: 1,
  };
}

export function toFigmaRadialGradientPaint(
  fill: RadialGradientFill,
): GradientPaint {
  return {
    type: "GRADIENT_RADIAL",
    gradientTransform: calculateRadialGradientTransform(fill),
    gradientStops: toFigmaColorStops(fill.stops),
    opacity: 1,
  };
}
