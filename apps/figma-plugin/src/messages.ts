import type { ValidationIssue, VersionedDesignDocument } from "@web2design/design-schema";
import type { RenderResult } from "@web2design/figma-renderer";

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
      type: "import-document";
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
      document: VersionedDesignDocument;
    }
  | {
      type: "validation-error";
      error: SerializableValidationError;
    }
  | {
      type: "import-started";
    }
  | {
      type: "import-success";
      result: RenderResult;
    }
  | {
      type: "import-error";
      error: SerializableValidationError;
    };
