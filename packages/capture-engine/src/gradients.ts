import type {
  Color,
  GradientStop,
  LinearGradientFill,
  RadialGradientFill,
} from "@web2design/design-schema";
import { cssColor, type Warn } from "./styles.js";

export interface BoxDimensions {
  width: number;
  height: number;
}

/**
 * Split a comma-separated CSS value (such as multiple background-image layers)
 * strictly at depth zero (outside of parentheses and quotes).
 */
export function splitBackgroundLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      const part = value.slice(start, i).trim();
      if (part) layers.push(part);
      start = i + 1;
    }
  }

  const remainder = value.slice(start).trim();
  if (remainder) layers.push(remainder);

  return layers;
}

/**
 * Splits comma-separated items inside a gradient function call at depth zero.
 */
function splitGradientArgs(argsStr: string): string[] {
  return splitBackgroundLayers(argsStr);
}

const CANONICAL_DIRECTIONS: Record<string, number> = {
  "to top": 0,
  "to right": 90,
  "to bottom": 180,
  "to left": 270,
};

function normalizeAngle(angle: number): number {
  const norm = ((angle % 360) + 360) % 360;
  return Math.round(norm * 10000) / 10000;
}

function parseAngleToken(token: string): number | undefined {
  const trimmed = token.trim();
  const degMatch = /^(-?\d+(?:\.\d+)?)\s*deg$/i.exec(trimmed);
  if (degMatch) return Number(degMatch[1]);

  const radMatch = /^(-?\d+(?:\.\d+)?)\s*rad$/i.exec(trimmed);
  if (radMatch) return (Number(radMatch[1]) * 180) / Math.PI;

  const gradMatch = /^(-?\d+(?:\.\d+)?)\s*grad$/i.exec(trimmed);
  if (gradMatch) return Number(gradMatch[1]) * 0.9;

  const turnMatch = /^(-?\d+(?:\.\d+)?)\s*turn$/i.exec(trimmed);
  if (turnMatch) return Number(turnMatch[1]) * 360;

  if (trimmed === "0") return 0;
  return undefined;
}

function parseDiagonalDirection(keyword: string, box?: BoxDimensions): number | undefined {
  const w = box && box.width > 0 ? box.width : 100;
  const h = box && box.height > 0 ? box.height : 100;
  // Corner angle in radians from box aspect ratio
  const cornerAngleDeg = (Math.atan2(w, h) * 180) / Math.PI;

  switch (keyword) {
    case "to top right":
    case "to right top":
      return normalizeAngle(cornerAngleDeg);
    case "to bottom right":
    case "to right bottom":
      return normalizeAngle(180 - cornerAngleDeg);
    case "to bottom left":
    case "to left bottom":
      return normalizeAngle(180 + cornerAngleDeg);
    case "to top left":
    case "to left top":
      return normalizeAngle(360 - cornerAngleDeg);
    default:
      return undefined;
  }
}

interface RawParsedStop {
  color?: Color | undefined;
  position?: number | undefined;
  isHint?: boolean | undefined;
}

function parseStopToken(
  token: string,
  box: BoxDimensions | undefined,
  gradientLength: number | undefined,
  warn: Warn,
): RawParsedStop[] {
  const trimmed = token.trim();
  if (!trimmed) return [];

  // 1. Check for color hint: single percentage or length token (e.g. "30%" or "25px")
  if (/^-?\d+(?:\.\d+)?%$/.test(trimmed)) {
    const pct = parseFloat(trimmed) / 100;
    warn("GRADIENT_COLOR_HINT_APPROXIMATED", `Gradient color hint '${trimmed}' was approximated.`);
    return [{ isHint: true, position: Math.max(0, Math.min(1, pct)) }];
  }
  if (/^-?\d+(?:\.\d+)?px$/i.test(trimmed)) {
    const px = parseFloat(trimmed);
    const pos = gradientLength && gradientLength > 0 ? px / gradientLength : undefined;
    warn("GRADIENT_COLOR_HINT_APPROXIMATED", `Gradient color hint '${trimmed}' was approximated.`);
    return [{ isHint: true, position: pos !== undefined ? Math.max(0, Math.min(1, pos)) : undefined }];
  }

  // 2. Separate color from positions.
  // Color may be rgba(...), rgb(...), #hex, or keyword.
  // Match closing paren if function color.
  let colorStr = "";
  let posStr = "";

  if (trimmed.startsWith("rgb") || trimmed.startsWith("hsl") || trimmed.startsWith("color")) {
    const parenClose = trimmed.lastIndexOf(")");
    if (parenClose !== -1) {
      colorStr = trimmed.slice(0, parenClose + 1).trim();
      posStr = trimmed.slice(parenClose + 1).trim();
    }
  } else {
    // Word or hex followed by optional positions
    const parts = trimmed.split(/\s+/);
    colorStr = parts[0]!;
    posStr = parts.slice(1).join(" ").trim();
  }

  const color = cssColor(colorStr);
  if (!color) {
    return [];
  }

  if (!posStr) {
    return [{ color, position: undefined }];
  }

  // Check for multi-position stop (e.g., "10% 30%")
  const posParts = posStr.split(/\s+/).filter(Boolean);
  if (posParts.length === 2) {
    const p1 = parsePosition(posParts[0]!, gradientLength, warn);
    const p2 = parsePosition(posParts[1]!, gradientLength, warn);
    return [
      { color, position: p1 },
      { color, position: p2 },
    ];
  }

  const p = parsePosition(posParts[0]!, gradientLength, warn);
  return [{ color, position: p }];
}

