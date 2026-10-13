import { z } from "zod";
import { TextStyleSchema, VisualStyleSchemaV01, VisualStyleSchemaV02 } from "./style.js";
import type { TextStyle, VisualStyle } from "./style.js";

interface BaseNode {
  id: string;
  sourceTag?: string | undefined;
  name?: string | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  style?: VisualStyle | undefined;
}

export interface FrameNode extends BaseNode {
  type: "frame";
  children: DesignNode[];
}

export interface TextNode extends BaseNode {
  type: "text";
  children: [];
  characters: string;
  textStyle: TextStyle;
}

export interface RectangleNode extends BaseNode {
  type: "rectangle";
  children: [];
}

export interface ImageNode extends BaseNode {
  type: "image";
  children: [];
  assetId: string;
  fit?: "fill" | "contain" | "cover" | "none" | "scale-down" | undefined;
}

interface SvgNodeBase extends BaseNode {
  type: "svg";
  children: [];
}

export type SvgNode = SvgNodeBase & (
  | { inlineSvg: string; assetId?: string | undefined }
  | { assetId: string; inlineSvg?: string | undefined }
);

export type DesignNode = FrameNode | TextNode | RectangleNode | ImageNode | SvgNode;

function createBaseNodeShape<S extends z.ZodTypeAny>(styleSchema: S) {
  return {
    id: z.string().min(1),
    sourceTag: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
    visible: z.boolean(),
    opacity: z.number().min(0).max(1),
    style: styleSchema.optional(),
  };
}

export function createNodeSchemas<S extends z.ZodTypeAny>(styleSchema: S) {
  const baseShape = createBaseNodeShape(styleSchema);

  const textNodeSchema = z.strictObject({
    ...baseShape,
    type: z.literal("text"),
    children: z.tuple([]),
    characters: z.string(),
    textStyle: TextStyleSchema,
  });

  const rectangleNodeSchema = z.strictObject({
    ...baseShape,
    type: z.literal("rectangle"),
    children: z.tuple([]),
  });

  const imageNodeSchema = z.strictObject({
    ...baseShape,
    type: z.literal("image"),
    children: z.tuple([]),
    assetId: z.string().min(1),
    fit: z.enum(["fill", "contain", "cover", "none", "scale-down"]).optional(),
  });

  const svgNodeSchema = z.union([
    z.strictObject({
      ...baseShape,
      type: z.literal("svg"),
      children: z.tuple([]),
      inlineSvg: z.string().min(1),
      assetId: z.string().min(1).optional(),
    }),
    z.strictObject({
      ...baseShape,
      type: z.literal("svg"),
      children: z.tuple([]),
      inlineSvg: z.string().min(1).optional(),
      assetId: z.string().min(1),
    }),
  ]);

  const frameNodeSchema: z.ZodType<FrameNode> = z.strictObject({
    ...baseShape,
    type: z.literal("frame"),
    children: z.lazy(() => z.array(designNodeSchema)),
  }) as unknown as z.ZodType<FrameNode>;

  const designNodeSchema: z.ZodType<DesignNode> = z.lazy(() =>
    z.union([
      frameNodeSchema,
      textNodeSchema,
      rectangleNodeSchema,
      imageNodeSchema,
      svgNodeSchema,
    ]),
  ) as unknown as z.ZodType<DesignNode>;

  return {
    frameNodeSchema,
    textNodeSchema,
    rectangleNodeSchema,
    imageNodeSchema,
    svgNodeSchema,
    designNodeSchema,
  };
}

const v01Schemas = createNodeSchemas(VisualStyleSchemaV01);
export const FrameNodeSchemaV01 = v01Schemas.frameNodeSchema;
export const DesignNodeSchemaV01 = v01Schemas.designNodeSchema;

const v02Schemas = createNodeSchemas(VisualStyleSchemaV02);
export const FrameNodeSchemaV02: z.ZodType<FrameNode> = v02Schemas.frameNodeSchema;
export const TextNodeSchema: z.ZodType<TextNode> = v02Schemas.textNodeSchema;
export const RectangleNodeSchema: z.ZodType<RectangleNode> = v02Schemas.rectangleNodeSchema;
export const ImageNodeSchema: z.ZodType<ImageNode> = v02Schemas.imageNodeSchema;
export const SvgNodeSchema: z.ZodType<SvgNode> = v02Schemas.svgNodeSchema;
export const FrameNodeSchema: z.ZodType<FrameNode> = FrameNodeSchemaV02;
export const DesignNodeSchema: z.ZodType<DesignNode> = v02Schemas.designNodeSchema;
