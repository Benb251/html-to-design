/// <reference types="@figma/plugin-typings" />
import {
  normalizeDesignDocument,
  type DesignNode,
  type FrameNode as SchemaFrameNode,
  type Transform2D,
  type VersionedDesignDocument,
} from "@web2design/design-schema";
import { toFigmaSolidPaint } from "./colors.js";
import { FontManager } from "./fonts.js";
import {
  calculateNodePlacement,
  calculateRootPlacement,
  type CalculatedPlacement,
} from "./geometry.js";
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

function applyFrameClipping(
  frame: FrameNode,
  schema: SchemaFrameNode,
  warnings: WarningCollector,
): void {
  const clip = schema.clip;
  if (!clip || (!clip.x && !clip.y)) {
    frame.clipsContent = false;
    return;
  }

  if (clip.x && clip.y) {
    frame.clipsContent = true;
    return;
  }

  // Single-axis clipping: approximated with both-axis clipsContent=true
  frame.clipsContent = true;
  warnings.warn(
    "AXIS_CLIP_APPROXIMATED",
    `Single-axis clipping (clipX=${clip.x}, clipY=${clip.y}) on node '${schema.id}' is approximated by native Figma FrameNode.clipsContent=true on both axes.`,
    schema.id,
  );
}

function applyPlacementToNode(
  node: SceneNode & {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    relativeTransform?: Transform;
    rescale?(scale: number): void;
    resize(w: number, h: number): void;
  },
  placement: CalculatedPlacement,
  warnings: WarningCollector,
  nodeId: string,
): void {
  // 1. Initial size based on base layout bounds
  node.resize(Math.max(0.01, placement.width), Math.max(0.01, placement.height));

  // 2. Position and transform
  if (placement.relativeTransform) {
    node.relativeTransform = placement.relativeTransform;
  } else {
    node.x = placement.x;
    node.y = placement.y;
    if (placement.rotation !== undefined && "rotation" in node) {
      node.rotation = placement.rotation;
    }
  }

  // 3. Scaling
  if (placement.scale) {
    const isUniform = Math.abs(placement.scale.x - placement.scale.y) < 1e-4;
    const isNegative =
      placement.isReflection ||
      placement.scale.x < 0 ||
      placement.scale.y < 0;

    if (isNegative) {
      warnings.warn(
        "TRANSFORM_REFLECTION_UNSUPPORTED",
        `CSS transform negative scale (reflection/mirror) on node '${nodeId}' is unsupported in Figma scene nodes.`,
        nodeId,
      );
    } else if (placement.isSkew) {
      warnings.warn(
        "TRANSFORM_SKEW_APPROXIMATED",
        `CSS skew transform on node '${nodeId}' is approximated; non-orthogonal axes are not natively representable in Figma relativeTransform.`,
        nodeId,
      );
    } else if (Math.abs(placement.scale.x - 1) > 1e-4 || Math.abs(placement.scale.y - 1) > 1e-4) {
      if (isUniform) {
        if (typeof node.rescale === "function") {
          node.rescale(placement.scale.x);
        } else {
          node.resize(
            Math.max(0.01, node.width * placement.scale.x),
            Math.max(0.01, node.height * placement.scale.y),
          );
        }
      } else {
        node.resize(
          Math.max(0.01, node.width * placement.scale.x),
          Math.max(0.01, node.height * placement.scale.y),
        );
        warnings.warn(
          "TRANSFORM_SCALE_APPROXIMATED",
          `Non-uniform CSS scale (scaleX=${placement.scale.x}, scaleY=${placement.scale.y}) on node '${nodeId}' was approximated by resizing node dimensions.`,
          nodeId,
        );
      }
    }
  }

  if (placement.isNestedApproximated) {
    warnings.warn(
      "TRANSFORM_NESTED_APPROXIMATED",
      `Nested transform hierarchy on node '${nodeId}' inside transformed parent was approximated.`,
      nodeId,
    );
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
  applyFrameClipping(rootFrame, rootSchema, warnings);

  // Root placement centered in viewport
  const viewportCenter = options?.viewportCenter ?? host.getViewportCenter?.();
  const placement = calculateRootPlacement(
    { width: rootSchema.width, height: rootSchema.height },
    viewportCenter,
  );
  rootFrame.x = placement.x;
  rootFrame.y = placement.y;

  if (rootSchema.transform?.matrix) {
    const { a, b } = rootSchema.transform.matrix;
    const rot = Math.atan2(-b, a) * (180 / Math.PI);
    if (Math.abs(rot) > 1e-3 && "rotation" in rootFrame) {
      (rootFrame as unknown as { rotation?: number }).rotation = rot;
    }
  }

  applyVisualStyle(rootFrame, rootSchema.style, rootSchema.opacity, warnings, rootSchema.id, {
    width: rootSchema.width,
    height: rootSchema.height,
  });
  tagPluginData(rootFrame, rootSchema);
  rootFrame.setPluginData("web2design:schemaVersion", rawDocument.schemaVersion);

  createdNodeCount++;

  try {
    // 2. Render children recursively
    interface TransformContext {
      transform: Transform2D;
      offsetX: number;
      offsetY: number;
    }

    async function renderChildren(
      parentSchema: SchemaFrameNode,
      parentFigma: FrameNode,
      context?: TransformContext,
    ): Promise<void> {
      for (const childSchema of parentSchema.children) {
        try {
          const activeTransform = context?.transform ?? parentSchema.transform;
          const activeOffset = context ? { x: context.offsetX, y: context.offsetY } : undefined;
          const childPlacement = calculateNodePlacement(
            childSchema,
            parentSchema,
            childSchema.transform,
            activeTransform,
            activeOffset,
          );

          switch (childSchema.type) {
            case "frame": {
              const frame = host.createFrame();
              frame.name = deriveNodeName(childSchema);
              frame.layoutMode = "NONE";
              applyFrameClipping(frame, childSchema, warnings);
              applyPlacementToNode(
                frame as unknown as Parameters<typeof applyPlacementToNode>[0],
                childPlacement,
                warnings,
                childSchema.id,
              );

              applyVisualStyle(
                frame,
                childSchema.style,
                childSchema.opacity,
                warnings,
                childSchema.id,
                { width: childPlacement.width, height: childPlacement.height },
              );
              tagPluginData(frame, childSchema);

              createdNodeCount++;
              parentFigma.appendChild(frame);

              // Recurse descendants with updated transform context
              let nextContext: TransformContext | undefined;
              if (childSchema.transform) {
                nextContext = {
                  transform: childSchema.transform,
                  offsetX: 0,
                  offsetY: 0,
                };
              } else if (context || parentSchema.transform) {
                const baseTrans = context?.transform ?? parentSchema.transform!;
                const baseOffX = (context?.offsetX ?? 0) + childPlacement.x;
                const baseOffY = (context?.offsetY ?? 0) + childPlacement.y;
                nextContext = {
                  transform: baseTrans,
                  offsetX: baseOffX,
                  offsetY: baseOffY,
                };
              }

              await renderChildren(childSchema, frame, nextContext);
              break;
            }

            case "rectangle": {
              const rect = host.createRectangle();
              rect.name = deriveNodeName(childSchema);
              applyPlacementToNode(
                rect as unknown as Parameters<typeof applyPlacementToNode>[0],
                childPlacement,
                warnings,
                childSchema.id,
              );

              applyVisualStyle(
                rect,
                childSchema.style,
                childSchema.opacity,
                warnings,
                childSchema.id,
                { width: childPlacement.width, height: childPlacement.height },
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

              applyPlacementToNode(
                textNode as unknown as Parameters<typeof applyPlacementToNode>[0],
                childPlacement,
                warnings,
                childSchema.id,
              );

              if (childPlacement.width > 0 && childPlacement.height > 0) {
                textNode.textAutoResize = "NONE";
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
              applyPlacementToNode(
                imageRect as unknown as Parameters<typeof applyPlacementToNode>[0],
                childPlacement,
                warnings,
                childSchema.id,
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
                applyPlacementToNode(
                  placeholder as unknown as Parameters<typeof applyPlacementToNode>[0],
                  childPlacement,
                  warnings,
                  childSchema.id,
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
              applyPlacementToNode(
                svgSceneNode as unknown as Parameters<typeof applyPlacementToNode>[0],
                childPlacement,
                warnings,
                childSchema.id,
              );
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
