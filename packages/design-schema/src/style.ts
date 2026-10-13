import { z } from "zod";

export const ColorSchema = z.strictObject({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1).default(1),
});

export type Color = z.infer<typeof ColorSchema>;

export const SolidFillSchema = z.strictObject({
  type: z.literal("solid"),
  color: ColorSchema,
});

export type SolidFill = z.infer<typeof SolidFillSchema>;

export const GradientStopSchema = z.strictObject({
  position: z.number().min(0).max(1),
  color: ColorSchema,
});

export type GradientStop = z.infer<typeof GradientStopSchema>;

export const LinearGradientFillSchema = z.strictObject({
  type: z.literal("linear-gradient"),
  angle: z.number().min(0).max(360),
  stops: z.array(GradientStopSchema).min(2),
});

export type LinearGradientFill = z.infer<typeof LinearGradientFillSchema>;

export const RadialGradientFillSchema = z.strictObject({
  type: z.literal("radial-gradient"),
  center: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  radius: z.strictObject({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
  }),
  stops: z.array(GradientStopSchema).min(2),
  shape: z.enum(["circle", "ellipse"]).optional(),
});

export type RadialGradientFill = z.infer<typeof RadialGradientFillSchema>;

export const FillSchema = z.discriminatedUnion("type", [
  SolidFillSchema,
  LinearGradientFillSchema,
  RadialGradientFillSchema,
]);

export type Fill = z.infer<typeof FillSchema>;

export const BorderSchemaV01 = z.strictObject({
  width: z.number().nonnegative(),
  style: z.enum(["none", "solid", "dashed", "dotted", "double"]),
  color: ColorSchema,
});

export type BorderV01 = z.infer<typeof BorderSchemaV01>;

export const BorderStyleSchema = z.enum([
  "none",
  "hidden",
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
]);

export type BorderStyle = z.infer<typeof BorderStyleSchema>;

export const BorderSideSchema = z.strictObject({
  width: z.number().nonnegative(),
  style: BorderStyleSchema,
  color: ColorSchema,
});

export type BorderSide = z.infer<typeof BorderSideSchema>;

export const BordersSchema = z.strictObject({
  top: BorderSideSchema,
  right: BorderSideSchema,
  bottom: BorderSideSchema,
  left: BorderSideSchema,
});

export type Borders = z.infer<typeof BordersSchema>;
export const BorderSchema = BordersSchema;
export type Border = Borders;

const PerCornerRadiusSchema = z.strictObject({
  topLeft: z.number().nonnegative(),
  topRight: z.number().nonnegative(),
  bottomRight: z.number().nonnegative(),
  bottomLeft: z.number().nonnegative(),
});

export const CornerRadiusSchema = z.union([
  z.number().nonnegative(),
  PerCornerRadiusSchema,
]);

export type CornerRadius = z.infer<typeof CornerRadiusSchema>;

export const BoxShadowSchema = z.strictObject({
  offsetX: z.number(),
  offsetY: z.number(),
  blurRadius: z.number().nonnegative(),
  spreadRadius: z.number(),
  color: ColorSchema,
  inset: z.boolean().default(false),
});

export type BoxShadow = z.infer<typeof BoxShadowSchema>;

export const VisualStyleSchemaV01 = z.strictObject({
  fills: z.array(SolidFillSchema).optional(),
  border: BorderSchemaV01.optional(),
  cornerRadius: CornerRadiusSchema.optional(),
  boxShadows: z.array(BoxShadowSchema).optional(),
});

export type VisualStyleV01 = z.infer<typeof VisualStyleSchemaV01>;

export const VisualStyleSchemaV02 = z.strictObject({
  fills: z.array(FillSchema).optional(),
  border: BorderSchemaV01.optional(),
  cornerRadius: CornerRadiusSchema.optional(),
  boxShadows: z.array(BoxShadowSchema).optional(),
});

export type VisualStyleV02 = z.infer<typeof VisualStyleSchemaV02>;

export const VisualStyleSchemaV03 = z.strictObject({
  fills: z.array(FillSchema).optional(),
  border: BordersSchema.optional(),
  cornerRadius: CornerRadiusSchema.optional(),
  boxShadows: z.array(BoxShadowSchema).optional(),
});

export type VisualStyleV03 = z.infer<typeof VisualStyleSchemaV03>;

export const VisualStyleSchemaV04 = VisualStyleSchemaV03;
export type VisualStyleV04 = VisualStyleV03;

export const VisualStyleSchema = VisualStyleSchemaV04;
export type VisualStyle = VisualStyleV04;

export const TextStyleSchema = z.strictObject({
  fontFamily: z.string().min(1),
  fontFallbacks: z.array(z.string().min(1)).optional(),
  fontSize: z.number().positive(),
  fontWeight: z.number().int().min(1).max(1000),
  fontStyle: z.enum(["normal", "italic", "oblique"]),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  textAlign: z.enum(["left", "center", "right", "justify", "start", "end"]),
  color: ColorSchema,
});

export type TextStyle = z.infer<typeof TextStyleSchema>;
