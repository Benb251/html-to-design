import { z } from "zod";
import { ColorSchema, TextStyleSchema, VisualStyleSchemaV01, VisualStyleSchemaV02, VisualStyleSchemaV03 } from "./style.js";
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

export const TextRunStyleSchema = z.strictObject({
  fontFamily: z.string().min(1).optional(),
  fontFallbacks: z.array(z.string().min(1)).optional(),
  fontSize: z.number().positive().optional(),
  fontWeight: z.number().int().min(1).max(1000).optional(),
  fontStyle: z.enum(["normal", "italic", "oblique"]).optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  color: ColorSchema.optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
});

export type TextRunStyle = z.infer<typeof TextRunStyleSchema>;

export const TextRunSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  style: TextRunStyleSchema,
  hyperlink: z.string().min(1).optional(),
});

export type TextRun = z.infer<typeof TextRunSchema>;

function areRunStylesEqual(s1: TextRunStyle, s2: TextRunStyle): boolean {
  if (s1.fontFamily !== s2.fontFamily) return false;
  if (s1.fontSize !== s2.fontSize) return false;
  if (s1.fontWeight !== s2.fontWeight) return false;
  if (s1.fontStyle !== s2.fontStyle) return false;
  if (s1.lineHeight !== s2.lineHeight) return false;
  if (s1.letterSpacing !== s2.letterSpacing) return false;
  if (s1.textDecoration !== s2.textDecoration) return false;
  if ((s1.color === undefined) !== (s2.color === undefined)) return false;
  if (s1.color && s2.color) {
    if (
      s1.color.r !== s2.color.r ||
      s1.color.g !== s2.color.g ||
      s1.color.b !== s2.color.b ||
      s1.color.a !== s2.color.a
    ) {
      return false;
    }
  }
  const f1 = s1.fontFallbacks ?? [];
  const f2 = s2.fontFallbacks ?? [];
  if (f1.length !== f2.length || !f1.every((v, i) => v === f2[i])) return false;
  return true;
}

export const AutoLayoutPaddingSchema = z.strictObject({
  top: z.number().finite().nonnegative(),
  right: z.number().finite().nonnegative(),
  bottom: z.number().finite().nonnegative(),
  left: z.number().finite().nonnegative(),
});

export const AutoLayoutSchema = z.strictObject({
  type: z.literal("flex"),
  direction: z.enum(["horizontal", "vertical"]),
  gap: z.number().finite().nonnegative(),
  padding: AutoLayoutPaddingSchema,
  primaryAlign: z.enum(["start", "center", "end", "space-between"]),
  crossAlign: z.enum(["start", "center", "end", "stretch"]),
  primarySizing: z.enum(["fixed", "hug"]).optional(),
  crossSizing: z.enum(["fixed", "hug"]).optional(),
  confidence: z.literal("high"),
});

export const AutoLayoutChildSchema = z.strictObject({
  grow: z.boolean().optional(),
  stretch: z.boolean().optional(),
  positioning: z.enum(["auto", "absolute"]).optional(),
});

export type AutoLayoutPadding = z.infer<typeof AutoLayoutPaddingSchema>;
export type AutoLayout = z.infer<typeof AutoLayoutSchema>;
export type AutoLayoutChild = z.infer<typeof AutoLayoutChildSchema>;

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
  layoutChild?: AutoLayoutChild | undefined;
}

export const ClipBehaviorSchema = z.strictObject({
  x: z.boolean(),
  y: z.boolean(),
});

export type ClipBehavior = z.infer<typeof ClipBehaviorSchema>;

export interface FrameNode extends BaseNode {
  type: "frame";
  clip?: ClipBehavior | undefined;
  layout?: AutoLayout | undefined;
  children: DesignNode[];
}

export interface TextNode extends BaseNode {
  type: "text";
  children: [];
  characters: string;
  textStyle: TextStyle;
  runs?: TextRun[] | undefined;
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

function createBaseNodeShape<S extends z.ZodTypeAny>(
  styleSchema: S,
  allowTransform: boolean = false,
  allowLayoutChild: boolean = false,
) {
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
    ...(allowLayoutChild ? { layoutChild: AutoLayoutChildSchema.optional() } : {}),
  };
}

