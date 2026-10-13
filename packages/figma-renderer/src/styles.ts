import type { BorderSide, VisualStyle } from "@web2design/design-schema";
import { toFigmaFills, toFigmaRgba, toFigmaSolidPaint } from "./colors.js";
import type { WarningCollector } from "./warnings.js";

export interface StyleableNode {
  opacity: number;
  fills: readonly Paint[] | PluginAPI["mixed"];
  strokes: readonly Paint[];
  strokeWeight: number | PluginAPI["mixed"];
  strokeTopWeight?: number | undefined;
  strokeRightWeight?: number | undefined;
  strokeBottomWeight?: number | undefined;
  strokeLeftWeight?: number | undefined;
  dashPattern?: readonly number[] | undefined;
  cornerRadius?: number | PluginAPI["mixed"] | undefined;
  topLeftRadius?: number | undefined;
  topRightRadius?: number | undefined;
  bottomRightRadius?: number | undefined;
  bottomLeftRadius?: number | undefined;
  effects: readonly Effect[];
}

export function applyVisualStyle(
  node: StyleableNode,
  style: VisualStyle | undefined,
  localOpacity: number,
  warnings: WarningCollector,
  nodeId: string,
  bounds: { width: number; height: number } = { width: 100, height: 100 },
): void {
  // 1. Local opacity
  node.opacity = Math.max(0, Math.min(1, localOpacity));

  if (!style) {
    node.fills = [];
    node.strokes = [];
    node.strokeWeight = 0;
    node.strokeTopWeight = 0;
    node.strokeRightWeight = 0;
    node.strokeBottomWeight = 0;
    node.strokeLeftWeight = 0;
    node.dashPattern = [];
    node.effects = [];
    return;
  }

  // 2. Fills
  node.fills = toFigmaFills(style.fills, bounds);

  // 3. Borders
  if (style.border) {
    const rawBorder = style.border as unknown as Record<string, unknown>;
    const b = "top" in rawBorder
      ? (style.border as unknown as { top: BorderSide; right: BorderSide; bottom: BorderSide; left: BorderSide })
      : {
          top: rawBorder as unknown as BorderSide,
          right: rawBorder as unknown as BorderSide,
          bottom: rawBorder as unknown as BorderSide,
          left: rawBorder as unknown as BorderSide,
        };

    const sides = [b.top, b.right, b.bottom, b.left];
    const visibleSides = sides.filter(
      (s) => s && typeof s.width === "number" && s.width > 0 && s.style !== "none" && s.style !== "hidden",
    );

    if (visibleSides.length > 0) {
      const primary = visibleSides[0]!;
      const isUniformWidth =
        b.top.width === b.right.width &&
        b.right.width === b.bottom.width &&
        b.bottom.width === b.left.width;

      const hasMixedColors = visibleSides.some(
        (s) =>
          s.color.r !== primary.color.r ||
          s.color.g !== primary.color.g ||
          s.color.b !== primary.color.b ||
          s.color.a !== primary.color.a,
      );

      if (hasMixedColors) {
        warnings.warn(
          "BORDER_COLOR_APPROXIMATED",
          "Mixed border colors rendered using primary border color in single stroke paint",
          nodeId,
        );
      }

      const hasMixedStyles = visibleSides.some((s) => s.style !== primary.style);
      if (hasMixedStyles) {
        warnings.warn(
          "BORDER_STYLE_APPROXIMATED",
          `Mixed border styles approximated using primary style '${primary.style}'`,
          nodeId,
        );
      }

      if (primary.style === "dashed") {
        node.dashPattern = [Math.max(1, primary.width * 2), Math.max(1, primary.width * 2)];
        warnings.warn(
          "BORDER_STYLE_APPROXIMATED",
          "Border style 'dashed' approximated using dash pattern",
          nodeId,
        );
      } else if (primary.style === "dotted") {
        node.dashPattern = [1, Math.max(2, primary.width * 2)];
        warnings.warn(
          "BORDER_STYLE_APPROXIMATED",
          "Border style 'dotted' approximated using dash pattern",
          nodeId,
        );
      } else if (primary.style !== "solid") {
        node.dashPattern = [];
        warnings.warn(
          "BORDER_STYLE_APPROXIMATED",
          `Border style '${primary.style}' rendered as solid stroke`,
          nodeId,
        );
      } else {
        node.dashPattern = [];
      }

      if ((!isUniformWidth || hasMixedColors) && style.cornerRadius !== undefined) {
        warnings.warn(
          "BORDER_CORNER_APPROXIMATED",
          "Non-uniform border with corner radius may differ from browser corner rendering",
          nodeId,
        );
      }

      node.strokes = [toFigmaSolidPaint(primary.color)];
      if (isUniformWidth) {
        node.strokeWeight = b.top.width;
        node.strokeTopWeight = b.top.width;
        node.strokeRightWeight = b.right.width;
        node.strokeBottomWeight = b.bottom.width;
        node.strokeLeftWeight = b.left.width;
      } else {
        node.strokeWeight = 0;
        node.strokeTopWeight = b.top.width;
        node.strokeRightWeight = b.right.width;
        node.strokeBottomWeight = b.bottom.width;
        node.strokeLeftWeight = b.left.width;
      }
    } else {
      node.strokes = [];
      node.strokeWeight = 0;
      node.strokeTopWeight = 0;
      node.strokeRightWeight = 0;
      node.strokeBottomWeight = 0;
      node.strokeLeftWeight = 0;
      node.dashPattern = [];
    }
  } else {
    node.strokes = [];
    node.strokeWeight = 0;
    node.strokeTopWeight = 0;
    node.strokeRightWeight = 0;
    node.strokeBottomWeight = 0;
    node.strokeLeftWeight = 0;
    node.dashPattern = [];
  }

  // 4. Corner radius
  if (style.cornerRadius !== undefined) {
    if (typeof style.cornerRadius === "number") {
      node.cornerRadius = style.cornerRadius;
    } else {
      const { topLeft, topRight, bottomRight, bottomLeft } = style.cornerRadius;
      if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
        node.cornerRadius = topLeft;
      } else {
        node.topLeftRadius = topLeft;
        node.topRightRadius = topRight;
        node.bottomRightRadius = bottomRight;
        node.bottomLeftRadius = bottomLeft;
      }
    }
  }

  // 5. Box shadows (ordered drop + inner shadows)
  if (style.boxShadows && style.boxShadows.length > 0) {
    const effects: Effect[] = [];
    for (const shadow of style.boxShadows) {
      if (shadow.inset) {
        const innerShadow: InnerShadowEffect = {
          type: "INNER_SHADOW",
          color: toFigmaRgba(shadow.color),
          offset: { x: shadow.offsetX, y: shadow.offsetY },
          radius: Math.max(0, shadow.blurRadius),
          spread: shadow.spreadRadius,
          visible: true,
          blendMode: "NORMAL",
        };
        effects.push(innerShadow);
      } else {
        const dropShadow: DropShadowEffect = {
          type: "DROP_SHADOW",
          color: toFigmaRgba(shadow.color),
          offset: { x: shadow.offsetX, y: shadow.offsetY },
          radius: Math.max(0, shadow.blurRadius),
          spread: shadow.spreadRadius,
          visible: true,
          blendMode: "NORMAL",
        };
        effects.push(dropShadow);
      }
    }
    node.effects = effects;
  } else {
    node.effects = [];
  }
}
