/// <reference types="@figma/plugin-typings" />

export type FidelityCategory =
  | "GEOMETRY"
  | "HIERARCHY"
  | "TEXT"
  | "FILL"
  | "BORDER"
  | "RADIUS"
  | "SHADOW"
  | "IMAGE"
  | "SVG"
  | "WARNING"
  | "ASSET";

export interface NormalizedFill {
  type: "SOLID" | "IMAGE";
  color?: { r: number; g: number; b: number; a: number } | undefined;
  scaleMode?: string | undefined;
  imageHash?: string | null | undefined;
}

export interface NormalizedStroke {
  color: { r: number; g: number; b: number; a: number };
  width: number;
}

export interface NormalizedRadius {
  uniform?: number | undefined;
  topLeft?: number | undefined;
  topRight?: number | undefined;
  bottomRight?: number | undefined;
  bottomLeft?: number | undefined;
}

export interface NormalizedShadow {
  type: "DROP_SHADOW";
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadRadius: number;
  color: { r: number; g: number; b: number; a: number };
}

export interface NormalizedText {
  characters: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight?: number | undefined;
  letterSpacing?: number | undefined;
  textAlignHorizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
}

export interface NormalizedImage {
  scaleMode: string;
  imageHash?: string | null | undefined;
}

export interface NormalizedSvg {
  isVectorContainer: boolean;
}

export interface NormalizedRenderedNode {
  sourceId?: string | undefined;
  sourceType?: string | undefined;
  sourceTag?: string | undefined;
  figmaType: string;
  name: string;

  // Local geometry (relative to immediate Figma parent)
  x: number;
  y: number;
  width: number;
  height: number;

  // Reconstructed absolute geometry (relative to schema document root origin)
  absoluteX: number;
  absoluteY: number;

  opacity: number;

  fills?: NormalizedFill[] | undefined;
  strokes?: NormalizedStroke[] | undefined;
  radius?: NormalizedRadius | undefined;
  effects?: NormalizedShadow[] | undefined;

  text?: NormalizedText | undefined;
  image?: NormalizedImage | undefined;
  svg?: NormalizedSvg | undefined;

  children?: NormalizedRenderedNode[] | undefined;
}

export interface FidelityFailure {
  fixtureId: string;
  sourceId: string;
  nodeType: string;
  category: FidelityCategory;
  property: string;
  expected: unknown;
  actual: unknown;
  difference?: number | string | undefined;
  tolerance?: number | undefined;
  message: string;
}

export interface ExpectedWarningRule {
  code: string;
  nodeId?: string | undefined;
}

export interface FixtureManifestEntry {
  id: string;
  name: string;
  kind: "schema-fixture" | "chrome-capture";
  sourcePath?: string | undefined;
  description: string;
  expectedCategories: FidelityCategory[];
  expectedWarnings?: ExpectedWarningRule[] | undefined;
}

export interface FidelityReport {
  fixtures: number;
  nodesCompared: number;
  geometryChecks: number;
  styleChecks: number;
  textChecks: number;
  assetChecks: number;
  warningsExpected: number;
  warningsUnexpected: number;
  failures: number;
  failureDetails?: FidelityFailure[] | undefined;
}
