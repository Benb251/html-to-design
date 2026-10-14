// packages/capture-engine/src/transform.ts
// CSS 2D Transform parsing, geometry reconstruction and classification for Web2Design V0.5.

import type { Transform2D } from "@web2design/design-schema";
import type { Rect } from "./geometry.js";

export interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface TransformOrigin {
  x: number;
  y: number;
}

export interface ParsedTransformResult {
  matrix: Matrix2D;
  origin: TransformOrigin;
  baseBounds: Rect;
  isIdentity: boolean;
  is3D: boolean;
  warningsToEmit: Array<{ code: string; message: string }>;
}

export function round4(val: number): number {
  const rounded = Math.round(val * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Multiplies two 2D affine matrices: M = m1 * m2
 * [ a1 c1 e1 ]   [ a2 c2 e2 ]   [ a1*a2+c1*b2  a1*c2+c1*d2  a1*e2+c1*f2+e1 ]
 * [ b1 d1 f1 ] * [ b2 d2 f2 ] = [ b1*a2+d1*b2  b1*c2+d1*d2  b1*e2+d1*f2+f1 ]
 * [ 0  0  1  ]   [ 0  0  1  ]   [ 0            0            1              ]
 */
export function multiplyMatrix2D(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return {
    a: round4(m1.a * m2.a + m1.c * m2.b),
    b: round4(m1.b * m2.a + m1.d * m2.b),
    c: round4(m1.a * m2.c + m1.c * m2.d),
    d: round4(m1.b * m2.c + m1.d * m2.d),
    e: round4(m1.a * m2.e + m1.c * m2.f + m1.e),
    f: round4(m1.b * m2.e + m1.d * m2.f + m1.f),
  };
}

export const IDENTITY_MATRIX_2D: Matrix2D = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

/**
 * Parses CSS angle strings (e.g. 45deg, 0.5rad, 100grad, 0.25turn) into radians.
 */
export function parseCssAngleToRad(str: string): number | null {
  const trimmed = str.trim().toLowerCase();
  const match = trimmed.match(/^([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*(deg|rad|grad|turn)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]!);
  if (!Number.isFinite(num)) return null;
  const unit = match[2] ?? "deg";
  switch (unit) {
    case "deg":
      return (num * Math.PI) / 180;
    case "rad":
      return num;
    case "grad":
      return (num * Math.PI) / 200;
    case "turn":
      return num * 2 * Math.PI;
    default:
      return (num * Math.PI) / 180;
  }
}

/**
 * Parses a length string (e.g. "10px", "0", "15.5px") or percentage relative to refLength into pixels.
 */
export function parseCssLengthOrPercent(
  val: string,
  refLength: number,
): number | null {
  const trimmed = val.trim().toLowerCase();
  if (trimmed === "0" || trimmed === "0px") return 0;
  if (trimmed.endsWith("%")) {
    const p = parseFloat(trimmed);
    return Number.isFinite(p) ? (p / 100) * refLength : null;
  }
  if (trimmed.endsWith("px")) {
    const px = parseFloat(trimmed);
    return Number.isFinite(px) ? px : null;
  }
  const bare = parseFloat(trimmed);
  return Number.isFinite(bare) ? bare : null;
}

/**
 * Resolves CSS transform-origin into CSS pixels relative to the untransformed border box.
 */
export function resolveTransformOrigin(
  rawOrigin: string | undefined,
  baseWidth: number,
  baseHeight: number,
): TransformOrigin {
  if (!rawOrigin || rawOrigin.trim() === "") {
    return { x: round4(baseWidth / 2), y: round4(baseHeight / 2) };
  }

  const parts = rawOrigin.trim().split(/\s+/);
  if (parts.length === 0) {
    return { x: round4(baseWidth / 2), y: round4(baseHeight / 2) };
  }

  const parseX = (part: string): number => {
    switch (part.toLowerCase()) {
      case "left":
        return 0;
      case "center":
        return baseWidth / 2;
      case "right":
        return baseWidth;
      default: {
        const val = parseCssLengthOrPercent(part, baseWidth);
        return val !== null ? val : baseWidth / 2;
      }
    }
  };

  const parseY = (part: string): number => {
    switch (part.toLowerCase()) {
      case "top":
        return 0;
      case "center":
        return baseHeight / 2;
      case "bottom":
        return baseHeight;
      default: {
        const val = parseCssLengthOrPercent(part, baseHeight);
        return val !== null ? val : baseHeight / 2;
      }
    }
  };

  let x = baseWidth / 2;
  let y = baseHeight / 2;

  if (parts.length === 1) {
    const p = parts[0]!;
    if (p === "top" || p === "bottom") {
      x = baseWidth / 2;
      y = parseY(p);
    } else {
      x = parseX(p);
      y = baseHeight / 2;
    }
  } else if (parts.length >= 2) {
    const p0 = parts[0]!;
    const p1 = parts[1]!;
    if (p0 === "top" || p0 === "bottom" || p1 === "left" || p1 === "right") {
      y = parseY(p0);
      x = parseX(p1);
    } else {
      x = parseX(p0);
      y = parseY(p1);
    }
  }

  return { x: round4(x), y: round4(y) };
}

/**
 * Pure parser for CSS transform strings: matrix(), matrix3d(), rotate(), translate(), scale(), skew().
 */
export function parseTransformStringFallback(
  transformStr: string,
  baseWidth: number = 0,
  baseHeight: number = 0,
): { matrix: Matrix2D; is3D: boolean } | null {
  const trimmed = transformStr.trim();
  if (!trimmed || trimmed === "none") {
    return { matrix: { ...IDENTITY_MATRIX_2D }, is3D: false };
  }

  // 1. Check matrix(...)
  if (trimmed.startsWith("matrix(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(7, -1).trim();
    const parts = inner.split(/[\s,]+/).map((s) => parseFloat(s));
    if (parts.length === 6 && parts.every((n) => Number.isFinite(n))) {
      return {
        matrix: {
          a: parts[0]!,
          b: parts[1]!,
          c: parts[2]!,
          d: parts[3]!,
          e: parts[4]!,
          f: parts[5]!,
        },
        is3D: false,
      };
    }
  }

  // 2. Check matrix3d(...)
  if (trimmed.startsWith("matrix3d(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(9, -1).trim();
    const parts = inner.split(/[\s,]+/).map((s) => parseFloat(s));
    if (parts.length === 16 && parts.every((n) => Number.isFinite(n))) {
      const isReducibleTo2D =
        Math.abs(parts[2]!) < 1e-4 &&
        Math.abs(parts[3]!) < 1e-4 &&
        Math.abs(parts[6]!) < 1e-4 &&
        Math.abs(parts[7]!) < 1e-4 &&
        Math.abs(parts[8]!) < 1e-4 &&
        Math.abs(parts[9]!) < 1e-4 &&
        Math.abs(parts[10]! - 1) < 1e-4 &&
        Math.abs(parts[11]!) < 1e-4 &&
        Math.abs(parts[14]!) < 1e-4 &&
        Math.abs(parts[15]! - 1) < 1e-4;

      return {
        matrix: {
          a: parts[0]!,
          b: parts[1]!,
          c: parts[4]!,
          d: parts[5]!,
          e: parts[12]!,
          f: parts[13]!,
        },
        is3D: !isReducibleTo2D,
      };
    }
  }

  // 3. Fallback parser for multiple CSS transform functions: fn(args)
  const fnRegex = /([a-zA-Z0-9]+)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  let current: Matrix2D = { ...IDENTITY_MATRIX_2D };
  let is3D = false;
  let matchedAny = false;

  while ((match = fnRegex.exec(trimmed)) !== null) {
    matchedAny = true;
    const name = match[1]!.toLowerCase();
    const args = match[2]!.trim().split(/[\s,]+/).filter(Boolean);

    switch (name) {
      case "rotate":
      case "rotatez": {
        const rad = args[0] ? parseCssAngleToRad(args[0]) : null;
        if (rad !== null) {
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          current = multiplyMatrix2D(current, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
        }
        break;
      }
      case "rotatex":
      case "rotatey":
      case "rotate3d":
      case "perspective": {
        is3D = true;
        break;
      }
      case "translate": {
        const tx = args[0] ? (parseCssLengthOrPercent(args[0], baseWidth) ?? 0) : 0;
        const ty = args[1] ? (parseCssLengthOrPercent(args[1], baseHeight) ?? 0) : 0;
        current = multiplyMatrix2D(current, { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
        break;
      }
      case "translatex": {
        const tx = args[0] ? (parseCssLengthOrPercent(args[0], baseWidth) ?? 0) : 0;
        current = multiplyMatrix2D(current, { a: 1, b: 0, c: 0, d: 1, e: tx, f: 0 });
        break;
      }
      case "translatey": {
        const ty = args[0] ? (parseCssLengthOrPercent(args[0], baseHeight) ?? 0) : 0;
        current = multiplyMatrix2D(current, { a: 1, b: 0, c: 0, d: 1, e: 0, f: ty });
        break;
      }
      case "translate3d":
      case "translatez": {
        is3D = true;
        break;
      }
      case "scale": {
        const sx = args[0] ? parseFloat(args[0]) : 1;
        const sy = args[1] ? parseFloat(args[1]) : sx;
        if (Number.isFinite(sx) && Number.isFinite(sy)) {
          current = multiplyMatrix2D(current, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
        }
        break;
      }
      case "scalex": {
        const sx = args[0] ? parseFloat(args[0]) : 1;
        if (Number.isFinite(sx)) {
          current = multiplyMatrix2D(current, { a: sx, b: 0, c: 0, d: 1, e: 0, f: 0 });
        }
        break;
      }
      case "scaley": {
        const sy = args[0] ? parseFloat(args[0]) : 1;
        if (Number.isFinite(sy)) {
          current = multiplyMatrix2D(current, { a: 1, b: 0, c: 0, d: sy, e: 0, f: 0 });
        }
        break;
      }
      case "scalez":
      case "scale3d": {
        is3D = true;
        break;
      }
      case "skewx": {
        const rad = args[0] ? (parseCssAngleToRad(args[0]) ?? 0) : 0;
        const tan = Math.tan(rad);
        current = multiplyMatrix2D(current, { a: 1, b: 0, c: tan, d: 1, e: 0, f: 0 });
        break;
      }
      case "skewy": {
        const rad = args[0] ? (parseCssAngleToRad(args[0]) ?? 0) : 0;
        const tan = Math.tan(rad);
        current = multiplyMatrix2D(current, { a: 1, b: tan, c: 0, d: 1, e: 0, f: 0 });
        break;
      }
      case "skew": {
        const radX = args[0] ? (parseCssAngleToRad(args[0]) ?? 0) : 0;
        const radY = args[1] ? (parseCssAngleToRad(args[1]) ?? 0) : 0;
        current = multiplyMatrix2D(current, { a: 1, b: Math.tan(radY), c: Math.tan(radX), d: 1, e: 0, f: 0 });
        break;
      }
      default:
        break;
    }
  }

  if (matchedAny) {
    return { matrix: current, is3D };
  }

  return null;
}

export const parseMatrixString = parseTransformStringFallback;

/**
 * Parses individual CSS transform properties (translate, rotate, scale).
 */
export function parseIndividualTransforms(
  style: CSSStyleDeclaration | Record<string, string | undefined>,
  baseWidth: number,
  baseHeight: number,
): { matrix: Matrix2D; is3D: boolean } {
  let current: Matrix2D = { ...IDENTITY_MATRIX_2D };
  let is3D = false;

  // 1. CSS translate (e.g. "10px 20px", "10px", "10px 20px 0px")
  const translateVal = style.translate;
  if (translateVal && translateVal !== "none") {
    const parts = translateVal.trim().split(/\s+/);
    if (parts.length >= 1) {
      const tx = parseCssLengthOrPercent(parts[0]!, baseWidth) ?? 0;
      const ty = parts.length >= 2 ? (parseCssLengthOrPercent(parts[1]!, baseHeight) ?? 0) : 0;
      if (parts.length >= 3) {
        const tz = parseCssLengthOrPercent(parts[2]!, 0) ?? 0;
        if (Math.abs(tz) > 1e-4) is3D = true;
      }
      const tMatrix: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
      current = multiplyMatrix2D(current, tMatrix);
    }
  }

  // 2. CSS rotate (e.g. "45deg", "x 45deg")
  const rotateVal = style.rotate;
  if (rotateVal && rotateVal !== "none") {
    const parts = rotateVal.trim().split(/\s+/);
    if (parts.length === 1) {
      const rad = parseCssAngleToRad(parts[0]!);
      if (rad !== null) {
        const cos = round4(Math.cos(rad));
        const sin = round4(Math.sin(rad));
        const rMatrix: Matrix2D = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
        current = multiplyMatrix2D(current, rMatrix);
      }
    } else if (parts.length >= 2) {
      // 3D axis rotation like "x 45deg", "y 45deg", "1 0 0 45deg"
      is3D = true;
      const last = parts[parts.length - 1]!;
      const rad = parseCssAngleToRad(last);
      if (rad !== null && parts[0] === "z") {
        // z-axis rotation is equivalent to 2D rotation
        is3D = false;
        const cos = round4(Math.cos(rad));
        const sin = round4(Math.sin(rad));
        const rMatrix: Matrix2D = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
        current = multiplyMatrix2D(current, rMatrix);
      }
    }
  }

  // 3. CSS scale (e.g. "1.2", "1.2 0.8", "1 1 2")
  const scaleVal = style.scale;
  if (scaleVal && scaleVal !== "none") {
    const parts = scaleVal.trim().split(/\s+/);
    if (parts.length >= 1) {
      const sx = parseFloat(parts[0]!);
      const sy = parts.length >= 2 ? parseFloat(parts[1]!) : sx;
      if (parts.length >= 3) {
        const sz = parseFloat(parts[2]!);
        if (Number.isFinite(sz) && Math.abs(sz - 1) > 1e-4) is3D = true;
      }
      if (Number.isFinite(sx) && Number.isFinite(sy)) {
        const sMatrix: Matrix2D = { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
        current = multiplyMatrix2D(current, sMatrix);
      }
    }
  }

  return { matrix: current, is3D };
}

/**
 * Normalizes computed transform state from style properties.
 */
export function extractTransformMatrix(
  style: CSSStyleDeclaration | Record<string, string | undefined>,
  baseWidth: number,
  baseHeight: number,
  view?: Window | null,
): { matrix: Matrix2D; is3D: boolean; isIdentity: boolean } {
  let shorthandMatrix: Matrix2D = { ...IDENTITY_MATRIX_2D };
  let shorthandIs3D = false;

  const rawTransform = style.transform;
  if (rawTransform && rawTransform !== "none") {
    // Try browser DOMMatrixReadOnly / DOMMatrix if available
    const winWithDomMatrix = view as unknown as { DOMMatrixReadOnly?: typeof DOMMatrix; DOMMatrix?: typeof DOMMatrix } | null | undefined;
    const DOMMatrixClass =
      winWithDomMatrix?.DOMMatrixReadOnly ||
      winWithDomMatrix?.DOMMatrix ||
      (typeof globalThis !== "undefined"
        ? (globalThis as unknown as { DOMMatrixReadOnly?: typeof DOMMatrix }).DOMMatrixReadOnly ||
          globalThis.DOMMatrix
        : undefined);

    let parsedWithDomMatrix = false;
    if (DOMMatrixClass) {
      try {
        const domMatrix = new DOMMatrixClass(rawTransform);
        if (
          Number.isFinite(domMatrix.a) &&
          Number.isFinite(domMatrix.b) &&
          Number.isFinite(domMatrix.c) &&
          Number.isFinite(domMatrix.d) &&
          Number.isFinite(domMatrix.e) &&
          Number.isFinite(domMatrix.f)
        ) {
          shorthandMatrix = {
            a: round4(domMatrix.a),
            b: round4(domMatrix.b),
            c: round4(domMatrix.c),
            d: round4(domMatrix.d),
            e: round4(domMatrix.e),
            f: round4(domMatrix.f),
          };
          shorthandIs3D = !domMatrix.is2D;
          parsedWithDomMatrix = true;
        }
      } catch {
        // Fallback to pure parser
      }
    }

    if (!parsedWithDomMatrix) {
      const pureParsed = parseTransformStringFallback(rawTransform, baseWidth, baseHeight);
      if (pureParsed) {
        shorthandMatrix = pureParsed.matrix;
        shorthandIs3D = pureParsed.is3D;
      }
    }
  }

  // Combine with individual properties: translate -> rotate -> scale -> shorthand transform
  const individual = parseIndividualTransforms(style, baseWidth, baseHeight);
  const combined = multiplyMatrix2D(individual.matrix, shorthandMatrix);
  const is3D = shorthandIs3D || individual.is3D;

  const isIdentity =
    Math.abs(combined.a - 1) < 1e-4 &&
    Math.abs(combined.b) < 1e-4 &&
    Math.abs(combined.c) < 1e-4 &&
    Math.abs(combined.d - 1) < 1e-4 &&
    Math.abs(combined.e) < 1e-4 &&
    Math.abs(combined.f) < 1e-4;

  return { matrix: combined, is3D, isIdentity };
}

/**
 * Reconstructs the element's untransformed border-box base bounds from visual AABB,
 * dimensions, matrix, and transform-origin.
 */
export function reconstructBaseBounds(
  visualRect: Rect,
  baseWidth: number,
  baseHeight: number,
  matrix: Matrix2D,
  origin: TransformOrigin,
): { baseBounds: Rect; computedVisualAabb: Rect; maxError: number } {
  // Corners of untransformed box:
  const corners: Array<[number, number]> = [
    [0, 0],
    [baseWidth, 0],
    [baseWidth, baseHeight],
    [0, baseHeight],
  ];

  let minDx = Infinity;
  let maxDx = -Infinity;
  let minDy = Infinity;
  let maxDy = -Infinity;

  for (const [lx, ly] of corners) {
    const dx = origin.x + matrix.a * (lx - origin.x) + matrix.c * (ly - origin.y) + matrix.e;
    const dy = origin.y + matrix.b * (lx - origin.x) + matrix.d * (ly - origin.y) + matrix.f;
    if (dx < minDx) minDx = dx;
    if (dx > maxDx) maxDx = dx;
    if (dy < minDy) minDy = dy;
    if (dy > maxDy) maxDy = dy;
  }

  const baseX = visualRect.x - minDx;
  const baseY = visualRect.y - minDy;

  const baseBounds: Rect = {
    x: round4(baseX),
    y: round4(baseY),
    width: round4(baseWidth),
    height: round4(baseHeight),
  };

  const computedVisualAabb: Rect = {
    x: round4(baseX + minDx),
    y: round4(baseY + minDy),
    width: round4(maxDx - minDx),
    height: round4(maxDy - minDy),
  };

  const errorX = Math.abs(computedVisualAabb.x - visualRect.x);
  const errorY = Math.abs(computedVisualAabb.y - visualRect.y);
  const errorW = Math.abs(computedVisualAabb.width - visualRect.width);
  const errorH = Math.abs(computedVisualAabb.height - visualRect.height);
  const maxError = Math.max(errorX, errorY, errorW, errorH);

  return { baseBounds, computedVisualAabb, maxError };
}

/**
 * Evaluates transform classification and prepares warnings.
 */
export function classifyTransform(
  matrix: Matrix2D,
  is3D: boolean,
  maxError: number,
): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = [];

  if (is3D) {
    warnings.push({
      code: "TRANSFORM_3D_UNSUPPORTED",
      message: "CSS 3D transform (perspective, 3D rotation, or non-reducible matrix3d) is unsupported; collapsed to best-effort 2D.",
    });
    return warnings;
  }

  // Determinant check (negative = reflection / mirror)
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  if (det < -1e-4) {
    warnings.push({
      code: "TRANSFORM_REFLECTION_UNSUPPORTED",
      message: "CSS reflection/mirroring transform is not supported as editable Figma node geometry.",
    });
    return warnings;
  }

  // Orthogonality check for skew: dot product of transformed basis vectors
  const dot = matrix.a * matrix.c + matrix.b * matrix.d;
  if (Math.abs(dot) > 1e-3) {
    warnings.push({
      code: "TRANSFORM_SKEW_APPROXIMATED",
      message: "CSS skew transform is approximated; non-orthogonal axes are not natively representable in Figma relativeTransform.",
    });
  }

  // Scale checks
  const lenX = Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b);
  const lenY = Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d);
  if (Math.abs(lenX - lenY) > 1e-3) {
    warnings.push({
      code: "TRANSFORM_SCALE_APPROXIMATED",
      message: `CSS non-uniform scale (scaleX=${round4(lenX)}, scaleY=${round4(lenY)}) is approximated.`,
    });
  }

  // Geometry reconstruction confidence check
  if (maxError > 1.0) {
    warnings.push({
      code: "TRANSFORM_GEOMETRY_APPROXIMATED",
      message: `Transformed element base geometry reconstruction discrepancy (${round4(maxError)}px) exceeded tolerance; visual box used.`,
    });
  }

  return warnings;
}

/**
 * Computes transformed visual AABB from a known untransformed base box, matrix, and origin.
 */
export function computeTransformedAabbFromBase(
  baseBounds: Rect,
  matrix: Matrix2D,
  origin: TransformOrigin,
): Rect {
  const corners: Array<[number, number]> = [
    [0, 0],
    [baseBounds.width, 0],
    [baseBounds.width, baseBounds.height],
    [0, baseBounds.height],
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [lx, ly] of corners) {
    const px = baseBounds.x + origin.x + matrix.a * (lx - origin.x) + matrix.c * (ly - origin.y) + matrix.e;
    const py = baseBounds.y + origin.y + matrix.b * (lx - origin.x) + matrix.d * (ly - origin.y) + matrix.f;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  return {
    x: round4(minX),
    y: round4(minY),
    width: round4(maxX - minX),
    height: round4(maxY - minY),
  };
}

/**
 * High-level transform extraction pipeline for an Element.
 */
export function processElementTransform(
  style: CSSStyleDeclaration | Record<string, string | undefined>,
  rect: Rect,
  baseWidth: number,
  baseHeight: number,
  view?: Window | null,
  isLayoutBaseRect = false,
): {
  transform?: Transform2D;
  visualAabb?: Rect;
  warnings: Array<{ code: string; message: string }>;
} {
  const { matrix, is3D, isIdentity } = extractTransformMatrix(style, baseWidth, baseHeight, view);
  if (isIdentity && !is3D) {
    return { warnings: [] };
  }

  const origin = resolveTransformOrigin(style.transformOrigin, baseWidth, baseHeight);
  let baseBounds: Rect;
  let visualAabb: Rect;
  let warnings: Array<{ code: string; message: string }>;

  if (isLayoutBaseRect) {
    baseBounds = {
      x: round4(rect.x),
      y: round4(rect.y),
      width: round4(baseWidth),
      height: round4(baseHeight),
    };
    visualAabb = computeTransformedAabbFromBase(baseBounds, matrix, origin);
    warnings = classifyTransform(matrix, is3D, 0);
  } else {
    const rec = reconstructBaseBounds(rect, baseWidth, baseHeight, matrix, origin);
    baseBounds = rec.baseBounds;
    visualAabb = rec.computedVisualAabb;
    warnings = classifyTransform(matrix, is3D, rec.maxError);
  }

  const transform: Transform2D = {
    matrix: {
      a: round4(matrix.a),
      b: round4(matrix.b),
      c: round4(matrix.c),
      d: round4(matrix.d),
      e: round4(matrix.e),
      f: round4(matrix.f),
    },
    origin: {
      x: round4(origin.x),
      y: round4(origin.y),
    },
    baseBounds: {
      x: round4(baseBounds.x),
      y: round4(baseBounds.y),
      width: round4(baseBounds.width),
      height: round4(baseBounds.height),
    },
  };

  return { transform, visualAabb, warnings };
}
