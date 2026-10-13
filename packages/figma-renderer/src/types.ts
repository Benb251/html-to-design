/// <reference types="@figma/plugin-typings" />

export interface RendererWarning {
  code: string;
  message: string;
  nodeId?: string | undefined;
  assetId?: string | undefined;
}

export interface RenderResult {
  rootNodeId: string;
  createdNodeCount: number;
  skippedNodeCount: number;
  warnings: RendererWarning[];
}

export interface FigmaRendererHost {
  createFrame(): FrameNode;
  createRectangle(): RectangleNode;
  createText(): TextNode;
  createNodeFromSvg(svg: string): FrameNode;
  createImage(data: Uint8Array): Image;
  createImageAsync(src: string): Promise<Image>;
  base64Decode(data: string): Uint8Array;
  loadFontAsync(fontName: FontName): Promise<void>;
  listAvailableFontsAsync(): Promise<Font[]>;
  appendRoot(rootNode: FrameNode): void;
  setSelection?(nodes: readonly SceneNode[]): void;
  scrollAndZoomIntoView?(nodes: readonly SceneNode[]): void;
  getViewportCenter?(): { x: number; y: number };
}

export interface RenderOptions {
  viewportCenter?: { x: number; y: number } | undefined;
  defaultFont?: FontName | undefined;
}
