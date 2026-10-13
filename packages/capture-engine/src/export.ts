import { parseDesignDocument, type DesignNode } from "@web2design/design-schema";
export function serializeCapture(value: unknown): string { return JSON.stringify(parseDesignDocument(value), null, 2); }
export function countNodes(node: DesignNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}
export function captureFilename(url: string, capturedAt: string): string {
  const host = new URL(url).hostname || "local-page";
  const safe = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
  const date = new Date(capturedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid capture date.");
  return "web2design-" + safe.slice(0, 100) + "-" + date.toISOString().slice(0, 10) + ".json";
}
