// packages/capture-engine/test/pseudo.test.ts
import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  parseGeneratedContent,
  unescapeCssString,
  capturePseudoElement,
  captureDocument,
} from "../src/index.js";

describe("W2D-011 - Synthetic Pseudo-Element Capture", () => {
  describe("Generated content parser & unescaping", () => {
    it("parses empty or none/normal content", () => {
      expect(parseGeneratedContent("")).toEqual({ kind: "none" });
      expect(parseGeneratedContent(undefined)).toEqual({ kind: "none" });
      expect(parseGeneratedContent("none")).toEqual({ kind: "none" });
      expect(parseGeneratedContent("normal")).toEqual({ kind: "none" });
    });

    it("parses empty quotes content: \"\"", () => {
      expect(parseGeneratedContent('""')).toEqual({ kind: "empty" });
      expect(parseGeneratedContent("''")).toEqual({ kind: "empty" });
    });

    it("parses plain text strings", () => {
      expect(parseGeneratedContent('"NEW"')).toEqual({ kind: "text", value: "NEW" });
      expect(parseGeneratedContent("'Featured'")).toEqual({ kind: "text", value: "Featured" });
    });

    it("unescapes CSS hex unicode glyphs and escapes", () => {
      expect(unescapeCssString("\\2605")).toBe("★");
      expect(unescapeCssString("\\f005")).toBe("\uf005");
      expect(unescapeCssString("\\2192")).toBe("→");
      expect(unescapeCssString("\\A")).toBe("\n");
      expect(unescapeCssString('Hello \\"World\\"')).toBe('Hello "World"');
    });

    it("parses generated content containing CSS unicode escapes", () => {
      expect(parseGeneratedContent('"\\2605"')).toEqual({ kind: "text", value: "★" });
      expect(parseGeneratedContent('"\\2192"')).toEqual({ kind: "text", value: "→" });
    });

    it("flags unsupported content forms (url, counter, attr)", () => {
      const urlRes = parseGeneratedContent('url("icon.png")');
      expect(urlRes.kind).toBe("unsupported");
      expect(urlRes.reason).toBe("url_content");

      const counterRes = parseGeneratedContent("counter(section)");
      expect(counterRes.kind).toBe("unsupported");
      expect(counterRes.reason).toBe("counter_content");

      const attrRes = parseGeneratedContent("attr(data-title)");
      expect(attrRes.kind).toBe("unsupported");
      expect(attrRes.reason).toBe("unresolved_attr");
    });
  });

  describe("capturePseudoElement pure helper", () => {
    function createMockElement(styles: {
      parent: Partial<CSSStyleDeclaration>;
      pseudo: Partial<CSSStyleDeclaration>;
      rect?: Partial<DOMRect>;
    }) {
      const dom = new JSDOM("<!doctype html><html><body><div id='test'></div></body></html>");
      const { window } = dom;
      const element = window.document.getElementById("test")!;

      const parentRect = {
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        top: 20,
        left: 10,
        right: 210,
        bottom: 120,
        toJSON: () => parentRect,
      } as DOMRect;

      const defaultParentStyle = {
        borderLeftWidth: "0px",
        borderTopWidth: "0px",
        borderRightWidth: "0px",
        borderBottomWidth: "0px",
        paddingLeft: "0px",
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        position: "relative",
        ...styles.parent,
      } as CSSStyleDeclaration;

      const defaultPseudoStyle = {
        display: "block",
        visibility: "visible",
        opacity: "1",
        content: '"NEW"',
        position: "absolute",
        left: "8px",
        top: "4px",
        width: "40px",
        height: "20px",
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        fontWeight: "700",
        fontStyle: "normal",
        lineHeight: "20px",
        letterSpacing: "0px",
        color: "rgb(255, 255, 255)",
        backgroundColor: "rgb(255, 0, 0)",
        paddingLeft: "0px",
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        borderTopWidth: "0px",
        borderRightWidth: "0px",
        borderBottomWidth: "0px",
        borderLeftWidth: "0px",
        borderTopColor: "rgba(0,0,0,0)",
        borderRightColor: "rgba(0,0,0,0)",
        borderBottomColor: "rgba(0,0,0,0)",
        borderLeftColor: "rgba(0,0,0,0)",
        borderTopStyle: "none",
        borderRightStyle: "none",
        borderBottomStyle: "none",
        borderLeftStyle: "none",
        borderRadius: "0px",
        boxShadow: "none",
        ...styles.pseudo,
      } as unknown as CSSStyleDeclaration;

      vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
        if (pseudo === "::before" || pseudo === "::after") {
          return defaultPseudoStyle;
        }
        return defaultParentStyle;
      });

      return { element, parentRect, parentStyle: defaultParentStyle, window: window as unknown as Window };
    }

    it("captures high-confidence absolute positioned pseudo badge with background and text", () => {
      const { element, parentRect, parentStyle, window } = createMockElement({
        parent: {},
        pseudo: {
          content: '"NEW"',
          position: "absolute",
          top: "8px",
          left: "8px",
          width: "40px",
          height: "20px",
          backgroundColor: "rgb(255, 0, 0)",
          color: "rgb(255, 255, 255)",
        },
      });

      const warn = vi.fn();
      const nodes = capturePseudoElement({
        element,
        pseudoKind: "::before",
        parentId: "w2d-element-card",
        parentRect,
        parentStyle,
        view: window,
        scrollX: 0,
        scrollY: 0,
        warn,
      });

      expect(nodes).toHaveLength(1);
      const frame = nodes[0]!;
      expect(frame.type).toBe("frame");
      expect(frame.id).toBe("w2d-element-card::before");
      expect(frame.sourceTag).toBe("::before");
      expect(frame.x).toBe(18); // parentRect.left (10) + left (8)
      expect(frame.y).toBe(28); // parentRect.top (20) + top (8)
      expect(frame.width).toBe(40);
      expect(frame.height).toBe(20);
      expect(frame.style?.fills).toEqual([{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }]);

      // Child text node
      expect(frame.children).toHaveLength(1);
      const text = frame.children[0]!;
      expect(text.type).toBe("text");
      expect(text.id).toBe("w2d-element-card::before:text");
      if (text.type === "text") {
        expect(text.characters).toBe("NEW");
        expect(text.textStyle.color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
      }

      // No geometry warning on high-confidence positioned case
      expect(warn).not.toHaveBeenCalledWith("PSEUDO_GEOMETRY_APPROXIMATED", expect.any(String), expect.any(String));
    });

    it("captures pure text icon without container box", () => {
      const { element, parentRect, parentStyle, window } = createMockElement({
        parent: {},
        pseudo: {
          content: '"\\2605"',
          color: "rgb(255, 215, 0)",
          backgroundColor: "rgba(0, 0, 0, 0)",
          position: "static",
        },
      });

      const warn = vi.fn();
      const nodes = capturePseudoElement({
        element,
        pseudoKind: "::before",
        parentId: "w2d-element-star",
        parentRect,
        parentStyle,
        view: window,
        scrollX: 0,
        scrollY: 0,
        warn,
      });

      expect(nodes).toHaveLength(1);
      const textNode = nodes[0]!;
      expect(textNode.type).toBe("text");
      expect(textNode.id).toBe("w2d-element-star::before");
      if (textNode.type === "text") {
        expect(textNode.characters).toBe("★");
        expect(textNode.textStyle.color).toEqual({ r: 1, g: 215 / 255, b: 0, a: 1 });
      }
      expect(warn).toHaveBeenCalledWith("PSEUDO_GEOMETRY_APPROXIMATED", expect.any(String), "w2d-element-star::before");
    });

    it("captures decorative empty-content visual box (content: '')", () => {
      const { element, parentRect, parentStyle, window } = createMockElement({
        parent: {},
        pseudo: {
          content: '""',
          position: "absolute",
          top: "0px",
          left: "0px",
          width: "12px",
          height: "12px",
          backgroundColor: "rgb(0, 128, 255)",
          borderRadius: "6px",
        },
      });

      const warn = vi.fn();
      const nodes = capturePseudoElement({
        element,
        pseudoKind: "::after",
        parentId: "w2d-element-dot",
        parentRect,
        parentStyle,
        view: window,
        scrollX: 0,
        scrollY: 0,
        warn,
      });

      expect(nodes).toHaveLength(1);
      const boxNode = nodes[0]!;
      expect(boxNode.type).toBe("rectangle");
      expect(boxNode.id).toBe("w2d-element-dot::after");
      expect(boxNode.x).toBe(10);
      expect(boxNode.y).toBe(20);
      expect(boxNode.width).toBe(12);
      expect(boxNode.height).toBe(12);
      expect(boxNode.style?.fills).toEqual([{ type: "solid", color: { r: 0, g: 128 / 255, b: 1, a: 1 } }]);
      expect(boxNode.style?.cornerRadius).toBe(6);
    });

    it("ignores invisible or empty pseudo elements", () => {
      const { element, parentRect, parentStyle, window } = createMockElement({
        parent: {},
        pseudo: {
          content: "none",
        },
      });

      const nodes = capturePseudoElement({
        element,
        pseudoKind: "::before",
        parentId: "w2d-element-none",
        parentRect,
        parentStyle,
        view: window,
        scrollX: 0,
        scrollY: 0,
        warn: vi.fn(),
      });

      expect(nodes).toHaveLength(0);
    });

    it("emits PSEUDO_CONTENT_UNSUPPORTED warning on url(...) content", () => {
      const { element, parentRect, parentStyle, window } = createMockElement({
        parent: {},
        pseudo: {
          content: 'url("icon.png")',
        },
      });

      const warn = vi.fn();
      const nodes = capturePseudoElement({
        element,
        pseudoKind: "::before",
        parentId: "w2d-element-url",
        parentRect,
        parentStyle,
        view: window,
        scrollX: 0,
        scrollY: 0,
        warn,
      });

      expect(nodes).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith("PSEUDO_CONTENT_UNSUPPORTED", expect.any(String), "w2d-element-url::before");
    });
  });

  describe("Child ordering and document integration", () => {
    it("orders children: ::before synthetic nodes -> real DOM children -> ::after synthetic nodes", () => {
      const dom = new JSDOM(
        '<!doctype html><html><body><div id="card"><span id="inner">Content</span></div></body></html>',
      );
      const { window } = dom;
      const document = window.document;

      const box = { x: 0, y: 0, width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100, toJSON: () => box };
      vi.spyOn(window.Element.prototype, "getBoundingClientRect").mockImplementation(() => box as DOMRect);

      vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
        const id = (el as Element).id;
        if (id === "card" && pseudo === "::before") {
          return {
            display: "block",
            visibility: "visible",
            opacity: "1",
            content: '"[START]"',
            position: "static",
            color: "rgb(0,0,0)",
            backgroundColor: "rgba(0,0,0,0)",
            fontFamily: "Arial",
          } as unknown as CSSStyleDeclaration;
        }
        if (id === "card" && pseudo === "::after") {
          return {
            display: "block",
            visibility: "visible",
            opacity: "1",
            content: '"[END]"',
            position: "static",
            color: "rgb(0,0,0)",
            backgroundColor: "rgba(0,0,0,0)",
            fontFamily: "Arial",
          } as unknown as CSSStyleDeclaration;
        }
        return {
          display: "block",
          visibility: "visible",
          opacity: "1",
          whiteSpace: "normal",
          color: "rgb(0,0,0)",
          backgroundColor: "rgba(0,0,0,0)",
          borderTopWidth: "0px",
          borderRightWidth: "0px",
          borderBottomWidth: "0px",
          borderLeftWidth: "0px",
          paddingLeft: "0px",
          paddingTop: "0px",
          paddingRight: "0px",
          paddingBottom: "0px",
          fontFamily: "Arial",
        } as unknown as CSSStyleDeclaration;
      });

      vi.spyOn(document, "createRange").mockImplementation(() => ({
        selectNodeContents() {},
        getBoundingClientRect: () => box,
        getClientRects: () => [box],
      }) as unknown as Range);

      const doc = captureDocument(document);
      const card = doc.root.children[0]?.children.find((c) => c.id === "element-0" || c.name === "div");
      expect(card).toBeDefined();

      if (card && card.type === "frame") {
        // Assert child order: ::before, inner content, ::after
        expect(card.children.length).toBeGreaterThanOrEqual(3);
        const first = card.children[0]!;
        const last = card.children[card.children.length - 1]!;

        expect(first.id).toContain("::before");
        expect(last.id).toContain("::after");
      }
    });

    it("verifies DOM immutability post-capture", () => {
      const dom = new JSDOM(
        '<!doctype html><html><body><div id="target" class="my-class">Hello</div></body></html>',
      );
      const { window } = dom;
      const { document } = window;
      const box = { x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, toJSON: () => box };
      vi.spyOn(window.Element.prototype, "getBoundingClientRect").mockImplementation(() => box as DOMRect);
      vi.spyOn(document, "createRange").mockImplementation(() => ({
        selectNodeContents() {},
        getBoundingClientRect: () => box,
        getClientRects: () => [box],
      }) as unknown as Range);

      const bodyChildrenCountBefore = document.body.childNodes.length;
      const targetClassesBefore = document.getElementById("target")!.className;

      captureDocument(document);

      expect(document.body.childNodes.length).toBe(bodyChildrenCountBefore);
      expect(document.getElementById("target")!.className).toBe(targetClassesBefore);
      expect(document.querySelectorAll("span[style*='-9999px']").length).toBe(0);
    });
  });
});
