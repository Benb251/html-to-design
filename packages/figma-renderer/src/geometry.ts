import type { DesignNode, Transform2D } from "@web2design/design-schema";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalculatedPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  relativeTransform?: [[number, number, number], [number, number, number]];
  scale?: { x: number; y: number };
  isReflection?: boolean;
  isSkew?: boolean;
  isNestedApproximated?: boolean;
}

function round4(val: number): number {
  const rounded = Math.round(val * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Calculates parent-local coordinates for a child node given its absolute
 * document-origin coordinates and its parent's absolute document-origin coordinates.
 *
 * localX = child.absoluteX - parent.absoluteX
 * localY = child.absoluteY - parent.absoluteY
 */
export function calculateLocalCoordinates(child: Point, parent: Point): Point {
  return {
    x: round4(child.x - parent.x),
    y: round4(child.y - parent.y),
  };
}

/**
 * Calculates root frame canvas placement centered around the current Figma viewport center,
 * rounded to integers for crisp canvas pixels.
 */
export function calculateRootPlacement(
  rootDimensions: { width: number; height: number },
  viewportCenter?: Point | undefined,
): Point {
  const center = viewportCenter ?? { x: 0, y: 0 };
  return {
    x: Math.round(center.x - rootDimensions.width / 2),
    y: Math.round(center.y - rootDimensions.height / 2),
  };
}

/**
 * Converts CSS clockwise angle degrees into Figma's native rotation degrees in [-180, 180].
 * In CSS, positive angle rotates clockwise.
 * In Figma, relativeTransform rotation is defined as Math.atan2(-m10, m00) * 180 / Math.PI.
 * Clockwise rotation corresponds to -degrees in Figma's rotation property.
 */
export function cssAngleToFigmaRotation(cssDegrees: number): number {
  let norm = (-cssDegrees) % 360;
  if (norm > 180) norm -= 360;
  if (norm <= -180) norm += 360;
  const rounded = Math.round(norm * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Inverts a 2D affine transformation on a point (tx, ty) with given matrix and origin.
 */
export function invert2DPoint(
  matrix: Transform2D["matrix"],
  origin: Transform2D["origin"],
  tx: number,
  ty: number,
): Point | null {
  const { a, b, c, d, e, f } = matrix;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-6) return null;

  const X = tx - origin.x - e;
  const Y = ty - origin.y - f;

  const lx = origin.x + (d * X - c * Y) / det;
  const ly = origin.y + (-b * X + a * Y) / det;

  return { x: round4(lx), y: round4(ly) };
}

/**
 * Calculates transform-aware placement for a node relative to its parent.
 */
export function calculateNodePlacement(
  child: DesignNode,
  parent: DesignNode,
  explicitChildTransform?: Transform2D,
  explicitParentTransform?: Transform2D,
  parentLayoutOffset?: { x: number; y: number },
): CalculatedPlacement {
  const childTransform = explicitChildTransform !== undefined ? explicitChildTransform : child.transform;
  const parentTransform = explicitParentTransform !== undefined ? explicitParentTransform : parent.transform;

  // Fast path: Neither child nor parent is transformed
  if (!childTransform && !parentTransform) {
    return {
      x: round4(child.x - parent.x),
      y: round4(child.y - parent.y),
      width: round4(child.width),
      height: round4(child.height),
    };
  }

  // Case 1: Child is transformed, parent is NOT transformed
  if (childTransform && !parentTransform) {
    const baseBounds = childTransform.baseBounds;
    const origin = childTransform.origin;
    const { a, b, c, d, e, f } = childTransform.matrix;

    const baseX = baseBounds.x - parent.x;
    const baseY = baseBounds.y - parent.y;

    // Transform origin compensation:
    // When relativeTransform is applied, point (0, 0) in the node's untransformed box
    // maps to (m02, m12) in the parent's coordinate space.
    const m02 = baseX + origin.x - a * origin.x - c * origin.y + e;
    const m12 = baseY + origin.y - b * origin.x - d * origin.y + f;

    const sx = Math.sqrt(a * a + b * b);
    const sy = Math.sqrt(c * c + d * d);

    // Normalize matrix axes to unit vectors for relativeTransform
    const u00 = sx > 1e-4 ? a / sx : a;
    const u01 = sy > 1e-4 ? c / sy : c;
    const u10 = sx > 1e-4 ? b / sx : b;
    const u11 = sy > 1e-4 ? d / sy : d;

    const rotDeg = Math.atan2(-u10, u00) * (180 / Math.PI);
    const roundedRot = round4(rotDeg);
    const det = a * d - b * c;
    const isReflection = det < -1e-4;
    const dot = a * c + b * d;
    const isSkew = Math.abs(dot) > 1e-3;

    return {
      x: round4(m02),
      y: round4(m12),
      width: round4(baseBounds.width),
      height: round4(baseBounds.height),
      rotation: Object.is(roundedRot, -0) ? 0 : roundedRot,
      relativeTransform: [
        [round4(u00), round4(u01), round4(m02)],
        [round4(u10), round4(u11), round4(m12)],
      ],
      scale: { x: round4(sx), y: round4(sy) },
      isReflection,
      isSkew,
    };
  }

  // Case 2: Parent IS transformed
  const parentBase = parentTransform!.baseBounds;

  if (childTransform) {
    // Both parent and child are transformed (nested transforms)
    const baseBounds = childTransform.baseBounds;
    const origin = childTransform.origin;
    const { a, b, c, d, e, f } = childTransform.matrix;

    // In untransformed layout space:
    const baseX = baseBounds.x - parentBase.x;
    const baseY = baseBounds.y - parentBase.y;

    const m02 = baseX + origin.x - a * origin.x - c * origin.y + e;
    const m12 = baseY + origin.y - b * origin.x - d * origin.y + f;

    const sx = Math.sqrt(a * a + b * b);
    const sy = Math.sqrt(c * c + d * d);

    const u00 = sx > 1e-4 ? a / sx : a;
    const u01 = sy > 1e-4 ? c / sy : c;
    const u10 = sx > 1e-4 ? b / sx : b;
    const u11 = sy > 1e-4 ? d / sy : d;

    const rotDeg = Math.atan2(-u10, u00) * (180 / Math.PI);
    const roundedRot = round4(rotDeg);
    const det = a * d - b * c;
    const isReflection = det < -1e-4;
    const dot = a * c + b * d;
    const isSkew = Math.abs(dot) > 1e-3;

    return {
      x: round4(m02),
      y: round4(m12),
      width: round4(baseBounds.width),
      height: round4(baseBounds.height),
      rotation: Object.is(roundedRot, -0) ? 0 : roundedRot,
      relativeTransform: [
        [round4(u00), round4(u01), round4(m02)],
        [round4(u10), round4(u11), round4(m12)],
      ],
      scale: { x: round4(sx), y: round4(sy) },
      isReflection,
      isSkew,
      isNestedApproximated: true,
    };
  } else {
    // Parent is transformed, child is NOT transformed
    // Child was rotated/transformed by parent in browser rendered output.
    // Invert the parent's transform at the child's bounding-box center to find
    // its exact untransformed position inside the parent frame.
    const childCenterX = child.x + child.width / 2;
    const childCenterY = child.y + child.height / 2;

    const invertedCenter = invert2DPoint(
      parentTransform!.matrix,
      parentTransform!.origin,
      childCenterX - parentBase.x,
      childCenterY - parentBase.y,
    );

    const { a, b, c, d } = parentTransform!.matrix;
    const sx = Math.hypot(a, b);
    const sy = Math.hypot(c, d);
    const cosT = sx > 1e-4 ? Math.abs(a) / sx : 1;
    const sinT = sx > 1e-4 ? Math.abs(b) / sx : 0;
    const det = cosT * cosT - sinT * sinT;

    let localW = round4(child.width / (sx > 1e-4 ? sx : 1));
    let localH = round4(child.height / (sy > 1e-4 ? sy : 1));
    let isNestedApproximated = false;

    if (Math.abs(det) > 0.05) {
      const W = (cosT * child.width - sinT * child.height) / det / (sx > 1e-4 ? sx : 1);
      const H = (-sinT * child.width + cosT * child.height) / det / (sy > 1e-4 ? sy : 1);
      if (W > 0.1 && H > 0.1) {
        localW = round4(W);
        localH = round4(H);
      } else {
        isNestedApproximated = true;
      }
    } else {
      isNestedApproximated = true;
    }

    const offX = parentLayoutOffset?.x ?? 0;
    const offY = parentLayoutOffset?.y ?? 0;

    const localX = invertedCenter
      ? round4(invertedCenter.x - localW / 2 - offX)
      : round4(child.x - parentBase.x - offX);
    const localY = invertedCenter
      ? round4(invertedCenter.y - localH / 2 - offY)
      : round4(child.y - parentBase.y - offY);

    return {
      x: localX,
      y: localY,
      width: localW,
      height: localH,
      ...(isNestedApproximated ? { isNestedApproximated: true } : {}),
    };
  }
}
