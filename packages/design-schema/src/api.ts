import { DesignDocumentSchema } from "./document.js";
import type { DesignDocument } from "./document.js";

export interface ValidationIssue {
  path: Array<string | number>;
  code: string;
  message: string;
}

export type SafeParseDesignDocumentResult =
  | { success: true; data: DesignDocument }
  | { success: false; issues: ValidationIssue[] };

export class DesignDocumentValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super("Invalid Design Schema document");
    this.name = "DesignDocumentValidationError";
  }
}

export function parseDesignDocument(input: unknown): DesignDocument {
  const result = safeParseDesignDocument(input);
  if (!result.success) {
    throw new DesignDocumentValidationError(result.issues);
  }
  return result.data;
}

export function safeParseDesignDocument(input: unknown): SafeParseDesignDocumentResult {
  const result = DesignDocumentSchema.safeParse(input);

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