function parsePosition(
  posStr: string,
  gradientLength: number | undefined,
  warn: Warn,
): number | undefined {
  if (posStr.endsWith("%")) {
    const num = parseFloat(posStr);
    return Number.isFinite(num) ? Math.max(0, Math.min(1, num / 100)) : undefined;
  }
  if (posStr.endsWith("px")) {
    const px = parseFloat(posStr);
    if (!Number.isFinite(px)) return undefined;
    if (gradientLength && gradientLength > 0) {
      return Math.max(0, Math.min(1, px / gradientLength));
    }
    warn("GRADIENT_STOP_APPROXIMATED", `Length-based gradient stop '${posStr}' approximated.`);
    return undefined;
  }
  return undefined;
}

function interpolateStopPositions(rawStops: RawParsedStop[]): GradientStop[] | undefined {
  // Filter out pure hints while recording positions
  const colorStops: Array<{ color: Color; position?: number | undefined }> = [];
  for (const s of rawStops) {
    if (!s.isHint && s.color) {
      colorStops.push({ color: s.color, position: s.position });
    }
  }

  if (colorStops.length < 2) {
    return undefined;
  }

  // Rule 1: First stop without position defaults to 0
  if (colorStops[0]!.position === undefined) {
    colorStops[0]!.position = 0;
  }

  // Rule 2: Last stop without position defaults to 1
  if (colorStops[colorStops.length - 1]!.position === undefined) {
    colorStops[colorStops.length - 1]!.position = 1;
  }

  // Rule 3: Intermediate stops with missing positions are evenly distributed
  let i = 0;
  while (i < colorStops.length) {
    if (colorStops[i]!.position === undefined) {
      let j = i;
      while (j < colorStops.length && colorStops[j]!.position === undefined) {
        j++;
      }
      const prevPos = colorStops[i - 1]!.position ?? 0;
      const nextPos = (j < colorStops.length ? colorStops[j]!.position : 1) ?? 1;
      const count = j - i;
      const step = (nextPos - prevPos) / (count + 1);

      for (let k = 0; k < count; k++) {
        colorStops[i + k]!.position = prevPos + step * (k + 1);
      }
      i = j;
    } else {
      i++;
    }
  }

  // Rule 4: Ensure non-decreasing positions (CSS monotonicity rule)
  let currentMax = 0;
  const result: GradientStop[] = [];
  for (const s of colorStops) {
    const pos = Math.max(currentMax, Math.min(1, s.position ?? 0));
    currentMax = pos;
    result.push({
      color: s.color,
      position: Math.round(pos * 10000) / 10000,
    });
  }

  return result;
}

/**
 * Parses a `linear-gradient(...)` CSS expression.
 */
