export { deriveNodeName, renderDesignDocument } from "./renderer.js";
export type {
  FigmaRendererHost,
  RenderOptions,
  RenderResult,
  RendererWarning,
} from "./types.js";
export {
  calculateLocalCoordinates,
  calculateRootPlacement,
} from "./geometry.js";
export type { Point, Rect } from "./geometry.js";
export {
  toFigmaFills,
  toFigmaRgb,
  toFigmaRgba,
  toFigmaSolidPaint,
} from "./colors.js";
export { applyVisualStyle } from "./styles.js";
export type { StyleableNode } from "./styles.js";
export { FontManager } from "./fonts.js";
export { createFigmaImageFill, resolveImageScaleMode } from "./images.js";
export { renderSvgNode } from "./svg.js";
export { WarningCollector } from "./warnings.js";
export {
  FakeBaseNode,
  FakeLayoutNode,
  FakeStyleableNode,
  FakeFrameNode,
  FakeRectangleNode,
  FakeTextNode,
  FakeFigmaHost,
} from "./fake-host.js";
export * as fidelity from "./fidelity/index.js";
export * from "./fidelity/index.js";
