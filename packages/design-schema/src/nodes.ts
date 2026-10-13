import { z } from "zod";
import { TextStyleSchema, VisualStyleSchema } from "./style.js";
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

const baseNodeShape = {
  id: z.string().min(1),
  sourceTag: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  style: VisualStyleSchema.optional(),
};

export const FrameNodeSchema: z.ZodType<FrameNode> = z.strictObject({
  ...baseNodeShape,
  type: z.literal("frame"),
  children: z.lazy(() => z.array(DesignNodeSchema)),
});

export const TextNodeSchema: z.ZodType<TextNode> = z.strictObject({
  ...baseNodeShape,
  type: z.literal("text"),
  children: z.tuple([]),
  characters: z.string(),
  textStyle: TextStyleSchema,
});

export const RectangleNodeSchema: z.ZodType<RectangleNode> = z.strictObject({
  ...baseNodeShape,
  type: z.literal("rectangle"),
  children: z.tuple([]),
});

export const ImageNodeSchema: z.ZodType<ImageNode> = z.strictObject({
  ...baseNodeShape,
  type: z.literal("image"),
  children: z.tuple([]),
  assetId: z.string().min(1),
  fit: z.enum(["fill", "contain", "cover", "none", "scale-down"]).optional(),
});

export const SvgNodeSchema: z.ZodType<SvgNode> = z.union([
  z.strictObject({
    ...baseNodeShape,
    type: z.literal("svg"),
    children: z.tuple([]),
    inlineSvg: z.string().min(1),
    assetId: z.string().min(1).optional(),
  }),
  z.strictObject({
    ...baseNodeShape,
    type: z.literal("svg"),
    children: z.tuple([]),
    inlineSvg: z.string().min(1).optional(),
    assetId: z.string().min(1),
  }),
]);

export const DesignNodeSchema: z.ZodType<DesignNode> = z.lazy(() =>
  z.union([
    FrameNodeSchema,
    TextNodeSchema,
    RectangleNodeSchema,
    ImageNodeSchema,
    SvgNodeSchema,
  ]),
);

