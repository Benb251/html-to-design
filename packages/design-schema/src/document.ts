import { z } from "zod";
import { AssetRecordSchema } from "./assets.js";
import { FrameNodeSchemaV01, FrameNodeSchemaV02 } from "./nodes.js";
import type { DesignNode, FrameNode } from "./nodes.js";
import { DESIGN_SCHEMA_VERSION_V01, DESIGN_SCHEMA_VERSION_V02 } from "./version.js";

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

const RawDesignDocumentV01Schema = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION_V01),
  capture: CaptureMetadataSchema,
  viewport: ViewportMetadataSchema,
  root: FrameNodeSchemaV01,
  assets: z.array(AssetRecordSchema),
  warnings: z.array(WarningSchema).optional(),
});

const RawDesignDocumentV02Schema = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION_V02),
  capture: CaptureMetadataSchema,
  viewport: ViewportMetadataSchema,
  root: FrameNodeSchemaV02,
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

function validateDocumentReferences(
  document: {
    assets: Array<{ id: string; kind: string }>;
    root: FrameNode;
    warnings?: Array<{ code: string; message: string; feature?: string | undefined; nodeId?: string | undefined }> | undefined;
  },
  ctx: z.RefinementCtx,
): void {
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
}

export const DesignDocumentV01Schema = RawDesignDocumentV01Schema.superRefine(validateDocumentReferences);
export const DesignDocumentV02Schema = RawDesignDocumentV02Schema.superRefine(validateDocumentReferences);

export const DesignDocumentSchema = DesignDocumentV02Schema;

export type DesignDocumentV01 = z.infer<typeof DesignDocumentV01Schema>;
export type DesignDocumentV02 = z.infer<typeof DesignDocumentV02Schema>;

export type VersionedDesignDocument = DesignDocumentV01 | DesignDocumentV02;
export type LatestDesignDocument = DesignDocumentV02;
export type DesignDocument = DesignDocumentV02;

export type CaptureMetadata = z.infer<typeof CaptureMetadataSchema>;
export type ViewportMetadata = z.infer<typeof ViewportMetadataSchema>;
export type DesignWarning = z.infer<typeof WarningSchema>;

export function normalizeDesignDocument(document: VersionedDesignDocument): DesignDocumentV02 {
  if (document.schemaVersion === "0.2") {
    return document as DesignDocumentV02;
  }
  return {
    ...document,
    schemaVersion: "0.2",
  };
}

export const upgradeDesignDocumentToLatest = normalizeDesignDocument;
