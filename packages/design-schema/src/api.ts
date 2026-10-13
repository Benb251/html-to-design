import {
  DesignDocumentV01Schema,
  DesignDocumentV02Schema,
  DesignDocumentV03Schema,
  DesignDocumentV04Schema,
  type VersionedDesignDocument,
} from "./document.js";
import { isSupportedSchemaVersion, SUPPORTED_SCHEMA_VERSIONS } from "./version.js";

export interface ValidationIssue {
  path: Array<string | number>;
  code: string;
  message: string;
}

export type SafeParseDesignDocumentResult =
  | { success: true; data: VersionedDesignDocument }
  | { success: false; issues: ValidationIssue[] };

export class DesignDocumentValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super("Invalid Design Schema document");
    this.name = "DesignDocumentValidationError";
  }
}

export function parseDesignDocument(input: unknown): VersionedDesignDocument {
  const result = safeParseDesignDocument(input);
  if (!result.success) {
    throw new DesignDocumentValidationError(result.issues);
  }
  return result.data;
}

export function safeParseDesignDocument(input: unknown): SafeParseDesignDocumentResult {
  if (typeof input !== "object" || input === null) {
    return {
      success: false,
      issues: [{ path: [], code: "invalid_type", message: "Expected document object" }],
    };
  }

  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (!isSupportedSchemaVersion(version)) {
    return {
      success: false,
      issues: [
        {
          path: ["schemaVersion"],
          code: "invalid_value",
          message: `Unsupported schema version: ${String(version)}. Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
        },
      ],
    };
  }

  const schema =
    version === "0.1"
      ? DesignDocumentV01Schema
      : version === "0.2"
        ? DesignDocumentV02Schema
        : version === "0.3"
          ? DesignDocumentV03Schema
          : DesignDocumentV04Schema;
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.filter((part): part is string | number => typeof part !== "symbol"),
      code: issue.code,
      message: issue.message,
    })),
  };
}
