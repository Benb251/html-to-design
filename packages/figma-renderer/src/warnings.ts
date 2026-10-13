import type { RendererWarning } from "./types.js";

export class WarningCollector {
  private readonly warnings: RendererWarning[] = [];

  warn(code: string, message: string, nodeId?: string | undefined, assetId?: string | undefined): void {
    this.warnings.push({ code, message, nodeId, assetId });
  }

  getWarnings(): RendererWarning[] {
    return [...this.warnings];
  }
}
