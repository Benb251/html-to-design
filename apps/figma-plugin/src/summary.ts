import type { DesignDocument, DesignNode } from "@web2design/design-schema";
import type { DocumentSummary } from "./messages.js";

function walkNodes(node: DesignNode, visitor: (node: DesignNode) => void): void {
  visitor(node);
  if (node.type === "frame") {
    for (const child of node.children) {
      walkNodes(child, visitor);
    }
  }
}

export function computeDocumentSummary(document: DesignDocument): DocumentSummary {
  let totalNodes = 0;
  const nodeCounts = {
    frame: 0,
    text: 0,
    rectangle: 0,
    image: 0,
    svg: 0,
  };

  walkNodes(document.root, (node) => {
    totalNodes++;
    nodeCounts[node.type]++;
  });

  const assetCounts = {
    image: 0,
    svg: 0,
    font: 0,
    binary: 0,
  };

  for (const asset of document.assets) {
    assetCounts[asset.kind]++;
  }

  const warningCodes = Array.from(new Set(document.warnings?.map((w) => w.code) ?? []));

  return {
    schemaVersion: document.schemaVersion,
    capturedAt: document.capture.capturedAt,
    sourceKind: document.capture.source.kind,
    pageTitle: document.capture.page?.title,
    pageUrl: document.capture.page?.url,
    viewport: {
      width: document.viewport.width,
      height: document.viewport.height,
    },
    totalNodes,
    nodeCounts,
    assetCount: document.assets.length,
    assetCounts,
    warningCount: document.warnings?.length ?? 0,
    warningCodes,
  };
}
