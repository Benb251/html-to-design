import { z } from "zod";

const UrlAssetSourceSchema = z.strictObject({
  type: z.literal("url"),
  url: z.string().url(),
});

const DataUrlAssetSourceSchema = z.strictObject({
  type: z.literal("data-url"),
  dataUrl: z.string().regex(/^data:[^,]*,[\s\S]+$/, "Expected a data URL with a payload"),
});

const EmbeddedAssetSourceSchema = z.strictObject({
  type: z.literal("embedded"),
  encoding: z.literal("base64"),
  data: z.base64().min(1),
});

export const AssetSourceSchema = z.discriminatedUnion("type", [
  UrlAssetSourceSchema,
  DataUrlAssetSourceSchema,
  EmbeddedAssetSourceSchema,
]);

export type AssetSource = z.infer<typeof AssetSourceSchema>;

export const AssetRecordSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["image", "svg", "font", "binary"]),
  source: AssetSourceSchema,
  contentHash: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  intrinsicDimensions: z
    .strictObject({
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
});

export type AssetRecord = z.infer<typeof AssetRecordSchema>;

