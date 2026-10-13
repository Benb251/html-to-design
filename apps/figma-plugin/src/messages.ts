import type { DesignDocument, ValidationIssue } from "@web2design/design-schema";

export interface DocumentSummary {
  schemaVersion: string;
  capturedAt: string;
  sourceKind: string;
  pageTitle?: string | undefined;
  pageUrl?: string | undefined;
  viewport: {
    width: number;
    height: number;
  };
  totalNodes: number;
  nodeCounts: {
    frame: number;
    text: number;
    rectangle: number;
    image: number;
    svg: number;
  };
  assetCount: number;
  assetCounts: {
    image: number;
    svg: number;
    font: number;
    binary: number;
  };
  warningCount: number;
  warningCodes: string[];
}

export interface SerializableValidationError {
  message: string;
  issues: ValidationIssue[];
  path?: string | undefined;
  details?: unknown;
}

export type UiToPluginMessage =
  | {
      type: "validate-document";
      raw: unknown;
    }
  | {
      type: "close-plugin";
    }
  | {
      type: "notify";
      message: string;
      error?: boolean | undefined;
    };

export type PluginToUiMessage =
  | {
      type: "validation-success";
      summary: DocumentSummary;
      document: DesignDocument;
    }
  | {
      type: "validation-error";
      error: SerializableValidationError;
    };
