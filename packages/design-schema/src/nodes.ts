import { z } from "zod";
import { TextStyleSchema, VisualStyleSchemaV01, VisualStyleSchemaV02, VisualStyleSchemaV03 } from "./style.js";
import type { TextStyle, VisualStyle } from "./style.js";

export const TransformMatrix2DSchema = z.strictObject({
  a: z.number().finite(),
  b: z.number().finite(),
  c: z.number().finite(),
  d: z.number().finite(),
  e: z.number().finite(),
  f: z.number().finite(),
});

export const TransformOriginSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const BaseBoundsSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});

export const Transform2DSchema = z.strictObject({
  matrix: TransformMatrix2DSchema,
  origin: TransformOriginSchema,
  baseBounds: BaseBoundsSchema,
});

export type TransformMatrix2D = z.infer<typeof TransformMatrix2DSchema>;
export type TransformOrigin = z.infer<typeof TransformOriginSchema>;
export type BaseBounds = z.infer<typeof BaseBoundsSchema>;
export type Transform2D = z.infer<typeof Transform2DSchema>;

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
  transform?: Transform2D | undefined;
}

export const ClipBehaviorSchema = z.strictObject({
  x: z.boolean(),
  y: z.boolean(),
});

export type ClipBehavior = z.infer<typeof ClipBehaviorSchema>;

export interface FrameNode extends BaseNode {
  type: "frame";
  clip?: ClipBehavior | undefined;
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

function createBaseNodeShape<S extends z.ZodTypeAny>(styleSchema: S, allowTransform: boolean = false) {
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
    ...(allowTransform ? { transform: Transform2DSchema.optional() } : {}),
  };
}

export function createNodeSchemas<S extends z.ZodTypeAny>(
  styleSchema: S,
  allowClip: boolean = false,
  allowTransform: boolean = false,
) {
  const baseShape = createBaseNodeShape(styleSchema, allowTransform);

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

  const frameShape = allowClip
    ? {
        ...baseShape,
        type: z.literal("frame"),
        clip: ClipBehaviorSchema.optional(),
        children: z.lazy(() => z.array(designNodeSchema)),
      }
    : {
        ...baseShape,
        type: z.literal("frame"),
        children: z.lazy(() => z.array(designNodeSchema)),
      };

  const frameNodeSchema: z.ZodType<FrameNode> = z.strictObject(frameShape) as unknown as z.ZodType<FrameNode>;

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

const v01Schemas = createNodeSchemas(VisualStyleSchemaV01, false, false);
export const FrameNodeSchemaV01 = v01Schemas.frameNodeSchema;
export const DesignNodeSchemaV01 = v01Schemas.designNodeSchema;

const v02Schemas = createNodeSchemas(VisualStyleSchemaV02, false, false);
export const FrameNodeSchemaV02: z.ZodType<FrameNode> = v02Schemas.frameNodeSchema;
export const DesignNodeSchemaV02: z.ZodType<DesignNode> = v02Schemas.designNodeSchema;

const v03Schemas = createNodeSchemas(VisualStyleSchemaV03, false, false);
export const FrameNodeSchemaV03: z.ZodType<FrameNode> = v03Schemas.frameNodeSchema;
export const DesignNodeSchemaV03: z.ZodType<DesignNode> = v03Schemas.designNodeSchema;

const v04Schemas = createNodeSchemas(VisualStyleSchemaV03, true, false);
export const FrameNodeSchemaV04: z.ZodType<FrameNode> = v04Schemas.frameNodeSchema;
export const DesignNodeSchemaV04: z.ZodType<DesignNode> = v04Schemas.designNodeSchema;

const v05Schemas = createNodeSchemas(VisualStyleSchemaV03, true, true);
export const FrameNodeSchemaV05: z.ZodType<FrameNode> = v05Schemas.frameNodeSchema;
export const DesignNodeSchemaV05: z.ZodType<DesignNode> = v05Schemas.designNodeSchema;

export const TextNodeSchema: z.ZodType<TextNode> = v05Schemas.textNodeSchema as unknown as z.ZodType<TextNode>;
export const RectangleNodeSchema: z.ZodType<RectangleNode> = v05Schemas.rectangleNodeSchema as unknown as z.ZodType<RectangleNode>;
export const ImageNodeSchema: z.ZodType<ImageNode> = v05Schemas.imageNodeSchema as unknown as z.ZodType<ImageNode>;
export const SvgNodeSchema: z.ZodType<SvgNode> = v05Schemas.svgNodeSchema as unknown as z.ZodType<SvgNode>;
export const FrameNodeSchema: z.ZodType<FrameNode> = FrameNodeSchemaV05;
export const DesignNodeSchema: z.ZodType<DesignNode> = v05Schemas.designNodeSchema;