export function parseLinearGradient(
  argsStr: string,
  box: BoxDimensions | undefined,
  warn: Warn,
): LinearGradientFill | undefined {
  const args = splitGradientArgs(argsStr);
  if (args.length < 2) {
    warn("GRADIENT_SYNTAX_UNSUPPORTED", "Linear gradient has fewer than two parameters.");
    return undefined;
  }

  let angle = 180; // CSS default is "to bottom" = 180deg
  let stopStartIndex = 0;

  const firstArg = args[0]!.trim();

  // Check for modern color interpolation spaces (e.g. "in srgb", "in oklab")
  if (/\bin\s+(srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz|xyz-d50|xyz-d65|hsl|hwb|lch|oklch)\b/i.test(firstArg)) {
    warn("GRADIENT_INTERPOLATION_APPROXIMATED", `Modern color interpolation in '${firstArg}' was approximated.`);
  }

  // Direction / Angle detection
  if (firstArg in CANONICAL_DIRECTIONS) {
    angle = CANONICAL_DIRECTIONS[firstArg]!;
    stopStartIndex = 1;
  } else {
    const diagAngle = parseDiagonalDirection(firstArg, box);
    if (diagAngle !== undefined) {
      angle = diagAngle;
      stopStartIndex = 1;
    } else {
      const explicitAngle = parseAngleToken(firstArg);
      if (explicitAngle !== undefined) {
        angle = normalizeAngle(explicitAngle);
        stopStartIndex = 1;
      }
    }
  }

  const stopArgs = args.slice(stopStartIndex);
  if (stopArgs.length < 2) {
    warn("GRADIENT_SYNTAX_UNSUPPORTED", "Linear gradient has fewer than two color stops.");
    return undefined;
  }

  // Calculate gradient line length L for length-based stops:
  // L = |W * sin(alpha)| + |H * cos(alpha)|
  let gradientLength: number | undefined;
  if (box && box.width > 0 && box.height > 0) {
    const rad = (angle * Math.PI) / 180;
    gradientLength = Math.abs(box.width * Math.sin(rad)) + Math.abs(box.height * Math.cos(rad));
  }

  const rawStops: RawParsedStop[] = [];
  for (const s of stopArgs) {
    const parsed = parseStopToken(s, box, gradientLength, warn);
    rawStops.push(...parsed);
  }

  const stops = interpolateStopPositions(rawStops);
  if (!stops || stops.length < 2) {
    warn("GRADIENT_SYNTAX_UNSUPPORTED", "Linear gradient stops could not be resolved.");
    return undefined;
  }

  return {
    type: "linear-gradient",
    angle,
    stops,
  };
}

/**
 * Parses a `radial-gradient(...)` CSS expression.
 */
export function parseRadialGradient(
  argsStr: string,
  box: BoxDimensions | undefined,
  warn: Warn,
): RadialGradientFill | undefined {
  const args = splitGradientArgs(argsStr);
  if (args.length < 2) {
    warn("GRADIENT_SYNTAX_UNSUPPORTED", "Radial gradient has fewer than two parameters.");
    return undefined;
  }

  let center = { x: 0.5, y: 0.5 };
  let shape: "circle" | "ellipse" = "ellipse";
  let radius: { x: number; y: number };
  let stopStartIndex = 0;

  const firstArg = args[0]!.trim();
  const hasPrelude =
    firstArg.startsWith("circle") ||
    firstArg.startsWith("ellipse") ||
    firstArg.startsWith("at ") ||
    firstArg.includes("closest-") ||
    firstArg.includes("farthest-");

  if (hasPrelude) {
    stopStartIndex = 1;

    if (/\bin\s+(srgb|srgb-linear|display-p3|oklab|hsl)\b/i.test(firstArg)) {
      warn("GRADIENT_INTERPOLATION_APPROXIMATED", `Modern color interpolation in '${firstArg}' was approximated.`);
    }

    if (firstArg.includes("circle")) {
      shape = "circle";
    }

    // Parse position: "at <x> <y>"
    const atIndex = firstArg.indexOf("at ");
    if (atIndex !== -1) {
      const posStr = firstArg.slice(atIndex + 3).trim();
      const posTokens = posStr.split(/\s+/).filter(Boolean);
      center = parseCenterTokens(posTokens, box);
    }
  }

  // Calculate default radii based on center and box dimensions
  const w = box && box.width > 0 ? box.width : 100;
  const h = box && box.height > 0 ? box.height : 100;

  const distMaxX = Math.max(center.x, 1 - center.x) * w;
  const distMaxY = Math.max(center.y, 1 - center.y) * h;

  if (shape === "circle") {
    // Circle: radius = distance to farthest corner in pixels
    const rPx = Math.hypot(distMaxX, distMaxY);
    radius = {
      x: Math.round((rPx / w) * 10000) / 10000,
      y: Math.round((rPx / h) * 10000) / 10000,
    };
  } else {
    // Ellipse: farthest-corner ellipse
    const rxPx = Math.SQRT2 * distMaxX;
    const ryPx = Math.SQRT2 * distMaxY;
    radius = {
      x: Math.round((rxPx / w) * 10000) / 10000,
      y: Math.round((ryPx / h) * 10000) / 10000,
    };
  }

  const stopArgs = args.slice(stopStartIndex);
  if (stopArgs.length < 2) {
    warn("GRADIENT_SYNTAX_UNSUPPORTED", "Radial gradient has fewer than two color stops.");
    return undefined;
  }

  const gradientRadius = Math.max(radius.x * w, radius.y * h);
  const rawStops: RawParsedStop[] = [];
  for (const s of stopArgs) {
    const parsed = parseStopToken(s, box, gradientRadius, warn);
    rawStops.push(...parsed);
  }

  const stops = interpolateStopPositions(rawStops);
  if (!stops || stops.length < 2) {
    warn("GRADIENT_SYNTAX_UNSUPPORTED", "Radial gradient stops could not be resolved.");
    return undefined;
  }

  return {
    type: "radial-gradient",
    center: {
      x: Math.round(center.x * 10000) / 10000,
      y: Math.round(center.y * 10000) / 10000,
    },
    radius,
    shape,
    stops,
  };
}

