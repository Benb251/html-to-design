/// <reference types="@figma/plugin-typings" />
import {
  normalizeDesignDocument,
  type DesignNode,
  type FrameNode as SchemaFrameNode,
  type VersionedDesignDocument,
} from "@web2design/design-schema";
import { toFigmaSolidPaint } from "./colors.js";
import { FontManager } from "./fonts.js";
import { calculateLocalCoordinates, calculateRootPlacement } from "./geometry.js";
import { createFigmaImageFill, resolveImageScaleMode } from "./images.js";
import { applyVisualStyle } from "./styles.js";
import { renderSvgNode } from "./svg.js";
import type { FigmaRendererHost, RenderOptions, RenderResult } from "./types.js";
import { WarningCollector } from "./warnings.js";

export function deriveNodeName(node: DesignNode): string {
  if (node.name && node.name.trim().length > 0) {
    return node.name.trim();
  }
  if (node.type === "text") {
    const preview = node.characters.replace(/\s+/g, " ").trim();
    const truncated = preview.length > 24 ? `${preview.slice(0, 24)}…` : preview;
    return truncated.length > 0 ? `Text — "${truncated}"` : "Text";
  }
  if (node.type === "image") {
    return node.sourceTag ? `Image (${node.sourceTag})` : "Image";
  }
  if (node.type === "svg") {
    return node.sourceTag ? `SVG (${node.sourceTag})` : "SVG";
  }
  if (node.sourceTag) {
    return node.sourceTag;
  }
  if (node.type === "frame") {
    return "Frame";
  }
  return "Rectangle";
}

function tagPluginData(figmaNode: SceneNode, schemaNode: DesignNode): void {
  figmaNode.setPluginData("web2design:id", schemaNode.id);
  figmaNode.setPluginData("web2design:type", schemaNode.type);
  if (schemaNode.sourceTag) {
    figmaNode.setPluginData("web2design:sourceTag", schemaNode.sourceTag);
  }
}

