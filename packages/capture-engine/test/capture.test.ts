import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { safeParseDesignDocument, type DesignNode, type SolidFill, type TextNode } from "@web2design/design-schema";
import { captureDocument, captureFilename, captureId, characters, countNodes, cssColor, cssPixels, documentRect, fontFamilies, renderDecision, serializeCapture, textStyle, visualStyle } from "../src/index.js";
const at = "2026-10-13T07:00:00.000Z";
function rendered(body = '<main><h1>Hello</h1><p>World <strong>bold</strong></p><button>Capture</button></main>', scroll = 0) {
  const dom = new JSDOM('<!doctype html><html><head><title>Fixture</title><style>body{font:16px/24px Arial,sans-serif;color:rgb(16,32,48)}h1{font-size:32px;line-height:40px;font-weight:700}strong{font-weight:700}</style></head><body>' + body + '</body></html>', { url: "https://example.com/fixture" });
  const { window } = dom, document = window.document;
  Object.defineProperties(window, { scrollY: { value: scroll, configurable: true }, scrollX: { value: 4, configurable: true } });
  const box = { x: 20.5 - window.scrollX, y: 40.25 - scroll, width: 200.5, height: 32 };
  vi.spyOn(window.Element.prototype, "getBoundingClientRect").mockImplementation(() => ({ ...box, top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height, toJSON() { return box; } }));
  vi.spyOn(document, "createRange").mockImplementation(() => ({
    selectNodeContents() {}, getBoundingClientRect() { return box; }, getClientRects() { return [box]; },
  }) as unknown as Range);
  return { dom, document, window };
}
function nodes(node: DesignNode): DesignNode[] { return [node, ...node.children.flatMap(nodes)]; }
const visible = { display: "block", visibility: "visible", opacity: "1", contentVisibility: "visible" };
describe("absolute document-origin CSS geometry", () => {
  it("adds captured scroll without rounding or device-pixel multiplication", () => {
    expect(documentRect({ x: -3.25, y: 20.5, width: 45.75, height: 12 }, 14, 100)).toEqual({ x: 10.75, y: 120.5, width: 45.75, height: 12 });
  });
  it("is stable when viewport rectangles move by the scroll offset", () => {
    expect(documentRect({ x: 12, y: 20, width: 10, height: 10 }, 0, 80)).toEqual(documentRect({ x: 12, y: 100, width: 10, height: 10 }, 0, 0));
  });
  it("rejects malformed geometry", () => { expect(() => documentRect({ x: NaN, y: 0, width: 1, height: 1 }, 0, 0)).toThrow(); });
});
describe("visibility", () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };
  for (const style of [{ ...visible, display: "none" }, { ...visible, opacity: "0" }, { ...visible, contentVisibility: "hidden" }]) {
    it("skips a non-rendered subtree " + JSON.stringify(style), () => expect(renderDecision(style, rect)).toBe("skip-subtree"));
  }
  for (const style of [{ ...visible, visibility: "hidden" }, { ...visible, display: "contents" }]) {
    it("can retain independently rendered descendants " + JSON.stringify(style), () => expect(renderDecision(style, rect)).toBe("traverse-only"));
  }
  it("does not capture zero-size boxes", () => expect(renderDecision(visible, { ...rect, width: 0 })).toBe("traverse-only"));
  it("retains offscreen normal-flow content", () => expect(renderDecision(visible, { ...rect, y: 10000 })).toBe("capture"));
});
describe("normalization", () => {
  for (const [input, expected] of [
    ["rgb(255, 128, 0)", { r: 1, g: 128 / 255, b: 0, a: 1 }], ["rgb(100% 0% 0% / 50%)", { r: 1, g: 0, b: 0, a: 0.5 }],
    ["#1234", { r: 17 / 255, g: 34 / 255, b: 51 / 255, a: 68 / 255 }], ["transparent", { r: 0, g: 0, b: 0, a: 0 }],
  ] as const) it("normalizes " + input, () => expect(cssColor(input)).toEqual(expected));
  it("does not pretend unsupported color functions are captured", () => expect(cssColor("oklch(60% .2 10)")).toBeUndefined());
  it("normalizes pixel values and rejects unresolved units", () => { expect(cssPixels("-0.5px")).toBe(-0.5); expect(cssPixels("1rem")).toBeUndefined(); });
  it("preserves quoted font family/fallback ordering", () => expect(fontFamilies('"Example, Display", Arial, sans-serif')).toEqual(["Example, Display", "Arial", "sans-serif"]));
  it("collapses ordinary whitespace but preserves preformatted text", () => { expect(characters("one\n  two", "normal")).toBe("one two"); expect(characters("one\n  two", "pre-wrap")).toBe("one\n  two"); });
  it("captures computed typography and exposes normal line-height approximation", () => {
    const { document, window } = rendered('<p style="font-family:Arial,serif;font-size:20px;font-weight:600;font-style:italic;line-height:normal;letter-spacing:2px;text-align:center;color:rgba(20,40,60,.5)">Text</p>');
    const warn = vi.fn(), result = textStyle(window.getComputedStyle(document.querySelector("p")!), warn);
    expect(result).toMatchObject({ fontFamily: "Arial", fontFallbacks: ["serif"], fontSize: 20, fontWeight: 600, fontStyle: "italic", lineHeight: 24, letterSpacing: 2, textAlign: "center" });
    expect(result.color.a).toBe(0.5); expect(warn).toHaveBeenCalledWith("LINE_HEIGHT_APPROXIMATED", expect.any(String));
  });
  it("captures uniform fill/border/radius", () => {
    const { document, window } = rendered('<div></div>');
    const element = document.querySelector("div")!;
    element.style.backgroundColor = "rgb(18, 52, 86)";
    element.style.border = "2px solid rgb(68, 85, 102)";
    element.style.borderTopLeftRadius = element.style.borderTopRightRadius = element.style.borderBottomRightRadius = element.style.borderBottomLeftRadius = "12px";
    const result = visualStyle(window.getComputedStyle(element), vi.fn());
    expect(result.cornerRadius).toBe(12); expect(result.border?.width).toBe(2); expect((result.fills?.[0] as SolidFill)?.color.b).toBe(86 / 255);
  });
  it("warns and omits nonuniform borders and non-gradient background images", () => {
    const { document, window } = rendered('<div style="border-top:1px solid black;background-image:url(https://example.com/bg.png)"></div>');
    const warn = vi.fn(), result = visualStyle(window.getComputedStyle(document.querySelector("div")!), warn);
    expect(result.border).toBeUndefined(); expect(warn).toHaveBeenCalledWith("BORDER_UNSUPPORTED", expect.any(String)); expect(warn).toHaveBeenCalledWith("BACKGROUND_IMAGE_UNSUPPORTED", expect.any(String));
  });
});
describe("rendered traversal", () => {
  it("produces runtime-schema-valid editable text with no DOM objects", () => {
    const { document } = rendered(), result = captureDocument(document, { capturedAt: at });
    expect(safeParseDesignDocument(result).success).toBe(true); expect(result.assets).toEqual([]);
    expect(nodes(result.root).filter(node => node.type === "text").map(node => node.characters)).toEqual(["Hello", "World ", "bold", "Capture"]);
    expect(nodes(result.root).every(node => !("ownerDocument" in node))).toBe(true);
    expect(result.capture).toMatchObject({ capturedAt: at, page: { title: "Fixture", url: "https://example.com/fixture" } });
  });
  it("produces stable IDs and absolute coordinates across scroll changes", () => {
    const first = captureDocument(rendered(undefined, 0).document, { capturedAt: at }), second = captureDocument(rendered(undefined, 150).document, { capturedAt: at });
    expect(nodes(first.root).map(({ id, x, y, width, height }) => ({ id, x, y, width, height }))).toEqual(nodes(second.root).map(({ id, x, y, width, height }) => ({ id, x, y, width, height })));
    expect(new Set(nodes(first.root).map(node => node.id)).size).toBe(countNodes(first.root));
  });
  it("uses unique path IDs including child indexes", () => { expect(captureId([1, 23], "text")).not.toBe(captureId([12, 3], "text")); expect(captureId([1], "text")).not.toBe(captureId([1], "element")); expect(() => captureId([-1], "text")).toThrow(); });
  it("omits display-none/transparent text and script content", () => {
    const result = captureDocument(rendered('<p style="display:none">hidden</p><div style="opacity:0"><p>transparent</p></div><script>secret()</script><p>visible</p>').document);
    expect(nodes(result.root).filter(node => node.type === "text").map(node => node.characters)).toEqual(["visible"]);
  });
  it("retains visible descendants overriding hidden visibility", () => {
    const result = captureDocument(rendered('<div style="visibility:hidden">hidden<span style="visibility:visible">visible</span></div>').document);
    expect(nodes(result.root).filter(node => node.type === "text").map(node => node.characters)).toEqual(["visible"]);
  });
  it("does not duplicate descendant text through parent textContent", () => {
    const result = captureDocument(rendered('<div><p>Parent <em>child</em></p></div>').document);
    expect(nodes(result.root).filter(node => node.type === "text").map(node => node.characters)).toEqual(["Parent ", "child"]);
  });
  it("preserves group opacity once rather than multiplying child opacity", () => {
    const result = captureDocument(rendered('<section style="opacity:.5"><p>Fade</p></section>').document);
    expect(nodes(result.root).find(node => node.sourceTag === "section")?.opacity).toBe(0.5);
    expect((nodes(result.root).find(node => node.type === "text") as TextNode).opacity).toBe(1);
  });
  it("emits honest placeholders/warnings for unsupported canvas, media and iframe content", () => {
    const result = captureDocument(rendered('<canvas></canvas><video></video><iframe></iframe>').document);
    expect(result.assets).toEqual([]); expect(nodes(result.root).filter(node => node.type === "rectangle")).toHaveLength(3);
    expect(result.warnings?.map(warning => warning.code)).toContain("CANVAS_UNSUPPORTED");
    expect(result.warnings?.map(warning => warning.code)).toContain("MEDIA_UNSUPPORTED");
    expect(result.warnings?.map(warning => warning.code)).toContain("IFRAME_UNSUPPORTED");
    expect(nodes(result.root).some(node => node.type === "text")).toBe(false);
  });
  it("omits live input/password/textarea values", () => {
    const result = captureDocument(rendered('<input type="password" value="secret"><textarea>private draft</textarea>').document);
    expect(serializeCapture(result)).not.toContain("secret"); expect(serializeCapture(result)).not.toContain("private draft");
  });
  it("omits scroll-dependent positioned content with a warning", () => {
    const result = captureDocument(rendered('<div style="position:fixed">fixed</div><p>flow</p>').document);
    expect(nodes(result.root).filter(node => node.type === "text").map(node => node.characters)).toEqual(["flow"]);
    expect(result.warnings?.map(warning => warning.code)).toContain("POSITION_CONTEXT_UNSUPPORTED");
  });
  it("bounds hostile/large traversal while producing valid partial output", () => {
    const result = captureDocument(rendered("<main>" + "<p>many</p>".repeat(100) + "</main>").document, { maxNodes: 8 });
    expect(countNodes(result.root)).toBeLessThanOrEqual(8); expect(safeParseDesignDocument(result).success).toBe(true);
    expect(result.warnings?.some(warning => warning.code.includes("LIMIT") || warning.code.includes("TRUNCATED"))).toBe(true);
  });
  it("preserves opacity ancestors when the node budget is reached", () => {
    const result = captureDocument(rendered('<section style="opacity:.5">' + "<p>many</p>".repeat(30) + "</section>").document, { maxNodes: 8 });
    const group = nodes(result.root).find(node => node.sourceTag === "section");
    expect(group?.type).toBe("frame");
    expect(group?.opacity).toBe(0.5);
    expect(nodes(result.root).some(node => node.type === "text")).toBe(true);
    expect(countNodes(result.root)).toBeLessThanOrEqual(8);
  });

  it("flattens unstyled inline wrappers instead of creating meaningless frames", () => {
    const result = captureDocument(rendered('<p><span>Hello</span></p>').document);
    expect(nodes(result.root).filter(node => node.type === "frame").map(node => node.sourceTag)).toEqual(["html", "body"]);
    expect(nodes(result.root).find(node => node.type === "text")?.sourceTag).toBe("span");
  });

  it("preserves a root's zero opacity and suppresses its descendants", () => {
    const { document } = rendered();
    document.documentElement.style.opacity = "0";
    const result = captureDocument(document);
    expect(result.root.opacity).toBe(0);
    expect(result.root.children).toEqual([]);
  });

  it("preserves nonbreaking spaces and pre-line breaks", () => {
    expect(characters("a\u00a0 b", "normal")).toBe("a\u00a0 b");
    expect(characters("a  b\n c", "pre-line")).toBe("a b\nc");
  });

  it("rejects invalid capture bounds/timestamps before exporting", () => {
    const { document } = rendered(); expect(() => captureDocument(document, { maxDepth: 100 })).toThrow(); expect(() => captureDocument(document, { capturedAt: "bad" })).toThrow();
  });
});
describe("export", () => {
  it("roundtrips pretty JSON through real validation and node counting", () => {
    const value = captureDocument(rendered().document, { capturedAt: at }), json = serializeCapture(value);
    expect(json).toContain('\n  "schemaVersion": "0.2"'); expect(safeParseDesignDocument(JSON.parse(json)).success).toBe(true); expect(countNodes(value.root)).toBe(nodes(value.root).length);
  });
  it("rejects unknown fields rather than weakening schema validation", () => {
    const value = captureDocument(rendered().document); expect(() => serializeCapture({ ...value, rawDom: {} })).toThrow();
  });
  it("generates safe deterministic hostname/date filenames", () => {
    expect(captureFilename("https://example.com/path", at)).toBe("web2design-example-com-2026-10-13.json");
    expect(captureFilename("file:///C:/fixture.html", at)).toBe("web2design-local-page-2026-10-13.json");
    expect(() => captureFilename("https://example.com", "bad")).toThrow();
  });
});
