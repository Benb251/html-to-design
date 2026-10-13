/// <reference types="@figma/plugin-typings" />
import type { AssetRecord, ImageNode } from "@web2design/design-schema";
import type { FigmaRendererHost } from "./types.js";
import type { WarningCollector } from "./warnings.js";

export function resolveImageScaleMode(
  fit: ImageNode["fit"],
  warnings: WarningCollector,
  nodeId: string,
): ImagePaint["scaleMode"] {
  switch (fit) {
    case "contain":
      return "FIT";
    case "cover":
      return "FILL";
    case "fill":
      warnings.warn(
        "OBJECT_FIT_APPROXIMATED",
        "CSS 'object-fit: fill' approximated with Figma 'FILL' scale mode",
        nodeId,
      );
      return "FILL";
    case "none":
    case "scale-down":
      warnings.warn(
        "OBJECT_FIT_APPROXIMATED",
        `CSS 'object-fit: ${fit}' approximated with Figma 'FIT' scale mode`,
        nodeId,
      );
      return "FIT";
    default:
      return "FILL";
  }
}

export async function createFigmaImageFill(
  asset: AssetRecord,
  scaleMode: ImagePaint["scaleMode"],
  host: FigmaRendererHost,
  warnings: WarningCollector,
  nodeId: string,
): Promise<ImagePaint | null> {
  try {
    let image: Image;

    if (asset.source.type === "url") {
      image = await host.createImageAsync(asset.source.url);
    } else if (asset.source.type === "data-url") {
      const parts = asset.source.dataUrl.split(",");
      const base64Data = parts[1];
      if (!base64Data) {
        throw new Error("Invalid data URL payload");
      }
      const bytes = host.base64Decode(base64Data);
      image = host.createImage(bytes);
    } else if (asset.source.type === "embedded") {
      const bytes = host.base64Decode(asset.source.data);
      image = host.createImage(bytes);
    } else {
      throw new Error("Unsupported asset source type");
    }

    return {
      type: "IMAGE",
      imageHash: image.hash,
      scaleMode,
    };
  } catch (err) {
    warnings.warn(
      "IMAGE_LOAD_FAILED",
      `Failed to load image asset '${asset.id}': ${err instanceof Error ? err.message : String(err)}`,
      nodeId,
      asset.id,
    );
    return null;
  }
}
