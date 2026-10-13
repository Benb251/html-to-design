/// <reference types="@figma/plugin-typings" />
import type {
  NormalizedFill,
  NormalizedImage,
  NormalizedRadius,
  NormalizedRenderedNode,
  NormalizedShadow,
  NormalizedStroke,
  NormalizedSvg,
  NormalizedText,
} from "./types.js";

function round4(val: number): number {
  const rounded = Math.round(val * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeRenderedTree(
  root: FrameNode,
  rootDocX: number = 0,
  rootDocY: number = 0,
): NormalizedRenderedNode {
  return normalizeNode(root, rootDocX, rootDocY, true, rootDocX, rootDocY);
}

function normalizeNode(
  node: SceneNode,
  parentAbsoluteX: number,
  parentAbsoluteY: number,
  isRoot: boolean,
  rootDocX: number,
  rootDocY: number,
): NormalizedRenderedNode {
  const getPluginData = (k: string): string => {
    if ("getPluginData" in node && typeof node.getPluginData === "function") {
      return node.getPluginData(k);
    }
    return "";
  };

  const sourceId = getPluginData("web2design:id") || undefined;
  const sourceType = getPluginData("web2design:type") || undefined;
  const sourceTag = getPluginData("web2design:sourceTag") || undefined;

  const localX = "x" in node ? (node as LayoutMixin).x : 0;
  const localY = "y" in node ? (node as LayoutMixin).y : 0;
  const width = "width" in node ? (node as LayoutMixin).width : 0;
  const height = "height" in node ? (node as LayoutMixin).height : 0;

  // Reconstructed global coordinates
  const absoluteX = isRoot ? rootDocX : round4(parentAbsoluteX + localX);
  const absoluteY = isRoot ? rootDocY : round4(parentAbsoluteY + localY);

  const opacity = "opacity" in node ? round4((node as MinimalFillsMixin & { opacity?: number }).opacity ?? 1) : 1;

  // Fills
  let fills: NormalizedFill[] | undefined;
  let imageInfo: NormalizedImage | undefined;
  if ("fills" in node && Array.isArray((node as MinimalFillsMixin).fills)) {
    const rawFills = (node as MinimalFillsMixin).fills as readonly Paint[];
    if (rawFills.length > 0) {
      fills = [];
      for (const paint of rawFills) {
        if (paint.type === "SOLID") {
          fills.push({
            type: "SOLID",
            color: {
              r: round4(paint.color.r),
              g: round4(paint.color.g),
              b: round4(paint.color.b),
              a: round4(paint.opacity ?? 1),
            },
          });
        } else if (paint.type === "IMAGE") {
          const imgFill: NormalizedFill = {
            type: "IMAGE",
            scaleMode: paint.scaleMode,
            imageHash: paint.imageHash ?? undefined,
          };
          fills.push(imgFill);
          imageInfo = {
            scaleMode: paint.scaleMode,
            imageHash: paint.imageHash ?? undefined,
          };
        } else if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL") {
          fills.push({
            type: paint.type,
            gradientStops: paint.gradientStops?.map((s) => ({
              position: round4(s.position),
              color: {
                r: round4(s.color.r),
                g: round4(s.color.g),
                b: round4(s.color.b),
                a: round4(s.color.a),
              },
            })),
            gradientTransform: paint.gradientTransform
              ? [
                  [
                    round4(paint.gradientTransform[0][0]),
                    round4(paint.gradientTransform[0][1]),
                    round4(paint.gradientTransform[0][2]),
                  ],
                  [
                    round4(paint.gradientTransform[1][0]),
                    round4(paint.gradientTransform[1][1]),
                    round4(paint.gradientTransform[1][2]),
                  ],
                ]
              : undefined,
          });
        }
      }
    }
  }

  // Strokes
  let strokes: NormalizedStroke[] | undefined;
  if ("strokes" in node && Array.isArray((node as MinimalStrokesMixin).strokes)) {
interface NodeWithStrokeProperties {
  strokeTopWeight?: number;
  strokeRightWeight?: number;
  strokeBottomWeight?: number;
  strokeLeftWeight?: number;
  dashPattern?: readonly number[];
}

    const rawStrokes = (node as MinimalStrokesMixin).strokes as readonly Paint[];
    const weight = ("strokeWeight" in node && typeof (node as GeometryMixin).strokeWeight === "number")
      ? (node as GeometryMixin).strokeWeight as number
      : 0;
    const sw = node as unknown as NodeWithStrokeProperties;
    const topW = typeof sw.strokeTopWeight === "number" ? sw.strokeTopWeight : weight;
    const rightW = typeof sw.strokeRightWeight === "number" ? sw.strokeRightWeight : weight;
    const bottomW = typeof sw.strokeBottomWeight === "number" ? sw.strokeBottomWeight : weight;
    const leftW = typeof sw.strokeLeftWeight === "number" ? sw.strokeLeftWeight : weight;
    const hasAnyStroke = weight > 0 || topW > 0 || rightW > 0 || bottomW > 0 || leftW > 0;

    if (rawStrokes.length > 0 && hasAnyStroke) {
      strokes = [];
      for (const paint of rawStrokes) {
        if (paint.type === "SOLID") {
          const sObj: NormalizedStroke = {
            color: {
              r: round4(paint.color.r),
              g: round4(paint.color.g),
              b: round4(paint.color.b),
              a: round4(paint.opacity ?? 1),
            },
            width: round4(weight),
          };
          if (topW !== weight || rightW !== weight || bottomW !== weight || leftW !== weight) {
            sObj.topWidth = round4(topW);
            sObj.rightWidth = round4(rightW);
            sObj.bottomWidth = round4(bottomW);
            sObj.leftWidth = round4(leftW);
            if (Array.isArray(sw.dashPattern) && sw.dashPattern.length > 0) {
              sObj.dashPattern = sw.dashPattern.map((p: number) => round4(p));
            }
          }
          strokes.push(sObj);
        }
      }
    }
  }

  // Radius
  let radius: NormalizedRadius | undefined;
  if ("cornerRadius" in node && typeof (node as CornerMixin).cornerRadius === "number") {
    radius = { uniform: round4((node as CornerMixin).cornerRadius as number) };
  } else if ("topLeftRadius" in node) {
    const cornerNode = node as RectangleCornerMixin;
    if (
      cornerNode.topLeftRadius !== undefined ||
      cornerNode.topRightRadius !== undefined ||
      cornerNode.bottomRightRadius !== undefined ||
      cornerNode.bottomLeftRadius !== undefined
    ) {
      radius = {
        topLeft: round4(cornerNode.topLeftRadius ?? 0),
        topRight: round4(cornerNode.topRightRadius ?? 0),
        bottomRight: round4(cornerNode.bottomRightRadius ?? 0),
        bottomLeft: round4(cornerNode.bottomLeftRadius ?? 0),
      };
    }
  }

  // Shadows / Effects
  let effects: NormalizedShadow[] | undefined;
  if ("effects" in node && Array.isArray((node as BlendMixin).effects)) {
    const rawEffects = (node as BlendMixin).effects as readonly Effect[];
    for (const eff of rawEffects) {
      if (eff.type === "DROP_SHADOW" || eff.type === "INNER_SHADOW") {
        if (!effects) effects = [];
        effects.push({
          type: eff.type,
          offsetX: round4(eff.offset.x),
          offsetY: round4(eff.offset.y),
          blurRadius: round4(eff.radius),
          spreadRadius: round4(eff.spread ?? 0),
          color: {
            r: round4(eff.color.r),
            g: round4(eff.color.g),
            b: round4(eff.color.b),
            a: round4(eff.color.a),
          },
        });
      }
    }
  }

  // Text
  let text: NormalizedText | undefined;
  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    const fontName = textNode.fontName as FontName;
    text = {
      characters: textNode.characters,
      fontFamily: fontName.family,
      fontStyle: fontName.style,
      fontSize: round4(textNode.fontSize as number),
      lineHeight:
        typeof textNode.lineHeight === "object" && textNode.lineHeight.unit === "PIXELS"
          ? round4(textNode.lineHeight.value)
          : undefined,
      letterSpacing:
        typeof textNode.letterSpacing === "object" && textNode.letterSpacing.unit === "PIXELS"
          ? round4(textNode.letterSpacing.value)
          : undefined,
      textAlignHorizontal: textNode.textAlignHorizontal,
    };
  }

  // SVG
  let svg: NormalizedSvg | undefined;
  if (sourceType === "svg" || node.name === "SVG Group") {
    svg = { isVectorContainer: true };
  }

  // Children
  let children: NormalizedRenderedNode[] | undefined;
  if (sourceType !== "svg" && "children" in node && Array.isArray((node as ChildrenMixin).children)) {
    const rawChildren = (node as ChildrenMixin).children;
    if (rawChildren.length > 0) {
      children = rawChildren.map((child) =>
        normalizeNode(child, absoluteX, absoluteY, false, rootDocX, rootDocY),
      );
    }
  }

  const result: NormalizedRenderedNode = {
    figmaType: node.type,
    name: node.name,
    x: round4(localX),
    y: round4(localY),
    width: round4(width),
    height: round4(height),
    absoluteX,
    absoluteY,
    opacity,
  };

  if (sourceId) result.sourceId = sourceId;
  if (sourceType) result.sourceType = sourceType;
  if (sourceTag) result.sourceTag = sourceTag;
  if (fills && fills.length > 0) result.fills = fills;
  if (strokes && strokes.length > 0) result.strokes = strokes;
  if (radius) result.radius = radius;
  if (effects && effects.length > 0) result.effects = effects;
  if (text) result.text = text;
  if (imageInfo) result.image = imageInfo;
  if (svg) result.svg = svg;
  if (children && children.length > 0) result.children = children;

  return result;
}
