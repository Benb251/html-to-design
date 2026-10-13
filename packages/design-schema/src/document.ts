import { z } from "zod";
import { AssetRecordSchema } from "./assets.js";
import { FrameNodeSchema } from "./nodes.js";
import type { DesignNode } from "./nodes.js";
import { DESIGN_SCHEMA_VERSION } from "./version.js";

const CaptureSourceSchema = z.strictObject({
  kind: z.string().min(1),
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
});

const CaptureMetadataSchema = z.strictObject({
  capturedAt: z.string().datetime({ offset: true }),
  source: CaptureSourceSchema,
  page: z
    .strictObject({
      url: z.string().url().optional(),
      title: z.string().optional(),
    })
    .optional(),
});

const ViewportMetadataSchema = z.strictObject({
  width: z.number().positive(),
  height: z.number().positive(),
  devicePixelRatio: z.number().positive(),
  scrollX: z.number().finite(),
  scrollY: z.number().finite(),
});

const WarningSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
  feature: z.string().min(1).optional(),
  nodeId: z.string().min(1).optional(),
});

const RawDesignDocumentSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  capture: CaptureMetadataSchema,
  viewport: ViewportMetadataSchema,
  root: FrameNodeSchema,
  assets: z.array(AssetRecordSchema),
  warnings: z.array(WarningSchema).optional(),
});

function visitNodes(
  node: DesignNode,
  path: Array<string | number>,
  visitor: (node: DesignNode, path: Array<string | number>) => void,
): void {
  visitor(node, path);
  if (node.type === "frame") {
    node.children.forEach((child, index) => {
      visitNodes(child, [...path, "children", index], visitor);
    });
  }
}

export const DesignDocumentSchema = RawDesignDocumentSchema.superRefine((document, ctx) => {
  const assetById = new Map<string, (typeof document.assets)[number]>();

  document.assets.forEach((asset, index) => {
    if (assetById.has(asset.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate asset id: ${asset.id}`,
        path: ["assets", index, "id"],
      });
    }
    assetById.set(asset.id, asset);
  });

  const nodeIds = new Set<string>();
  visitNodes(document.root, ["root"], (node, path) => {
    if (nodeIds.has(node.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate node id: ${node.id}`,
        path: [...path, "id"],
      });
    }
    nodeIds.add(node.id);

    if (node.type === "image") {
      const asset = assetById.get(node.assetId);
      if (asset === undefined || asset.kind !== "image") {
        ctx.addIssue({
          code: "custom",
          message: `Image node ${node.id} references a missing or non-image asset: ${node.assetId}`,
          path: [...path, "assetId"],
        });
      }
    }

    if (node.type === "svg" && node.assetId !== undefined) {
      const asset = assetById.get(node.assetId);
      if (asset === undefined || asset.kind !== "svg") {
        ctx.addIssue({
          code: "custom",
          message: `SVG node ${node.id} references a missing or non-SVG asset: ${node.assetId}`,
          path: [...path, "assetId"],
        });
      }
    }
  });

  document.warnings?.forEach((warning, index) => {
    if (warning.nodeId !== undefined && !nodeIds.has(warning.nodeId)) {
      ctx.addIssue({
        code: "custom",
        message: `Warning references a missing node: ${warning.nodeId}`,
        path: ["warnings", index, "nodeId"],
      });
    }
  });
});

export type DesignDocument = z.infer<typeof DesignDocumentSchema>;
export type CaptureMetadata = z.infer<typeof CaptureMetadataSchema>;
export type ViewportMetadata = z.infer<typeof ViewportMetadataSchema>;
export type DesignWarning = z.infer<typeof WarningSchema>;

