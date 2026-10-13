import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { safeParseDesignDocument, type DesignNode, type SolidFill } from "@web2design/design-schema";
import { boxShadow, captureDocument, characters, cssColor, parseBoxShadows, textStyle, visualStyle } from "../src/index.js";

const flatten = (node: DesignNode): DesignNode[] => [node, ...node.children.flatMap(flatten)];
const at = "2026-10-13T07:00:00.000Z";
function fixture(body: string, scrollX = 0, scrollY = 0) {
  const dom = new JSDOM('<!doctype html><style>body{font:16px/24px Arial;color:rgb(20,40,60)}</style><body>' + body + '</body>', { url: "https://example.com" });
  const { window } = dom, { document } = window;
  Object.defineProperties(window, { scrollX: { value: scrollX }, scrollY: { value: scrollY } });
  vi.spyOn(window.Element.prototype, "getBoundingClientRect").mockImplementation(function(this: Element) {
    const x = Number(this.getAttribute("data-x") ?? 10.5) - scrollX, y = Number(this.getAttribute("data-y") ?? 30.25) - scrollY;
    return { x, y, width: 120.5, height: 60.75 } as DOMRect;
  });
  vi.spyOn(document, "createRange").mockImplementation(() => {
    let node: Node;
    return { selectNodeContents(value: Node) { node = value; }, getBoundingClientRect() {
      if (/^[\t\r\n\f ]+$/.test(node.textContent ?? "") && !["pre", "pre-wrap", "break-spaces"].includes(window.getComputedStyle(node.parentElement!).whiteSpace)) return { x: 0, y: 0, width: 0, height: 0 };
      return { x: Number(node.parentElement?.getAttribute("data-x") ?? 10.5) + 14.25 - scrollX,
        y: Number(node.parentElement?.getAttribute("data-y") ?? 30.25) + 12.5 - scrollY, width: 33.328125, height: 18.75 };
    }, getClientRects() { return [{ x: 0, y: 0, width: 33.328125, height: 18.75 }]; } } as unknown as Range;
  });
  const capture = () => captureDocument(document, { capturedAt: at });
  return { document, window, capture };
}
const css = (values: Partial<CSSStyleDeclaration>) => ({ fontStyle: "normal", ...values }) as CSSStyleDeclaration;
describe("W2D-004 computed styles", () => {
  for (const [input, result] of [
    ["rgba(0, 0, 0, .15)", { r: 0, g: 0, b: 0, a: .15 }],
    ["rgb(18 52 86 / 25%)", { r: 18 / 255, g: 52 / 255, b: 86 / 255, a: .25 }],
    ["color(srgb 0.2 0.4 0.6 / .5)", { r: .2, g: .4, b: .6, a: .5 }],
    ["color(srgb 120% -10% 50%)", { r: 1, g: 0, b: .5, a: 1 }],
  ] as const) it("normalizes color " + input, () => expect(cssColor(input)).toEqual(result));
  for (const value of ["rgb(bad 0 0)", "color(display-p3 1 0 0)", "rgba(0,0)"]) it("omits unresolved color " + value, () => expect(cssColor(value)).toBeUndefined());
  it("captures a single shadow with rgba commas and distinct alpha", () => {
    expect(boxShadow("rgba(0, 0, 0, 0.15) 0px 4px 12px 2.5px", vi.fn())).toEqual({ offsetX: 0, offsetY: 4, blurRadius: 12, spreadRadius: 2.5, color: { r: 0, g: 0, b: 0, a: .15 }, inset: false });
  });
  it("captures the common three-length outer shadow with zero spread", () => {
    expect(boxShadow("0px 4px 12px rgba(0,0,0,.15)", vi.fn())).toMatchObject({ offsetX: 0, offsetY: 4, blurRadius: 12, spreadRadius: 0, color: { a: .15 } });
  });
  for (const property of ["borderLeftWidth", "borderLeftStyle", "borderLeftColor"] as const) it("captures borders with different per-side " + property, () => {
    const { document, window } = fixture('<div></div>');
    const element = document.querySelector("div")!; element.style.border = "2px solid rgb(18,52,86)";
    element.style[property] = property === "borderLeftWidth" ? "4px" : property === "borderLeftStyle" ? "dashed" : "rgb(0,0,0)";
    const warn = vi.fn();
    const border = visualStyle(window.getComputedStyle(element), warn).border;
    expect(border).toBeDefined();
    if (property === "borderLeftWidth") {
      expect(border?.left.width).toBe(4);
      expect(border?.top.width).toBe(2);
    } else if (property === "borderLeftStyle") {
      expect(border?.left.style).toBe("dashed");
      expect(border?.top.style).toBe("solid");
    } else {
      expect(border?.left.color).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    }
  });
  it("supports color-last shadows, zero blur and negative spread", () => {
    expect(boxShadow("-1.25px 4px 0 -2px rgb(18 52 86 / 50%)", vi.fn())).toMatchObject({ offsetX: -1.25, offsetY: 4, blurRadius: 0, spreadRadius: -2, color: { a: .5 } });
  });
  it("does not warn for none", () => { const warn = vi.fn(); expect(boxShadow("none", warn)).toBeUndefined(); expect(warn).not.toHaveBeenCalled(); });
  it("captures multiple shadows and inset shadows", () => {
    const multi = parseBoxShadows("0px 4px 12px black, inset 0px 1px 2px rgba(255,255,255,.5)", vi.fn());
    expect(multi).toHaveLength(2);
    expect(multi[0]?.inset).toBe(false);
    expect(multi[1]?.inset).toBe(true);
  });
  for (const value of ["rgb(0,0,0) 0px 4px -12px", "0px 4px", "rgba(0,0,0,.1) 0px bad", "rgb(0,0,0 0px 4px"]) {
    it("warns and omits unsupported shadow " + value, () => { const warn = vi.fn(); expect(boxShadow(value, warn)).toBeUndefined(); expect(warn).toHaveBeenCalledWith("SHADOW_UNSUPPORTED", expect.any(String)); });
  }
  for (const borderStyle of ["solid", "dashed", "dotted", "double"]) it("preserves uniform schema-supported " + borderStyle + " borders", () => {
    const { document, window } = fixture('<div></div>');
    const element = document.querySelector("div")!; element.style.border = "1.5px " + borderStyle + " rgba(18,52,86,.5)";
    expect(visualStyle(window.getComputedStyle(element), vi.fn()).border?.top).toMatchObject({ width: 1.5, style: borderStyle, color: { a: .5 } });
    expect(visualStyle(window.getComputedStyle(element), vi.fn()).border?.left).toMatchObject({ width: 1.5, style: borderStyle, color: { a: .5 } });
  });
  it("omits transparent fill and preserves fill alpha independently", () => {
    expect(visualStyle(css({ backgroundColor: "transparent" }), vi.fn()).fills).toBeUndefined();
    expect((visualStyle(css({ backgroundColor: "rgba(20,40,60,.25)" }), vi.fn()).fills?.[0] as SolidFill)?.color.a).toBe(.25);
  });
  it("preserves circular per-corner radii already supported in V0.1", () => {
    expect(visualStyle(css({ borderTopLeftRadius: "1.25px", borderTopRightRadius: "2px 2px", borderBottomRightRadius: "3px", borderBottomLeftRadius: "4px" }), vi.fn()).cornerRadius).toEqual({ topLeft: 1.25, topRight: 2, bottomRight: 3, bottomLeft: 4 });
  });
  it("normalizes overlapping corners to their used circular radii", () => {
    expect(visualStyle(css({ borderRadius: "80px" }), vi.fn(), { width: 120, height: 40 }).cornerRadius).toBe(20);
  });
  for (const value of ["50%", "10px 20px"]) it("warns and omits unrepresentable radius " + value, () => {
    const warn = vi.fn(); expect(visualStyle(css({ borderTopLeftRadius: value }), warn).cornerRadius).toBeUndefined(); expect(warn).toHaveBeenCalledWith("RADIUS_UNSUPPORTED", expect.any(String));
  });
  for (const [weight, expected] of [["normal", 400], ["bold", 700], ["400", 400], ["700", 700]] as const) it("normalizes font weight " + weight, () => {
    expect(textStyle(css({ fontFamily: '"Example", Arial, sans-serif', fontSize: "18.75px", fontWeight: weight, fontStyle: "oblique 10deg", lineHeight: "24px", letterSpacing: "0.5px", textAlign: "right", color: "rgb(18,52,86)" }), vi.fn())).toMatchObject({ fontFamily: "Example", fontFallbacks: ["Arial", "sans-serif"], fontSize: 18.75, fontWeight: expected, fontStyle: "oblique", lineHeight: 24, letterSpacing: .5, textAlign: "right" });
  });
  it("uses deterministic documented normal line height and tracking", () => {
    const warn = vi.fn(); expect(textStyle(css({ fontFamily: "Arial", fontSize: "18.75px", fontWeight: "normal", lineHeight: "normal", letterSpacing: "normal", color: "rgb(0,0,0)" }), warn)).toMatchObject({ lineHeight: 22.5, letterSpacing: 0 });
    expect(warn).toHaveBeenCalledWith("LINE_HEIGHT_APPROXIMATED", expect.any(String));
  });
});
describe("W2D-004 text and hierarchy", () => {
  it("captures the body canvas background once without body-alpha duplication", () => {
    const { document, capture } = fixture('<p>canvas</p>');
    document.body.style.backgroundColor = "rgba(20,40,60,.25)"; document.body.style.opacity = ".5";
    const result = capture();
    expect((result.root.style?.fills?.[0] as SolidFill)?.color.a).toBe(.25);
    expect(result.root.children[0]?.style?.fills).toBeUndefined();
    expect(result.root.children[0]?.opacity).toBe(.5);
  });
  it("keeps body fill local when HTML supplies its own canvas background", () => {
    const { document, capture } = fixture('<p>canvas</p>');
    document.documentElement.style.backgroundColor = "rgb(10,20,30)"; document.body.style.backgroundColor = "rgba(20,40,60,.25)";
    const result = capture();
    expect((result.root.style?.fills?.[0] as SolidFill)?.color.a).toBe(1);
    expect((result.root.children[0]?.style?.fills?.[0] as SolidFill)?.color.a).toBe(.25);
  });
  it("does not propagate display-none body backgrounds to the canvas", () => {
    const { document, capture } = fixture('<p>hidden</p>');
    document.body.style.backgroundColor = "rgb(20,40,60)"; document.body.style.display = "none";
    expect(capture().root.style?.fills).toBeUndefined();
  });
  it("keeps contained body backgrounds on the body box", () => {
    const { document, capture } = fixture('<p>contained</p>');
    document.body.style.backgroundColor = "rgb(20,40,60)"; document.body.style.contain = "paint";
    const result = capture(); expect(result.root.style?.fills).toBeUndefined(); expect((result.root.children[0]?.style?.fills?.[0] as SolidFill)?.color.a).toBe(1);
  });
  it("normalizes segment breaks in preformatted text without collapsing spaces", () => expect(characters("one\r\n  two\rthree", "pre-wrap")).toBe("one\n  two\nthree"));
  for (const [mode, expected] of [["normal", "one two three"], ["nowrap", "one two three"], ["pre", "one  two\n three"], ["pre-wrap", "one  two\n three"], ["pre-line", "one two\nthree"], ["break-spaces", "one  two\n three"]]) {
    it("normalizes whitespace for " + mode, () => expect(characters("one  two\n three", mode!)).toBe(expected));
  }
  it("uses separate Range geometry for separate direct text nodes inside padding", () => {
    const { document, capture } = fixture('<div style="padding:12px;background:rgb(20,40,60)"></div>');
    const parent = document.querySelector("div")!; parent.append(document.createTextNode("first"), document.createComment("split"), document.createTextNode("second"));
    const all = flatten(capture().root), texts = all.filter(node => node.type === "text");
    expect(texts.map(node => node.characters)).toEqual(["first", "second"]);
    expect(texts.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([{ x: 24.75, y: 42.75, width: 33.328125, height: 18.75 }, { x: 24.75, y: 42.75, width: 33.328125, height: 18.75 }]);
    expect(all.find(node => node.sourceTag === "div" && node.type === "frame")?.width).toBe(120.5);
  });
  it("preserves nested absolute geometry, negative positions and long documents across both scroll offsets", () => {
    const html = '<section data-x="-10.25" data-y="2000.5"><div data-x="18.75" data-y="2020.25" style="background:rgb(20,40,60)">text</div></section>';
    const first = fixture(html).capture(), second = fixture(html, 100, 1500).capture();
    expect(flatten(first.root).map(({ id, x, y, width, height }) => ({ id, x, y, width, height }))).toEqual(flatten(second.root).map(({ id, x, y, width, height }) => ({ id, x, y, width, height })));
    expect(flatten(first.root).find(node => node.sourceTag === "section")?.x).toBe(-10.25);
    expect(flatten(first.root).find(node => node.type === "text")?.y).toBe(2032.75);
  });
  it("preserves both opacity groups and independent fill alpha", () => {
    const result = fixture('<div style="opacity:.5;background:rgba(20,40,60,.25)"><span style="opacity:.5">Text</span></div>').capture();
    const all = flatten(result.root);
    expect(all.find(node => node.sourceTag === "div" && node.type === "frame")?.opacity).toBe(.5);
    expect(all.find(node => node.sourceTag === "span" && node.type === "frame")?.opacity).toBe(.5);
    expect(all.find(node => node.type === "text")?.opacity).toBe(1);
    expect((all.find(node => node.sourceTag === "div")?.style?.fills?.[0] as SolidFill)?.color.a).toBe(.25);
  });
  it("retains shadow-only containers and deterministically prunes empty structural wrappers", () => {
    const { capture } = fixture('<div><span>plain</span></div><div style="box-shadow:0px 4px 12px rgba(0,0,0,.15)"><span>shadowed</span></div>');
    const result = capture(); expect(flatten(result.root).filter(node => node.sourceTag === "div" && node.type === "frame")).toHaveLength(1);
    expect(flatten(result.root).find(node => node.style?.boxShadows)?.children[0]?.type).toBe("text");
    expect(capture()).toEqual(result);
  });
  it("preserves rendered whitespace-only pre text and nonbreaking spaces", () => {
    const texts = flatten(fixture('<pre>   </pre><p>\u00a0</p><p>   </p>').capture().root).filter(node => node.type === "text");
    expect(texts.map(node => node.characters)).toEqual(["   ", "\u00a0"]);
  });
  it("warns once per unsupported feature with valid node references", () => {
    const { document, capture } = fixture('<div>first</div>'.repeat(10));
    document.querySelectorAll("div").forEach(element => { element.style.backgroundColor = "rgb(0,0,0)"; element.style.transform = "translateX(2px)"; element.style.zIndex = "2"; });
    const result = capture();
    expect(result.warnings?.filter(warning => warning.code === "TRANSFORM_APPROXIMATED")).toHaveLength(1);
    expect(result.warnings?.filter(warning => warning.code === "PAINT_ORDER_UNSUPPORTED")).toHaveLength(1);
    expect(result.warnings?.find(warning => warning.code === "TRANSFORM_APPROXIMATED")?.nodeId).toBe("w2d-element-0");
    expect(safeParseDesignDocument(result).success).toBe(true);
  });
  it("never references pruned nodes in warnings and respects DOM text order", () => {
    const result = fixture('<span style="transform:translateX(2px)">first</span><span>second</span>').capture();
    expect(result.warnings?.find(warning => warning.code === "TRANSFORM_APPROXIMATED")?.nodeId).toBeUndefined();
    expect(flatten(result.root).filter(node => node.type === "text").map(node => node.characters)).toEqual(["first", "second"]);
    expect(safeParseDesignDocument(result).success).toBe(true);
  });
});