export async function renderDesignDocument(
  rawDocument: VersionedDesignDocument,
  host: FigmaRendererHost,
  options?: RenderOptions,
): Promise<RenderResult> {
  const document = normalizeDesignDocument(rawDocument);
  const warnings = new WarningCollector();
  const fontManager = new FontManager(host, options?.defaultFont);
  await fontManager.init();

  let createdNodeCount = 0;
  let skippedNodeCount = 0;

  // 1. Create root frame
  const rootSchema = document.root;
  const rootFrame = host.createFrame();

  const pageTitle = document.capture.page?.title || document.capture.page?.url;
  rootFrame.name = pageTitle ? `Web2Design — ${pageTitle}` : "Web2Design — Page";

  rootFrame.resize(Math.max(1, rootSchema.width), Math.max(1, rootSchema.height));
  rootFrame.layoutMode = "NONE";

  // Root placement centered in viewport
  const viewportCenter = options?.viewportCenter ?? host.getViewportCenter?.();
  const placement = calculateRootPlacement(
    { width: rootSchema.width, height: rootSchema.height },
    viewportCenter,
  );
  rootFrame.x = placement.x;
  rootFrame.y = placement.y;

  applyVisualStyle(rootFrame, rootSchema.style, rootSchema.opacity, warnings, rootSchema.id, {
    width: rootSchema.width,
    height: rootSchema.height,
  });
  tagPluginData(rootFrame, rootSchema);
  rootFrame.setPluginData("web2design:schemaVersion", rawDocument.schemaVersion);

  createdNodeCount++;

  try {
    // 2. Render children recursively
    async function renderChildren(
      parentSchema: SchemaFrameNode,
      parentFigma: FrameNode,
    ): Promise<void> {
      for (const childSchema of parentSchema.children) {
        try {
          const localCoords = calculateLocalCoordinates(childSchema, parentSchema);

          switch (childSchema.type) {
            case "frame": {
              const frame = host.createFrame();
              frame.name = deriveNodeName(childSchema);
              frame.x = localCoords.x;
              frame.y = localCoords.y;
              frame.resize(Math.max(0.01, childSchema.width), Math.max(0.01, childSchema.height));
              frame.layoutMode = "NONE";

              applyVisualStyle(
                frame,
                childSchema.style,
                childSchema.opacity,
                warnings,
                childSchema.id,
                { width: childSchema.width, height: childSchema.height },
              );
              tagPluginData(frame, childSchema);

              createdNodeCount++;
              parentFigma.appendChild(frame);

              // Recurse descendants
              await renderChildren(childSchema, frame);
              break;
            }

            case "rectangle": {
              const rect = host.createRectangle();
              rect.name = deriveNodeName(childSchema);
              rect.x = localCoords.x;
              rect.y = localCoords.y;
              rect.resize(Math.max(0.01, childSchema.width), Math.max(0.01, childSchema.height));

              applyVisualStyle(
                rect,
                childSchema.style,
                childSchema.opacity,
                warnings,
                childSchema.id,
                { width: childSchema.width, height: childSchema.height },
              );
              tagPluginData(rect, childSchema);

              createdNodeCount++;
              parentFigma.appendChild(rect);
              break;
            }

            case "text": {
              const textNode = host.createText();
              textNode.name = deriveNodeName(childSchema);

              const fontName = await fontManager.resolveAndLoadFont(
                childSchema.textStyle,
                warnings,
                childSchema.id,
              );
              textNode.fontName = fontName;
              textNode.characters = childSchema.characters;
              textNode.fontSize = childSchema.textStyle.fontSize;
              textNode.lineHeight = {
                value: childSchema.textStyle.lineHeight,
                unit: "PIXELS",
              };
              textNode.letterSpacing = {
                value: childSchema.textStyle.letterSpacing,
                unit: "PIXELS",
              };

              switch (childSchema.textStyle.textAlign) {
                case "center":
                  textNode.textAlignHorizontal = "CENTER";
                  break;
                case "right":
                case "end":
                  textNode.textAlignHorizontal = "RIGHT";
                  break;
                case "justify":
                  textNode.textAlignHorizontal = "JUSTIFIED";
                  break;
                case "left":
                case "start":
                default:
                  textNode.textAlignHorizontal = "LEFT";
                  break;
              }

              textNode.fills = [toFigmaSolidPaint(childSchema.textStyle.color)];
              textNode.opacity = Math.max(0, Math.min(1, childSchema.opacity));

              textNode.x = localCoords.x;
              textNode.y = localCoords.y;

              if (childSchema.width > 0 && childSchema.height > 0) {
                textNode.textAutoResize = "NONE";
                textNode.resize(childSchema.width, childSchema.height);
              } else {
                textNode.textAutoResize = "WIDTH_AND_HEIGHT";
              }

              tagPluginData(textNode, childSchema);

              createdNodeCount++;
              parentFigma.appendChild(textNode);
              break;
            }

            case "image": {
              const imageRect = host.createRectangle();
              imageRect.name = deriveNodeName(childSchema);
              imageRect.x = localCoords.x;
              imageRect.y = localCoords.y;
              imageRect.resize(
                Math.max(0.01, childSchema.width),
                Math.max(0.01, childSchema.height),
              );

              applyVisualStyle(
                imageRect,
                childSchema.style,
                childSchema.opacity,
                warnings,
                childSchema.id,
              );

              const asset = document.assets.find((a) => a.id === childSchema.assetId);
              if (asset) {
                const scaleMode = resolveImageScaleMode(childSchema.fit, warnings, childSchema.id);
                const imageFill = await createFigmaImageFill(
                  asset,
                  scaleMode,
                  host,
                  warnings,
                  childSchema.id,
                );
                if (imageFill) {
                  imageRect.fills = [imageFill];
                } else {
                  // Fallback gray fill
                  imageRect.fills = [
                    {
                      type: "SOLID",
                      color: { r: 0.9, g: 0.9, b: 0.9 },
                      opacity: 1,
                    },
                  ];
                }
              } else {
                warnings.warn(
                  "IMAGE_ASSET_MISSING",
                  `Referenced image asset '${childSchema.assetId}' was not found in document assets`,
                  childSchema.id,
                  childSchema.assetId,
                );
                imageRect.fills = [
                  {
                    type: "SOLID",
                    color: { r: 0.9, g: 0.9, b: 0.9 },
                    opacity: 1,
                  },
                ];
              }

              tagPluginData(imageRect, childSchema);

              createdNodeCount++;
              parentFigma.appendChild(imageRect);
              break;
            }

            case "svg": {
              let svgMarkup = childSchema.inlineSvg;
              if (!svgMarkup && childSchema.assetId) {
                const svgAsset = document.assets.find((a) => a.id === childSchema.assetId);
                if (svgAsset && svgAsset.source.type === "data-url") {
                  try {
                    const encoded = svgAsset.source.dataUrl.split(",")[1];
                    if (encoded) {
                      svgMarkup = decodeURIComponent(encoded);
                    }
                  } catch {
                    // Ignore decode failure
                  }
                }
              }

              if (!svgMarkup) {
                warnings.warn(
                  "SVG_CONTENT_MISSING",
                  "SVG node has neither inlineSvg markup nor decodable asset data",
                  childSchema.id,
                  childSchema.assetId,
                );
                // Create rectangle placeholder
                const placeholder = host.createRectangle();
                placeholder.name = deriveNodeName(childSchema);
                placeholder.x = localCoords.x;
                placeholder.y = localCoords.y;
                placeholder.resize(
                  Math.max(0.01, childSchema.width),
                  Math.max(0.01, childSchema.height),
                );
                placeholder.fills = [
                  {
                    type: "SOLID",
                    color: { r: 0.94, g: 0.94, b: 0.94 },
                    opacity: 1,
                  },
                ];
                tagPluginData(placeholder, childSchema);
                createdNodeCount++;
                parentFigma.appendChild(placeholder);
                break;
              }

              const svgSceneNode = renderSvgNode(childSchema, svgMarkup, host, warnings);
              svgSceneNode.name = deriveNodeName(childSchema);
              svgSceneNode.x = localCoords.x;
              svgSceneNode.y = localCoords.y;
              svgSceneNode.opacity = Math.max(0, Math.min(1, childSchema.opacity));

              tagPluginData(svgSceneNode, childSchema);

              createdNodeCount++;
              parentFigma.appendChild(svgSceneNode);
              break;
            }

            default: {
              warnings.warn(
                "UNSUPPORTED_NODE_KIND",
                `Unsupported node kind '${(childSchema as DesignNode).type}' skipped`,
                (childSchema as DesignNode).id,
              );
              skippedNodeCount++;
              break;
            }
          }
        } catch (childErr) {
          warnings.warn(
            "CHILD_RENDER_FAILED",
            `Failed to render child node '${childSchema.id}': ${childErr instanceof Error ? childErr.message : String(childErr)}`,
            childSchema.id,
          );
          skippedNodeCount++;
        }
      }
    }

    await renderChildren(rootSchema, rootFrame);

    // 3. Append to canvas and set viewport/selection
    host.appendRoot(rootFrame);
    host.setSelection?.([rootFrame]);
    host.scrollAndZoomIntoView?.([rootFrame]);

    return {
      rootNodeId: rootFrame.id,
      createdNodeCount,
      skippedNodeCount,
      warnings: warnings.getWarnings(),
    };
  } catch (fatalErr) {
    // Transactional rollback on fatal error
    if ("remove" in rootFrame && typeof rootFrame.remove === "function") {
      try {
        rootFrame.remove();
      } catch {
        // Ignore secondary error during rollback
      }
    }
    throw fatalErr;
  }
}
