/// <reference types="@figma/plugin-typings" />
import type { FigmaRendererHost } from "./types.js";

const getMixedSymbol = (): PluginAPI["mixed"] => {
  const globalFigma = (globalThis as unknown as { figma?: { mixed?: PluginAPI["mixed"] } }).figma;
  return globalFigma?.mixed ?? (Symbol.for("figma.mixed") as unknown as PluginAPI["mixed"]);
};

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
  protected _x: number = 0;
  protected _y: number = 0;
  protected _width: number = 100;
  protected _height: number = 100;
  protected _rotation: number = 0;
  protected _relativeTransform: Transform = [
    [1, 0, 0],
    [0, 1, 0],
  ];

  get x(): number {
    return this._x;
  }
  set x(val: number) {
    this._x = val;
    this._relativeTransform[0][2] = val;
  }

  get y(): number {
    return this._y;
  }
  set y(val: number) {
    this._y = val;
    this._relativeTransform[1][2] = val;
  }

  get width(): number {
    return this._width;
  }
  set width(val: number) {
    this._width = val;
  }

  get height(): number {
    return this._height;
  }
  set height(val: number) {
    this._height = val;
  }

  get rotation(): number {
    return this._rotation;
  }
  set rotation(deg: number) {
    this._rotation = deg;
    const rad = (-deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    this._relativeTransform = [
      [cos, -sin, this._x],
      [sin, cos, this._y],
    ];
  }

  get relativeTransform(): Transform {
    return this._relativeTransform;
  }
  set relativeTransform(matrix: Transform) {
    this._relativeTransform = [
      [matrix[0][0], matrix[0][1], matrix[0][2]],
      [matrix[1][0], matrix[1][1], matrix[1][2]],
    ];
    this._x = matrix[0][2];
    this._y = matrix[1][2];
    this._rotation = Math.atan2(-matrix[1][0], matrix[0][0]) * (180 / Math.PI);
  }

  protected _layoutAlign: "INHERIT" | "MIN" | "CENTER" | "MAX" | "STRETCH" = "INHERIT";
  protected _layoutGrow: number = 0;
  protected _layoutPositioning: "AUTO" | "ABSOLUTE" = "AUTO";

  get layoutAlign(): "INHERIT" | "MIN" | "CENTER" | "MAX" | "STRETCH" {
    return this._layoutAlign;
  }
  set layoutAlign(val: "INHERIT" | "MIN" | "CENTER" | "MAX" | "STRETCH") {
    this._layoutAlign = val;
    if (this.parent && "relayout" in this.parent && typeof (this.parent as { relayout: () => void }).relayout === "function") {
      (this.parent as { relayout: () => void }).relayout();
    }
  }

  get layoutGrow(): number {
    return this._layoutGrow;
  }
  set layoutGrow(val: number) {
    this._layoutGrow = val;
    if (this.parent && "relayout" in this.parent && typeof (this.parent as { relayout: () => void }).relayout === "function") {
      (this.parent as { relayout: () => void }).relayout();
    }
  }

  get layoutPositioning(): "AUTO" | "ABSOLUTE" {
    return this._layoutPositioning;
  }
  set layoutPositioning(val: "AUTO" | "ABSOLUTE") {
    this._layoutPositioning = val;
    if (this.parent && "relayout" in this.parent && typeof (this.parent as { relayout: () => void }).relayout === "function") {
      (this.parent as { relayout: () => void }).relayout();
    }
  }

  resize(w: number, h: number): void {
    this._width = w;
    this._height = h;
  }

  rescale(scale: number): void {
    if (scale >= 0.01) {
      this._width *= scale;
      this._height *= scale;
    }
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
  primaryAxisSizingMode: "FIXED" | "AUTO" = "FIXED";
  counterAxisSizingMode: "FIXED" | "AUTO" = "FIXED";
  primaryAxisAlignItems: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN" = "MIN";
  counterAxisAlignItems: "MIN" | "MAX" | "CENTER" | "BASELINE" = "MIN";
  paddingTop: number = 0;
  paddingRight: number = 0;
  paddingBottom: number = 0;
  paddingLeft: number = 0;
  itemSpacing: number = 0;
  itemReverseZIndex: boolean = false;
  strokesIncludedInLayout: boolean = false;
  clipsContent: boolean = false;
  readonly children: SceneNode[] = [];

  appendChild(node: SceneNode): void {
    (node as unknown as FakeBaseNode).parent = this;
    this.children.push(node);
    this.relayout();
  }

  relayout(): void {
    if (this.layoutMode === "NONE") return;

    const flowChildren = this.children.filter(
      (c) => (c as unknown as FakeLayoutNode).layoutPositioning !== "ABSOLUTE",
    ) as unknown as FakeLayoutNode[];
    const count = flowChildren.length;
    if (count === 0) return;

    const isHoriz = this.layoutMode === "HORIZONTAL";
    const strokeTop = this.strokesIncludedInLayout ? this.strokeTopWeight : 0;
    const strokeRight = this.strokesIncludedInLayout ? this.strokeRightWeight : 0;
    const strokeBottom = this.strokesIncludedInLayout ? this.strokeBottomWeight : 0;
    const strokeLeft = this.strokesIncludedInLayout ? this.strokeLeftWeight : 0;

    const padLeft = this.paddingLeft + strokeLeft;
    const padRight = this.paddingRight + strokeRight;
    const padTop = this.paddingTop + strokeTop;
    const padBottom = this.paddingBottom + strokeBottom;

    const innerW = Math.max(0, this.width - padLeft - padRight);
    const innerH = Math.max(0, this.height - padTop - padBottom);

    if (isHoriz) {
      const growChildren = flowChildren.filter((c) => c.layoutGrow === 1);
      const fixedChildren = flowChildren.filter((c) => c.layoutGrow !== 1);
      const sumFixedWidth = fixedChildren.reduce((s, c) => s + c.width, 0);

      let effectiveGap = this.itemSpacing;
      if (this.primaryAxisAlignItems === "SPACE_BETWEEN" && count > 1) {
        effectiveGap = Math.max(0, (innerW - sumFixedWidth) / (count - 1));
      }

      if (growChildren.length > 0) {
        const totalGap = (count - 1) * effectiveGap;
        const availForGrow = Math.max(0, innerW - sumFixedWidth - totalGap);
        const growW = availForGrow / growChildren.length;
        for (const gc of growChildren) {
          gc.resize(growW, gc.height);
        }
      }

      const totalFlowW = flowChildren.reduce(
        (s, c, i) => s + c.width + (i > 0 ? effectiveGap : 0),
        0,
      );

      let startX = padLeft;
      if (this.primaryAxisAlignItems === "CENTER") {
        startX = padLeft + (innerW - totalFlowW) / 2;
      } else if (this.primaryAxisAlignItems === "MAX") {
        startX = padLeft + (innerW - totalFlowW);
      }

      let curX = startX;
      for (const child of flowChildren) {
        child.x = curX;

        if (child.layoutAlign === "STRETCH") {
          child.resize(child.width, innerH);
          child.y = padTop;
        } else {
          const align = child.layoutAlign !== "INHERIT" ? child.layoutAlign : this.counterAxisAlignItems;
          if (align === "CENTER") {
            child.y = padTop + (innerH - child.height) / 2;
          } else if (align === "MAX") {
            child.y = padTop + (innerH - child.height);
          } else {
            child.y = padTop;
          }
        }

        curX += child.width + effectiveGap;
      }
    } else {
      // VERTICAL
      const growChildren = flowChildren.filter((c) => c.layoutGrow === 1);
      const fixedChildren = flowChildren.filter((c) => c.layoutGrow !== 1);
      const sumFixedHeight = fixedChildren.reduce((s, c) => s + c.height, 0);

      let effectiveGap = this.itemSpacing;
      if (this.primaryAxisAlignItems === "SPACE_BETWEEN" && count > 1) {
        effectiveGap = Math.max(0, (innerH - sumFixedHeight) / (count - 1));
      }

      if (growChildren.length > 0) {
        const totalGap = (count - 1) * effectiveGap;
        const availForGrow = Math.max(0, innerH - sumFixedHeight - totalGap);
        const growH = availForGrow / growChildren.length;
        for (const gc of growChildren) {
          gc.resize(gc.width, growH);
        }
      }

      const totalFlowH = flowChildren.reduce(
        (s, c, i) => s + c.height + (i > 0 ? effectiveGap : 0),
        0,
      );

      let startY = padTop;
      if (this.primaryAxisAlignItems === "CENTER") {
        startY = padTop + (innerH - totalFlowH) / 2;
      } else if (this.primaryAxisAlignItems === "MAX") {
        startY = padTop + (innerH - totalFlowH);
      }

      let curY = startY;
      for (const child of flowChildren) {
        child.y = curY;

        if (child.layoutAlign === "STRETCH") {
          child.resize(innerW, child.height);
          child.x = padLeft;
        } else {
          const align = child.layoutAlign !== "INHERIT" ? child.layoutAlign : this.counterAxisAlignItems;
          if (align === "CENTER") {
            child.x = padLeft + (innerW - child.width) / 2;
          } else if (align === "MAX") {
            child.x = padLeft + (innerW - child.width);
          } else {
            child.x = padLeft;
          }
        }

        curY += child.height + effectiveGap;
      }
    }
  }
}

export class FakeRectangleNode extends FakeStyleableNode {
  readonly type = "RECTANGLE";
}

export interface FakeCharStyle {
  fontName: FontName;
  fontSize: number;
  lineHeight: LineHeight;
  letterSpacing: LetterSpacing;
  fills: readonly Paint[];
  textDecoration: TextDecoration;
  hyperlink: HyperlinkTarget | null;
}

export class FakeTextNode extends FakeLayoutNode {
  readonly type = "TEXT";
  private _characters: string = "";
  private _fontName: FontName = { family: "Inter", style: "Regular" };
  private _fontSize: number = 16;
  private _lineHeight: LineHeight = { unit: "AUTO" };
  private _letterSpacing: LetterSpacing = { value: 0, unit: "PIXELS" };
  textAlignHorizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" = "LEFT";
  textAutoResize: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE" = "NONE";
  private _fills: readonly Paint[] = [];
  private _textDecoration: TextDecoration = "NONE";
  private _hyperlink: HyperlinkTarget | null = null;
  effects: readonly Effect[] = [];

  private _charStyles: FakeCharStyle[] = [];

  get characters(): string {
    return this._characters;
  }
  set characters(val: string) {
    this._characters = val;
    this.reinitializeCharStyles();
  }

  get fontName(): FontName {
    return this._fontName;
  }
  set fontName(val: FontName) {
    this._fontName = val;
    for (const cs of this._charStyles) {
      cs.fontName = val;
    }
  }

  get fontSize(): number {
    return this._fontSize;
  }
  set fontSize(val: number) {
    this._fontSize = val;
    for (const cs of this._charStyles) {
      cs.fontSize = val;
    }
  }

  get lineHeight(): LineHeight {
    return this._lineHeight;
  }
  set lineHeight(val: LineHeight) {
    this._lineHeight = val;
    for (const cs of this._charStyles) {
      cs.lineHeight = val;
    }
  }

  get letterSpacing(): LetterSpacing {
    return this._letterSpacing;
  }
  set letterSpacing(val: LetterSpacing) {
    this._letterSpacing = val;
    for (const cs of this._charStyles) {
      cs.letterSpacing = val;
    }
  }

  get fills(): readonly Paint[] {
    return this._fills;
  }
  set fills(val: readonly Paint[]) {
    this._fills = val;
    for (const cs of this._charStyles) {
      cs.fills = val;
    }
  }

  get textDecoration(): TextDecoration {
    return this._textDecoration;
  }
  set textDecoration(val: TextDecoration) {
    this._textDecoration = val;
    for (const cs of this._charStyles) {
      cs.textDecoration = val;
    }
  }

  get hyperlink(): HyperlinkTarget | null {
    return this._hyperlink;
  }
  set hyperlink(val: HyperlinkTarget | null) {
    this._hyperlink = val;
    for (const cs of this._charStyles) {
      cs.hyperlink = val;
    }
  }

  private reinitializeCharStyles(): void {
    const len = this._characters.length;
    this._charStyles = Array.from({ length: len }, () => ({
      fontName: { ...this._fontName },
      fontSize: this._fontSize,
      lineHeight: { ...this._lineHeight },
      letterSpacing: { ...this._letterSpacing },
      fills: [...this._fills],
      textDecoration: this._textDecoration,
      hyperlink: this._hyperlink ? { ...this._hyperlink } : null,
    }));
  }

  private ensureCharStyles(): void {
    if (this._charStyles.length !== this._characters.length) {
      this.reinitializeCharStyles();
    }
  }

  setRangeFontSize(start: number, end: number, value: number): void {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    for (let i = s; i < e; i++) {
      if (this._charStyles[i]) {
        this._charStyles[i]!.fontSize = value;
      }
    }
  }

  getRangeFontSize(start: number, end: number): number | PluginAPI["mixed"] {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    if (s >= e) return this._fontSize;
    const first = this._charStyles[s]?.fontSize ?? this._fontSize;
    for (let i = s + 1; i < e; i++) {
      if (this._charStyles[i]?.fontSize !== first) {
        return getMixedSymbol();
      }
    }
    return first;
  }

  setRangeFontName(start: number, end: number, value: FontNameInput): void {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    const fontName: FontName = {
      family: value.family,
      style: value.style ?? "Regular",
    };
    for (let i = s; i < e; i++) {
      if (this._charStyles[i]) {
        this._charStyles[i]!.fontName = fontName;
      }
    }
  }

  getRangeFontName(start: number, end: number): FontName | PluginAPI["mixed"] {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    if (s >= e) return this._fontName;
    const first = this._charStyles[s]?.fontName ?? this._fontName;
    for (let i = s + 1; i < e; i++) {
      const cur = this._charStyles[i]?.fontName ?? this._fontName;
      if (cur.family !== first.family || cur.style !== first.style) {
        return getMixedSymbol();
      }
    }
    return first;
  }

  setRangeFills(start: number, end: number, value: Paint[]): void {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    for (let i = s; i < e; i++) {
      if (this._charStyles[i]) {
        this._charStyles[i]!.fills = [...value];
      }
    }
  }

  getRangeFills(start: number, end: number): Paint[] | PluginAPI["mixed"] {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    if (s >= e) return [...this._fills];
    const first = this._charStyles[s]?.fills ?? this._fills;
    for (let i = s + 1; i < e; i++) {
      const cur = this._charStyles[i]?.fills ?? this._fills;
      if (JSON.stringify(cur) !== JSON.stringify(first)) {
        return getMixedSymbol();
      }
    }
    return [...first];
  }

  setRangeLetterSpacing(start: number, end: number, value: LetterSpacing): void {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    for (let i = s; i < e; i++) {
      if (this._charStyles[i]) {
        this._charStyles[i]!.letterSpacing = value;
      }
    }
  }

  getRangeLetterSpacing(start: number, end: number): LetterSpacing | PluginAPI["mixed"] {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    if (s >= e) return this._letterSpacing;
    const first = this._charStyles[s]?.letterSpacing ?? this._letterSpacing;
    for (let i = s + 1; i < e; i++) {
      const cur = this._charStyles[i]?.letterSpacing ?? this._letterSpacing;
      if (cur.unit !== first.unit || cur.value !== first.value) {
        return getMixedSymbol();
      }
    }
    return first;
  }

  setRangeLineHeight(start: number, end: number, value: LineHeight): void {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    for (let i = s; i < e; i++) {
      if (this._charStyles[i]) {
        this._charStyles[i]!.lineHeight = value;
      }
    }
  }

  getRangeLineHeight(start: number, end: number): LineHeight | PluginAPI["mixed"] {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    if (s >= e) return this._lineHeight;
    const first = this._charStyles[s]?.lineHeight ?? this._lineHeight;
    for (let i = s + 1; i < e; i++) {
      const cur = this._charStyles[i]?.lineHeight ?? this._lineHeight;
      if (JSON.stringify(cur) !== JSON.stringify(first)) {
        return getMixedSymbol();
      }
    }
    return first;
  }

  setRangeTextDecoration(start: number, end: number, value: TextDecoration): void {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    for (let i = s; i < e; i++) {
      if (this._charStyles[i]) {
        this._charStyles[i]!.textDecoration = value;
      }
    }
  }

  getRangeTextDecoration(start: number, end: number): TextDecoration | PluginAPI["mixed"] {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    if (s >= e) return this._textDecoration;
    const first = this._charStyles[s]?.textDecoration ?? this._textDecoration;
    for (let i = s + 1; i < e; i++) {
      const cur = this._charStyles[i]?.textDecoration ?? this._textDecoration;
      if (cur !== first) {
        return getMixedSymbol();
      }
    }
    return first;
  }

  setRangeHyperlink(start: number, end: number, value: HyperlinkTarget | null): void {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    for (let i = s; i < e; i++) {
      if (this._charStyles[i]) {
        this._charStyles[i]!.hyperlink = value;
      }
    }
  }

  getRangeHyperlink(start: number, end: number): HyperlinkTarget | null | PluginAPI["mixed"] {
    this.ensureCharStyles();
    const s = Math.max(0, start);
    const e = Math.min(this._characters.length, end);
    if (s >= e) return this._hyperlink;
    const first = this._charStyles[s]?.hyperlink ?? this._hyperlink;
    for (let i = s + 1; i < e; i++) {
      const cur = this._charStyles[i]?.hyperlink ?? this._hyperlink;
      if (JSON.stringify(cur) !== JSON.stringify(first)) {
        return getMixedSymbol();
      }
    }
    return first;
  }

  getStyledTextSegments<
    StyledTextSegmentFields extends (keyof Omit<StyledTextSegment, "characters" | "start" | "end">)[],
  >(
    fields: StyledTextSegmentFields,
    start?: number,
    end?: number,
  ): Array<Pick<StyledTextSegment, StyledTextSegmentFields[number] | "characters" | "start" | "end">> {
    this.ensureCharStyles();
    const reqStart = Math.max(0, start ?? 0);
    const reqEnd = Math.min(this._characters.length, end ?? this._characters.length);
    if (reqStart >= reqEnd) {
      return [];
    }

    const segments: Array<
      Pick<StyledTextSegment, StyledTextSegmentFields[number] | "characters" | "start" | "end">
    > = [];

    const getFieldValue = (cs: FakeCharStyle, field: string): unknown => {
      switch (field) {
        case "fontSize":
          return cs.fontSize;
        case "fontName":
          return cs.fontName;
        case "fontWeight": {
          const s = cs.fontName.style.toLowerCase();
          if (s.includes("black") || s.includes("heavy")) return 900;
          if (s.includes("extra bold") || s.includes("extrabold")) return 800;
          if (s.includes("bold")) return 700;
          if (s.includes("semi bold") || s.includes("semibold") || s.includes("demi")) return 600;
          if (s.includes("medium")) return 500;
          if (s.includes("light")) return 300;
          if (s.includes("thin")) return 100;
          return 400;
        }
        case "fontStyle":
          return cs.fontName.style.toLowerCase().includes("italic") ? "ITALIC" : "REGULAR";
        case "lineHeight":
          return cs.lineHeight;
        case "letterSpacing":
          return cs.letterSpacing;
        case "fills":
          return cs.fills;
        case "textDecoration":
          return cs.textDecoration;
        case "hyperlink":
          return cs.hyperlink;
        default:
          return undefined;
      }
    };

    const areCharStylesEqualForFields = (a: FakeCharStyle, b: FakeCharStyle): boolean => {
      for (const f of fields) {
        const valA = getFieldValue(a, f as string);
        const valB = getFieldValue(b, f as string);
        if (typeof valA === "object" && valA !== null) {
          if (JSON.stringify(valA) !== JSON.stringify(valB)) return false;
        } else if (valA !== valB) {
          return false;
        }
      }
      return true;
    };

    let segStart = reqStart;
    let currentStyle = this._charStyles[segStart]!;

    for (let i = reqStart + 1; i <= reqEnd; i++) {
      const isEnd = i === reqEnd;
      const nextStyle = isEnd ? null : this._charStyles[i]!;

      if (isEnd || !areCharStylesEqualForFields(currentStyle, nextStyle!)) {
        const segObj: Record<string, unknown> = {
          characters: this._characters.slice(segStart, i),
          start: segStart,
          end: i,
        };
        for (const f of fields) {
          segObj[f as string] = getFieldValue(currentStyle, f as string);
        }
        segments.push(segObj as unknown as Pick<StyledTextSegment, "characters" | "start" | "end" | StyledTextSegmentFields[number]>);

        if (!isEnd) {
          segStart = i;
          currentStyle = nextStyle!;
        }
      }
    }

    return segments;
  }
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
    { fontName: { family: "Arial", style: "Bold" } },
    { fontName: { family: "Arial", style: "Italic" } },
    { fontName: { family: "Arial", style: "Bold Italic" } },
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
