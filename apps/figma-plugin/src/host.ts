/// <reference types="@figma/plugin-typings" />
import type { FigmaRendererHost } from "@web2design/figma-renderer";

export function createFigmaHost(): FigmaRendererHost {
  return {
    createFrame: () => figma.createFrame(),
    createRectangle: () => figma.createRectangle(),
    createText: () => figma.createText(),
    createNodeFromSvg: (svg: string) => figma.createNodeFromSvg(svg),
    createImage: (data: Uint8Array) => figma.createImage(data),
    createImageAsync: (url: string) => figma.createImageAsync(url),
    base64Decode: (data: string) => figma.base64Decode(data),
    loadFontAsync: (fontName: FontName) => figma.loadFontAsync(fontName),
    listAvailableFontsAsync: () => figma.listAvailableFontsAsync(),
    appendRoot: (rootNode: FrameNode) => figma.currentPage.appendChild(rootNode),
    setSelection: (nodes: readonly SceneNode[]) => {
      figma.currentPage.selection = nodes;
    },
    scrollAndZoomIntoView: (nodes: readonly SceneNode[]) => {
      figma.viewport.scrollAndZoomIntoView(nodes);
    },
    getViewportCenter: () => figma.viewport.center,
  };
}
