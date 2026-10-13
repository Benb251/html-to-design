/// <reference types="@figma/plugin-typings" />
import type { FigmaRendererHost } from "./types.js";

let idCounter = 1;

export class FakeBaseNode {
  readonly id: string = `node-${idCounter++}`;
  name: string = "";
  visible: boolean = true;
  opacity: number = 1;
  removed: boolean = false;
  parent: (FakeBaseNode & { children?: SceneNode[] }) | null = null;
  readonly pluginData = new Map<string, string>();

  setPluginData(key: string, value: string): void {
    this.pluginData.set(key, value);
  }

  getPluginData(key: string): string {
    return this.pluginData.get(key) ?? "";
  }

  remove(): void {
    this.removed = true;
  }
}

export class FakeLayoutNode extends FakeBaseNode {
  x: number = 0;
  y: number = 0;
  width: number = 100;
  height: number = 100;

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
}

export class FakeStyleableNode extends FakeLayoutNode {
  fills: readonly Paint[] = [];
  strokes: readonly Paint[] = [];
  strokeWeight: number = 0;
  strokeTopWeight: number = 0;
  strokeRightWeight: number = 0;
  strokeBottomWeight: number = 0;
  strokeLeftWeight: number = 0;
  dashPattern: readonly number[] = [];
  cornerRadius?: number | PluginAPI["mixed"];
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
  effects: readonly Effect[] = [];
}

export class FakeFrameNode extends FakeStyleableNode {
  readonly type = "FRAME";
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL" = "NONE";
  clipsContent: boolean = false;
  readonly children: SceneNode[] = [];

  appendChild(node: SceneNode): void {
    (node as unknown as FakeBaseNode).parent = this;
    this.children.push(node);
  }
}

export class FakeRectangleNode extends FakeStyleableNode {
  readonly type = "RECTANGLE";
}

export class FakeTextNode extends FakeLayoutNode {
  readonly type = "TEXT";
  characters: string = "";
  fontName: FontName = { family: "Inter", style: "Regular" };
  fontSize: number = 16;
  lineHeight: LineHeight = { unit: "AUTO" };
  letterSpacing: LetterSpacing = { value: 0, unit: "PIXELS" };
  textAlignHorizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" = "LEFT";
  textAutoResize: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE" = "NONE";
  fills: readonly Paint[] = [];
  effects: readonly Effect[] = [];
}

export class FakeFigmaHost implements FigmaRendererHost {
  readonly roots: FrameNode[] = [];
  selection: readonly SceneNode[] = [];
  viewedNodes: readonly SceneNode[] = [];
  viewportCenter = { x: 500, y: 500 };

  availableFonts: Font[] = [
    { fontName: { family: "Inter", style: "Regular" } },
    { fontName: { family: "Inter", style: "Medium" } },
    { fontName: { family: "Inter", style: "Semi Bold" } },
    { fontName: { family: "Inter", style: "Bold" } },
    { fontName: { family: "Roboto", style: "Regular" } },
    { fontName: { family: "Roboto", style: "Bold" } },
    { fontName: { family: "Arial", style: "Regular" } },
  ];

  readonly loadedFonts: FontName[] = [];
  readonly remoteImageFailures = new Set<string>();

  createFrame(): FrameNode {
    return new FakeFrameNode() as unknown as FrameNode;
  }

  createRectangle(): RectangleNode {
    return new FakeRectangleNode() as unknown as RectangleNode;
  }

  createText(): TextNode {
    return new FakeTextNode() as unknown as TextNode;
  }

  createNodeFromSvg(svg: string): FrameNode {
    if (svg.includes("throw-error-syntax-broken") || svg.includes("invalid-syntax")) {
      throw new Error("Invalid SVG syntax");
    }
    const frame = new FakeFrameNode();
    frame.name = "SVG Group";
    const widthMatch = svg.match(/width="(\d+)"/);
    const heightMatch = svg.match(/height="(\d+)"/);
    const w = widthMatch ? parseFloat(widthMatch[1]!) : 100;
    const h = heightMatch ? parseFloat(heightMatch[1]!) : 100;
    frame.resize(w, h);
    return frame as unknown as FrameNode;
  }

  createImage(data: Uint8Array): Image {
    const hash = `hash-${data.length}-${data[0] ?? 0}`;
    return {
      hash,
      getBytesAsync: async () => data,
      getSizeAsync: async () => ({ width: 100, height: 100 }),
    };
  }

  async createImageAsync(src: string): Promise<Image> {
    if (this.remoteImageFailures.has(src) || src.includes("fail-404")) {
      throw new Error(`Failed to fetch image: HTTP 404 ${src}`);
    }
    let identifier = src;
    try {
      const u = new URL(src);
      identifier = u.pathname;
    } catch {
      // not a URL
    }
    const safeId = identifier.replace(/[^a-zA-Z0-9._-]/g, "_");
    return {
      hash: `url-hash-${safeId.slice(-20)}`,
      getBytesAsync: async () => new Uint8Array([1, 2, 3]),
      getSizeAsync: async () => ({ width: 320, height: 240 }),
    };
  }

  base64Decode(data: string): Uint8Array {
    return Buffer.from(data, "base64");
  }

  async loadFontAsync(fontName: FontName): Promise<void> {
    if (fontName.family === "SimulatedBrokenFont") {
      throw new Error("Simulated font loading failure");
    }
    this.loadedFonts.push(fontName);
  }

  async listAvailableFontsAsync(): Promise<Font[]> {
    return [...this.availableFonts];
  }

  appendRoot(rootNode: FrameNode): void {
    this.roots.push(rootNode);
  }

  setSelection(nodes: readonly SceneNode[]): void {
    this.selection = nodes;
  }

  scrollAndZoomIntoView(nodes: readonly SceneNode[]): void {
    this.viewedNodes = nodes;
  }

  getViewportCenter(): { x: number; y: number } {
    return this.viewportCenter;
  }
}