export function createNodeSchemas<S extends z.ZodTypeAny>(
  styleSchema: S,
  allowClip: boolean = false,
  allowTransform: boolean = false,
  allowRuns: boolean = false,
  allowLayout: boolean = false,
) {
  const baseShape = createBaseNodeShape(styleSchema, allowTransform, allowLayout);

  const textBase = {
    ...baseShape,
    type: z.literal("text"),
    children: z.tuple([]),
    characters: z.string(),
    textStyle: TextStyleSchema,
    ...(allowRuns ? { runs: z.array(TextRunSchema).optional() } : {}),
  };

  const textNodeSchema = allowRuns
    ? z.strictObject(textBase).superRefine((data, ctx) => {
        const nodeData = data as unknown as { characters: string; runs?: TextRun[] | undefined };
        const runs = nodeData.runs;
        if (runs !== undefined) {
          if (runs.length === 0 && nodeData.characters.length > 0) {
            ctx.addIssue({
              code: "custom",
              message: "Text runs array cannot be empty when characters are present",
              path: ["runs"],
            });
            return;
          }
          if (runs.length > 0) {
            if (runs[0]!.start !== 0) {
              ctx.addIssue({
                code: "custom",
                message: "First text run must start at offset 0",
                path: ["runs", 0, "start"],
              });
            }
            for (let i = 0; i < runs.length; i++) {
              const run = runs[i]!;
              if (run.start >= run.end) {
                ctx.addIssue({
                  code: "custom",
                  message: `Run start (${run.start}) must be strictly less than run end (${run.end})`,
                  path: ["runs", i, "end"],
                });
              }
              if (run.end > nodeData.characters.length) {
                ctx.addIssue({
                  code: "custom",
                  message: `Run end (${run.end}) exceeds characters length (${nodeData.characters.length})`,
                  path: ["runs", i, "end"],
                });
              }
              if (i > 0) {
                const prev = runs[i - 1]!;
                if (run.start !== prev.end) {
                  ctx.addIssue({
                    code: "custom",
                    message: `Run ${i} start (${run.start}) does not match previous run end (${prev.end}); runs must be contiguous and sorted with no gaps or overlaps`,
                    path: ["runs", i, "start"],
                  });
                } else if (run.hyperlink === prev.hyperlink && areRunStylesEqual(run.style, prev.style)) {
                  ctx.addIssue({
                    code: "custom",
                    message: `Adjacent runs ${i - 1} and ${i} have identical style and hyperlink; they must be merged`,
                    path: ["runs", i],
                  });
                }
              }
            }
            const lastRun = runs[runs.length - 1]!;
            if (lastRun.end !== nodeData.characters.length) {
              ctx.addIssue({
                code: "custom",
                message: `Last text run end (${lastRun.end}) must match characters length (${nodeData.characters.length})`,
                path: ["runs", runs.length - 1, "end"],
              });
            }
          }
        }
      })
    : z.strictObject(textBase);

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

  const frameShape = {
    ...baseShape,
    type: z.literal("frame"),
    ...(allowClip ? { clip: ClipBehaviorSchema.optional() } : {}),
    ...(allowLayout ? { layout: AutoLayoutSchema.optional() } : {}),
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

const v01Schemas = createNodeSchemas(VisualStyleSchemaV01, false, false, false, false);
export const FrameNodeSchemaV01 = v01Schemas.frameNodeSchema;
export const DesignNodeSchemaV01 = v01Schemas.designNodeSchema;

const v02Schemas = createNodeSchemas(VisualStyleSchemaV02, false, false, false, false);
export const FrameNodeSchemaV02: z.ZodType<FrameNode> = v02Schemas.frameNodeSchema;
export const DesignNodeSchemaV02: z.ZodType<DesignNode> = v02Schemas.designNodeSchema;

const v03Schemas = createNodeSchemas(VisualStyleSchemaV03, false, false, false, false);
export const FrameNodeSchemaV03: z.ZodType<FrameNode> = v03Schemas.frameNodeSchema;
export const DesignNodeSchemaV03: z.ZodType<DesignNode> = v03Schemas.designNodeSchema;

const v04Schemas = createNodeSchemas(VisualStyleSchemaV03, true, false, false, false);
export const FrameNodeSchemaV04: z.ZodType<FrameNode> = v04Schemas.frameNodeSchema;
export const DesignNodeSchemaV04: z.ZodType<DesignNode> = v04Schemas.designNodeSchema;

const v05Schemas = createNodeSchemas(VisualStyleSchemaV03, true, true, false, false);
export const FrameNodeSchemaV05: z.ZodType<FrameNode> = v05Schemas.frameNodeSchema;
export const DesignNodeSchemaV05: z.ZodType<DesignNode> = v05Schemas.designNodeSchema;

const v06Schemas = createNodeSchemas(VisualStyleSchemaV03, true, true, true, false);
export const FrameNodeSchemaV06: z.ZodType<FrameNode> = v06Schemas.frameNodeSchema;
export const DesignNodeSchemaV06: z.ZodType<DesignNode> = v06Schemas.designNodeSchema;

const v07Schemas = createNodeSchemas(VisualStyleSchemaV03, true, true, true, true);
export const FrameNodeSchemaV07: z.ZodType<FrameNode> = v07Schemas.frameNodeSchema;
export const DesignNodeSchemaV07: z.ZodType<DesignNode> = v07Schemas.designNodeSchema;

export const TextNodeSchema: z.ZodType<TextNode> = v07Schemas.textNodeSchema as unknown as z.ZodType<TextNode>;
export const RectangleNodeSchema: z.ZodType<RectangleNode> = v07Schemas.rectangleNodeSchema as unknown as z.ZodType<RectangleNode>;
export const ImageNodeSchema: z.ZodType<ImageNode> = v07Schemas.imageNodeSchema as unknown as z.ZodType<ImageNode>;
export const SvgNodeSchema: z.ZodType<SvgNode> = v07Schemas.svgNodeSchema as unknown as z.ZodType<SvgNode>;
export const FrameNodeSchema: z.ZodType<FrameNode> = FrameNodeSchemaV07;
export const DesignNodeSchema: z.ZodType<DesignNode> = v07Schemas.designNodeSchema;
