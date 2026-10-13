import type { BoxShadow, Color, TextStyle, VisualStyle } from "@web2design/design-schema";
export type Warn = (code: string, message: string, nodeId?: string) => void;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
export function cssColor(input: string): Color | undefined {
  const value = (input ?? "").trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)?.[1];
  if (hex) {
    const expanded = hex.length < 5 ? [...hex].map(char => char + char).join("") : hex;
    return { r: parseInt(expanded.slice(0, 2), 16) / 255, g: parseInt(expanded.slice(2, 4), 16) / 255,
      b: parseInt(expanded.slice(4, 6), 16) / 255, a: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1 };
  }
  const srgb = /^color\(srgb\s+([^)]+)\)$/.exec(value)?.[1];
  const match = srgb ?? /^rgba?\(([^)]+)\)$/.exec(value)?.[1];
  if (!match) return undefined;
  const parts = match.replace(/\//g, " ").split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const channels = parts.map((part, index) => {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?$/.test(part)) return NaN;
    const numeric = Number(part.endsWith("%") ? part.slice(0, -1) : part);
    return numeric / (part.endsWith("%") ? 100 : index < 3 && !srgb ? 255 : 1);
  });
  if (!channels.every(Number.isFinite)) return undefined;
  return { r: clamp(channels[0]!), g: clamp(channels[1]!), b: clamp(channels[2]!), a: clamp(channels[3] ?? 1) };
}
export function cssPixels(value: string): number | undefined {
  if (!value) return undefined;
  if (!/^-?(?:\d+\.?\d*|\.\d+)px$/.test(value.trim())) return undefined;
  const number = Number(value.trim().slice(0, -2));
  return Number.isFinite(number) ? number : undefined;
}
export function fontFamilies(value?: string): string[] {
  return ((value ?? "").match(/"[^"]*"|'[^']*'|[^,]+/g) ?? []).map(family => family.trim().replace(/^(['"])(.*)\1$/, "$2")).filter(Boolean);
}
export function textStyle(style: CSSStyleDeclaration, warn: Warn): TextStyle {
  const families = fontFamilies(style.fontFamily);
  const fontSize = cssPixels(style.fontSize);
  const size = fontSize !== undefined && fontSize > 0 ? fontSize : 16;
  if (fontSize === undefined || fontSize <= 0) warn("FONT_SIZE_APPROXIMATED", "Unresolved font size uses 16 CSS pixels.");
  const line = cssPixels(style.lineHeight);
  if (line === undefined || line <= 0) warn("LINE_HEIGHT_APPROXIMATED", "Computed normal/unresolved line height uses 1.2 times font size.");
  const weight = style.fontWeight === "bold" ? 700 : style.fontWeight === "normal" ? 400 : Number(style.fontWeight);
  const spacing = style.letterSpacing === "normal" || !style.letterSpacing ? 0 : cssPixels(style.letterSpacing);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) warn("FONT_WEIGHT_APPROXIMATED", "Unresolved font weight uses 400 (out-of-range weights are clamped).");
  if (spacing === undefined) warn("LETTER_SPACING_APPROXIMATED", "Unresolved letter spacing uses 0 CSS pixels.");
  const color = cssColor(style.color);
  if (!color) warn("TEXT_COLOR_APPROXIMATED", "Unsupported computed text color uses opaque black.");
  const align = ["left", "center", "right", "justify", "start", "end"].includes(style.textAlign ?? "") ? style.textAlign as TextStyle["textAlign"] : "start";
  const fontStyleVal = style.fontStyle ?? "normal";
  return { fontFamily: families[0] ?? "sans-serif", ...(families.length > 1 ? { fontFallbacks: families.slice(1) } : {}),
    fontSize: size, fontWeight: Number.isFinite(weight) && weight > 0 ? Math.min(1000, Math.max(1, Math.round(weight))) : 400,
    fontStyle: fontStyleVal.startsWith("oblique") ? "oblique" : fontStyleVal === "italic" ? "italic" : "normal",
    lineHeight: line !== undefined && line > 0 ? line : size * 1.2, letterSpacing: spacing ?? 0, textAlign: align,
    color: color ?? { r: 0, g: 0, b: 0, a: 1 } };
}
// Tokenize only at depth zero so rgba commas and modern color spaces remain intact.
function shadowTokens(value: string): string[] | undefined {
  const tokens: string[] = [];
  let start = 0, depth = 0;
  for (let index = 0; index <= value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;
    if (char === ")" && --depth < 0) return undefined;
    if (depth === 0 && char === ",") return undefined;
    if (index === value.length || depth === 0 && /\s/.test(char ?? "")) {
      const token = value.slice(start, index).trim();
      if (token) tokens.push(token);
      start = index + 1;
    }
  }
  return depth === 0 ? tokens : undefined;
}
export function boxShadow(value: string, warn: Warn): BoxShadow | undefined {
  if (!value || value.trim() === "none") return undefined;
  const tokens = shadowTokens(value.trim());
  if (!tokens || tokens.includes("inset")) {
    warn("SHADOW_UNSUPPORTED", "Multiple, inset or malformed box shadows are omitted; only one outer shadow is supported.");
    return undefined;
  }
  const lengths: number[] = [];
  let color: Color | undefined;
  for (const token of tokens) {
    const length = token === "0" ? 0 : cssPixels(token);
    if (length !== undefined) lengths.push(length);
    else {
      const parsed = cssColor(token);
      if (!parsed || color) { warn("SHADOW_UNSUPPORTED", "Unsupported box-shadow syntax/color was omitted."); return undefined; }
      color = parsed;
    }
  }
  if (!color || lengths.length < 2 || lengths.length > 4 || (lengths[2] ?? 0) < 0) {
    warn("SHADOW_UNSUPPORTED", "Unresolved box-shadow lengths/color were omitted."); return undefined;
  }
  return { offsetX: lengths[0]!, offsetY: lengths[1]!, blurRadius: lengths[2] ?? 0, spreadRadius: lengths[3] ?? 0, color, inset: false };
}
export function visualStyle(style: CSSStyleDeclaration, warn: Warn, box?: { width: number; height: number }): VisualStyle {
  const result: VisualStyle = {};
  const background = cssColor(style.backgroundColor);
  if (background && background.a > 0) result.fills = [{ type: "solid", color: background }];
  else if (style.backgroundColor && !background) warn("BACKGROUND_COLOR_UNSUPPORTED", "Unsupported background color was omitted.");
  if (style.backgroundImage && style.backgroundImage !== "none") warn("BACKGROUND_IMAGE_UNSUPPORTED", "Background images/gradients are not captured.");
  const widths = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(cssPixels);
  const borderStyles = [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle];
  const colors = [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor].map(cssColor);
  const width = widths[0];
  if (widths.some(value => (value ?? 0) > 0)) {
    const borderStyle = borderStyles[0], color = colors[0];
    if (widths.every(value => value === width) && borderStyles.every(value => value === borderStyle) && colors.every(value => value && color && value.r === color.r && value.g === color.g && value.b === color.b && value.a === color.a)
      && width !== undefined && width >= 0 && color && ["solid", "dashed", "dotted", "double"].includes(borderStyle ?? "")) {
      result.border = { width, style: borderStyle as "solid" | "dashed" | "dotted" | "double", color };
    } else warn("BORDER_UNSUPPORTED", "Nonuniform or unsupported borders were omitted.");
  }
  const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(value => {
    const parts = (value || style.borderRadius || "0px").trim().split(/\s+/).map(cssPixels);
    return parts.length <= 2 && parts.every(part => part === parts[0]) ? parts[0] : undefined;
  });
  if (radii.every((radius): radius is number => radius !== undefined && radius >= 0) && radii.some(radius => radius > 0)) {
    // CSS reduces all radii together when adjacent corners would overlap.
    if (box) {
      const ratios = [box.width / (radii[0]! + radii[1]!), box.width / (radii[2]! + radii[3]!), box.height / (radii[0]! + radii[3]!), box.height / (radii[1]! + radii[2]!)];
      const scale = Math.min(1, ...ratios);
      for (let index = 0; index < radii.length; index++) radii[index] = radii[index]! * scale;
    }
    if (radii.every(radius => radius === radii[0])) result.cornerRadius = radii[0]!;
    else result.cornerRadius = { topLeft: radii[0]!, topRight: radii[1]!, bottomRight: radii[2]!, bottomLeft: radii[3]! };
  } else if ([style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].some(value => value && value !== "0px")) {
    warn("RADIUS_UNSUPPORTED", "Percentage/elliptical corner radii were omitted.");
  }
  const shadow = boxShadow(style.boxShadow, warn);
  if (shadow) result.boxShadows = [shadow];
  return result;
}
export function characters(value: string, whiteSpace: string): string {
  if (whiteSpace === "pre-line") {
    return value.replace(/\r\n?/g, "\n").replace(/[\t\f ]+/g, " ").replace(/ *\n */g, "\n");
  }
  return whiteSpace.startsWith("pre") || whiteSpace === "break-spaces" ?
    value.replace(/\r\n?/g, "\n") : value.replace(/[\t\r\n\f ]+/g, " ");
}