function parseCenterTokens(tokens: string[], box?: BoxDimensions): { x: number; y: number } {
  let cx = 0.5;
  let cy = 0.5;

  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (t === "left") cx = 0;
    else if (t === "right") cx = 1;
    else if (t === "top") cy = 0;
    else if (t === "bottom") cy = 1;
    else if (t === "center") {
      cx = 0.5;
      cy = 0.5;
    } else if (t.endsWith("%")) {
      cx = Math.max(0, Math.min(1, parseFloat(t) / 100));
    }
    return { x: cx, y: cy };
  }

  if (tokens.length >= 2) {
    const [t1, t2] = tokens;
    // Map X
    if (t1 === "left") cx = 0;
    else if (t1 === "right") cx = 1;
    else if (t1 === "center") cx = 0.5;
    else if (t1!.endsWith("%")) cx = Math.max(0, Math.min(1, parseFloat(t1!) / 100));
    else if (t1!.endsWith("px") && box && box.width > 0) cx = Math.max(0, Math.min(1, parseFloat(t1!) / box.width));

    // Map Y
    if (t2 === "top") cy = 0;
    else if (t2 === "bottom") cy = 1;
    else if (t2 === "center") cy = 0.5;
    else if (t2!.endsWith("%")) cy = Math.max(0, Math.min(1, parseFloat(t2!) / 100));
    else if (t2!.endsWith("px") && box && box.height > 0) cy = Math.max(0, Math.min(1, parseFloat(t2!) / box.height));
  }

  return { x: cx, y: cy };
}

/**
 * Parses all background layers from `style.backgroundImage` and integrates them into VisualStyle.
 */
export function parseBackgroundGradientLayers(
  backgroundImage: string,
  box: BoxDimensions | undefined,
  warn: Warn,
): Array<LinearGradientFill | RadialGradientFill> {
  if (!backgroundImage || backgroundImage === "none") {
    return [];
  }

  const layers = splitBackgroundLayers(backgroundImage);
  const result: Array<LinearGradientFill | RadialGradientFill> = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;

    // Check for deferred repeating gradients
    if (layer.startsWith("repeating-linear-gradient(") || layer.startsWith("repeating-radial-gradient(")) {
      warn("GRADIENT_TYPE_UNSUPPORTED", `Repeating gradients (${layer.slice(0, 24)}...) are deferred in V0.2.`);
      continue;
    }

    // Check for deferred conic gradients
    if (layer.startsWith("conic-gradient(") || layer.startsWith("repeating-conic-gradient(")) {
      warn("GRADIENT_TYPE_UNSUPPORTED", `Conic gradients (${layer.slice(0, 16)}...) are deferred in V0.2.`);
      continue;
    }

    // Check for non-gradient url(...)
    if (layer.startsWith("url(")) {
      warn("BACKGROUND_IMAGE_UNSUPPORTED", "Remote CSS background-image url(...) is not captured.");
      continue;
    }

    // Linear gradient
    if (layer.startsWith("linear-gradient(")) {
      const argsStr = layer.slice("linear-gradient(".length, -1);
      const parsed = parseLinearGradient(argsStr, box, warn);
      if (parsed) result.push(parsed);
      continue;
    }

    // Radial gradient
    if (layer.startsWith("radial-gradient(")) {
      const argsStr = layer.slice("radial-gradient(".length, -1);
      const parsed = parseRadialGradient(argsStr, box, warn);
      if (parsed) result.push(parsed);
      continue;
    }

    warn("BACKGROUND_IMAGE_UNSUPPORTED", `Unsupported background layer format was omitted.`);
  }

  return result;
}
