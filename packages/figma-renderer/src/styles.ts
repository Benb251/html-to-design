/// <reference types="@figma/plugin-typings" />
import type { VisualStyle } from "@web2design/design-schema";
import { toFigmaFills, toFigmaRgba, toFigmaSolidPaint } from "./colors.js";
import type { WarningCollector } from "./warnings.js";

export interface StyleableNode {
  opacity: number;
  fills: readonly Paint[] | PluginAPI["mixed"];
  strokes: readonly Paint[];
  strokeWeight: number | PluginAPI["mixed"];
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
): void {
  // 1. Local opacity
  node.opacity = Math.max(0, Math.min(1, localOpacity));

  if (!style) {
    node.fills = [];
    node.strokes = [];
    node.strokeWeight = 0;
    node.effects = [];
    return;
  }

  // 2. Fills
  node.fills = toFigmaFills(style.fills);

  // 3. Borders
  if (style.border && style.border.width > 0 && style.border.style !== "none") {
    node.strokes = [toFigmaSolidPaint(style.border.color)];
    node.strokeWeight = style.border.width;

    if (style.border.style !== "solid") {
      warnings.warn(
        "BORDER_STYLE_APPROXIMATED",
        `Border style '${style.border.style}' rendered as solid stroke`,
        nodeId,
      );
    }
  } else {
    node.strokes = [];
    node.strokeWeight = 0;
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

  // 5. Box shadow (single outer shadow in V0.1)
  if (style.boxShadows && style.boxShadows.length > 0) {
    const firstShadow = style.boxShadows[0]!;
    if (firstShadow.inset) {
      warnings.warn(
        "BOX_SHADOW_INSET_UNSUPPORTED",
        "Inset box shadow is not supported in V0.1 and was omitted",
        nodeId,
      );
      node.effects = [];
    } else {
      const dropShadow: DropShadowEffect = {
        type: "DROP_SHADOW",
        color: toFigmaRgba(firstShadow.color),
        offset: { x: firstShadow.offsetX, y: firstShadow.offsetY },
        radius: firstShadow.blurRadius,
        spread: firstShadow.spreadRadius,
        visible: true,
        blendMode: "NORMAL",
      };
      node.effects = [dropShadow];

      if (style.boxShadows.length > 1) {
        warnings.warn(
          "MULTIPLE_BOX_SHADOWS_APPROXIMATED",
          `Only the first of ${style.boxShadows.length} box shadows was rendered in V0.1`,
          nodeId,
        );
      }
    }
  } else {
    node.effects = [];
  }
}
