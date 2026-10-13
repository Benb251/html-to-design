/// <reference types="@figma/plugin-typings" />
import type { SvgNode } from "@web2design/design-schema";
import type { FigmaRendererHost } from "./types.js";
import type { WarningCollector } from "./warnings.js";

export function renderSvgNode(
  svgNode: SvgNode,
  svgContent: string,
  host: FigmaRendererHost,
  warnings: WarningCollector,
): FrameNode | RectangleNode {
  try {
    const frame = host.createNodeFromSvg(svgContent);

    // Check aspect ratio differences
    if (frame.width > 0 && frame.height > 0 && svgNode.width > 0 && svgNode.height > 0) {
      const naturalAspect = frame.width / frame.height;
      const targetAspect = svgNode.width / svgNode.height;
      const aspectDifference = Math.abs(naturalAspect - targetAspect) / targetAspect;

      if (aspectDifference > 0.05) {
        warnings.warn(
          "SVG_ASPECT_APPROXIMATED",
          `SVG aspect ratio (${naturalAspect.toFixed(2)}) differed from captured box (${targetAspect.toFixed(2)}); scaled to captured dimensions`,
          svgNode.id,
        );
      }
    }

    if (svgNode.width > 0 && svgNode.height > 0) {
      frame.resize(svgNode.width, svgNode.height);
    }

    return frame;
  } catch (err) {
    warnings.warn(
      "SVG_IMPORT_FAILED",
      `Native SVG import failed: ${err instanceof Error ? err.message : String(err)}`,
      svgNode.id,
      svgNode.assetId,
    );

    // Fallback placeholder rectangle
    const placeholder = host.createRectangle();
    placeholder.resize(Math.max(1, svgNode.width), Math.max(1, svgNode.height));
    placeholder.fills = [
      {
        type: "SOLID",
        color: { r: 0.94, g: 0.94, b: 0.94 },
        opacity: 0.8,
      },
    ];
    placeholder.strokes = [
      {
        type: "SOLID",
        color: { r: 0.8, g: 0.8, b: 0.8 },
        opacity: 1,
      },
    ];
    placeholder.strokeWeight = 1;
    return placeholder;
  }
}
