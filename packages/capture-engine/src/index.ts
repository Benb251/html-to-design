export { captureDocument, type CaptureOptions } from "./capture.js";
export { captureId, documentRect, renderDecision, type Rect } from "./geometry.js";
export { cssColor, cssPixels, fontFamilies, textStyle, visualStyle, boxShadow, parseBoxShadows, characters } from "./styles.js";
export { serializeCapture, countNodes, captureFilename } from "./export.js";
export { createAssetRegistry, inferUrlMimeType, parseDataUrlMimeType, materializeBlobImage, serializeAndSanitizeSvg, type AssetRegistry, type SvgCaptureResult } from "./assets.js";
export { capturePseudoElement, parseGeneratedContent, unescapeCssString, measureTextInDocument, type ParsedGeneratedContent, type CapturePseudoOptions } from "./pseudo.js";
export {
  processElementTransform,
  reconstructBaseBounds,
  resolveTransformOrigin,
  parseMatrixString,
  extractTransformMatrix,
  multiplyMatrix2D,
  classifyTransform,
  parseCssAngleToRad,
  parseCssLengthOrPercent,
  type Matrix2D,
  type TransformOrigin,
  type ParsedTransformResult,
} from "./transform.js";
export {
  isEligibleRichTextRoot,
  collectRichTextFlow,
  hasIndependentBoxSemantics,
  resolveSafeHyperlink,
  areRunStylesEqual,
  type CollectedRichTextFlow,
} from "./richtext.js";
export {
  analyzeFlexContainer,
  predictAutoLayoutGeometry,
  getNodeLayoutBounds,
  type AutoLayoutContainerSpec,
  type AutoLayoutChildSpec,
  type PredictedChildPlacement,
  type FlexAnalysisContext,
  type FlexAnalysisResult,
  type NodeInspectionMetadata,
} from "./autolayout.js";

