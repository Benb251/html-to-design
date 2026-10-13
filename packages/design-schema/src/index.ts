export {
  DesignDocumentValidationError,
  parseDesignDocument,
  safeParseDesignDocument,
} from "./api.js";
export type {
  SafeParseDesignDocumentResult,
  ValidationIssue,
} from "./api.js";
export type { AssetRecord, AssetSource } from "./assets.js";
export type {
  CaptureMetadata,
  DesignDocument,
  DesignWarning,
  ViewportMetadata,
} from "./document.js";
export type {
  DesignNode,
  FrameNode,
  ImageNode,
  RectangleNode,
  SvgNode,
  TextNode,
} from "./nodes.js";
export type {
  Border,
  BoxShadow,
  Color,
  CornerRadius,
  SolidFill,
  TextStyle,
  VisualStyle,
} from "./style.js";
export { DESIGN_SCHEMA_VERSION } from "./version.js";
export type { DesignSchemaVersion } from "./version.js";

