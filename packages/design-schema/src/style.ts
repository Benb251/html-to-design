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

export const BorderSchema = z.strictObject({
  width: z.number().nonnegative(),
  style: z.enum(["none", "solid", "dashed", "dotted", "double"]),
  color: ColorSchema,
});

export type Border = z.infer<typeof BorderSchema>;

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

export const VisualStyleSchema = z.strictObject({
  fills: z.array(SolidFillSchema).optional(),
  border: BorderSchema.optional(),
  cornerRadius: CornerRadiusSchema.optional(),
  boxShadows: z.array(BoxShadowSchema).optional(),
});

export type VisualStyle = z.infer<typeof VisualStyleSchema>;

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

