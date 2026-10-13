import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { safeParseDesignDocument, type DesignNode, type ImageNode, type SvgNode } from "@web2design/design-schema";
import { captureDocument } from "../src/index.js";

function setupDom(html: string, url = "https://example.com/test-page") {
  const dom = new JSDOM('<!doctype html><html><head><title>Asset Test</title></head><body>' + html + '</body></html>', { url });
  const { window } = dom;
  const { document } = window;
  const box = { x: 10, y: 20, width: 100, height: 80 };
  vi.spyOn(window.Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const w = parseFloat(this.getAttribute("width") || "") || box.width;
    const h = parseFloat(this.getAttribute("height") || "") || box.height;
    return { x: box.x, y: box.y, width: w, height: h, top: box.y, left: box.x, right: box.x + w, bottom: box.y + h, toJSON() { return box; } };
  });
  vi.spyOn(document, "createRange").mockImplementation(() => ({
    selectNodeContents() {},
    setEnd() {},
    getBoundingClientRect() { return box; },
    getClientRects() { return [box]; },
  }) as unknown as Range);
  return { dom, window, document };
}

function allNodes(node: DesignNode): DesignNode[] {
  return [node, ...node.children.flatMap(allNodes)];
}

describe("Asset capture and registry", () => {
  it("captures standard <img> as an image node with a valid asset record", () => {
    const { document } = setupDom('<img id="photo" src="https://example.com/images/photo.png" width="120" height="90">');
    const img = document.getElementById("photo") as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 640 });
    Object.defineProperty(img, "naturalHeight", { value: 480 });

    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const imageNodes = allNodes(doc.root).filter((n): n is ImageNode => n.type === "image");
    expect(imageNodes).toHaveLength(1);
    const node = imageNodes[0]!;
    expect(node.sourceTag).toBe("img");
    expect(node.width).toBe(120);
    expect(node.height).toBe(90);

    const asset = doc.assets.find(a => a.id === node.assetId);
    expect(asset).toBeDefined();
    expect(asset?.kind).toBe("image");
    expect(asset?.source).toEqual({ type: "url", url: "https://example.com/images/photo.png" });
    expect(asset?.mimeType).toBe("image/png");
    expect(asset?.intrinsicDimensions).toEqual({ width: 640, height: 480 });
  });

  it("resolves relative and root-relative image URLs against document base", () => {
    const { document } = setupDom('<img id="rel" src="./assets/icon.png"><img id="root-rel" src="/shared/logo.webp">', "https://example.com/sub/page.html");
    const img1 = document.getElementById("rel") as HTMLImageElement;
    const img2 = document.getElementById("root-rel") as HTMLImageElement;
    Object.defineProperty(img1, "naturalWidth", { value: 32 });
    Object.defineProperty(img1, "naturalHeight", { value: 32 });
    Object.defineProperty(img2, "naturalWidth", { value: 64 });
    Object.defineProperty(img2, "naturalHeight", { value: 64 });

    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const images = allNodes(doc.root).filter((n): n is ImageNode => n.type === "image");
    expect(images).toHaveLength(2);

    const asset1 = doc.assets.find(a => a.id === images[0]?.assetId);
    const asset2 = doc.assets.find(a => a.id === images[1]?.assetId);
    expect(asset1?.source).toEqual({ type: "url", url: "https://example.com/sub/assets/icon.png" });
    expect(asset2?.source).toEqual({ type: "url", url: "https://example.com/shared/logo.webp" });
    expect(asset2?.mimeType).toBe("image/webp");
  });

  it("deduplicates identical image URLs to a single asset entry", () => {
    const { document } = setupDom('<img id="img1" src="https://example.com/logo.png"><img id="img2" src="https://example.com/logo.png">');
    for (const id of ["img1", "img2"]) {
      const el = document.getElementById(id) as HTMLImageElement;
      Object.defineProperty(el, "naturalWidth", { value: 100 });
      Object.defineProperty(el, "naturalHeight", { value: 50 });
    }

    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const images = allNodes(doc.root).filter((n): n is ImageNode => n.type === "image");
    expect(images).toHaveLength(2);
    expect(images[0]?.assetId).toBe(images[1]?.assetId);
    expect(doc.assets).toHaveLength(1);
  });

  it("captures data URL images safely and parses MIME type", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const { document } = setupDom(`<img id="data-img" src="${dataUrl}">`);
    const img = document.getElementById("data-img") as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 1 });
    Object.defineProperty(img, "naturalHeight", { value: 1 });

    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const imageNodes = allNodes(doc.root).filter((n): n is ImageNode => n.type === "image");
    expect(imageNodes).toHaveLength(1);
    const asset = doc.assets.find(a => a.id === imageNodes[0]?.assetId);
    expect(asset?.source).toEqual({ type: "data-url", dataUrl });
    expect(asset?.mimeType).toBe("image/png");
    expect(asset?.intrinsicDimensions).toEqual({ width: 1, height: 1 });
  });

  it("prefers currentSrc over src attribute for responsive images", () => {
    const { document } = setupDom('<img id="resp" src="small.png" srcset="large.png 2x">');
    const img = document.getElementById("resp") as HTMLImageElement;
    Object.defineProperty(img, "currentSrc", { value: "https://example.com/large.png" });
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 600 });

    const doc = captureDocument(document);
    const node = allNodes(doc.root).find((n): n is ImageNode => n.type === "image")!;
    const asset = doc.assets.find(a => a.id === node.assetId)!;
    expect(asset.source).toEqual({ type: "url", url: "https://example.com/large.png" });
  });

  it("handles broken/unloaded images with IMAGE_UNAVAILABLE warning and rectangle box", () => {
    const { document } = setupDom('<img id="broken" src="https://example.com/broken.png">');
    // naturalWidth defaults to 0 (unloaded)
    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);
    expect(doc.assets).toHaveLength(0);

    const rectangles = allNodes(doc.root).filter(n => n.type === "rectangle" && n.sourceTag === "img");
    expect(rectangles).toHaveLength(1);
    expect(doc.warnings?.some(w => w.code === "IMAGE_UNAVAILABLE" && w.nodeId === rectangles[0]?.id)).toBe(true);
  });

  it("captures object-fit metadata on ImageNode", () => {
    const { document } = setupDom('<img id="fit-img" src="https://example.com/img.jpg" style="object-fit: cover;">');
    const img = document.getElementById("fit-img") as HTMLImageElement;
    img.style.objectFit = "cover";
    Object.defineProperty(img, "naturalWidth", { value: 400 });
    Object.defineProperty(img, "naturalHeight", { value: 300 });

    const doc = captureDocument(document);
    const imageNode = allNodes(doc.root).find((n): n is ImageNode => n.type === "image")!;
    expect(imageNode.fit).toBe("cover");
  });
});

describe("Inline SVG capture and serialization", () => {
  it("captures inline <svg> as an svg node with serialized SVG markup and valid asset", () => {
    const { document } = setupDom('<svg id="icon" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="blue"/></svg>');
    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const svgNodes = allNodes(doc.root).filter((n): n is SvgNode => n.type === "svg");
    expect(svgNodes).toHaveLength(1);
    const svgNode = svgNodes[0]!;
    expect(svgNode.sourceTag).toBe("svg");
    expect(svgNode.width).toBe(24);
    expect(svgNode.height).toBe(24);
    expect(svgNode.inlineSvg).toContain("<circle");
    expect(svgNode.inlineSvg).toContain('viewBox="0 0 24 24"');

    const asset = doc.assets.find(a => a.id === svgNode.assetId);
    expect(asset).toBeDefined();
    expect(asset?.kind).toBe("svg");
    expect(asset?.mimeType).toBe("image/svg+xml");
    expect(asset?.intrinsicDimensions).toEqual({ width: 24, height: 24 });
  });

  it("inlines computed CSS class styles into SVG shape elements", () => {
    const html = `
      <style>.styled-path { fill: rgb(255, 0, 0); stroke: rgb(0, 0, 0); stroke-width: 2px; }</style>
      <svg id="styled-svg" viewBox="0 0 50 50">
        <path class="styled-path" d="M0 0h50v50H0z"></path>
      </svg>
    `;
    const { document, window } = setupDom(html);
    const origGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation(function (elt: Element) {
      const s = origGetComputedStyle(elt);
      if (elt.classList?.contains("styled-path")) {
        return {
          ...s,
          fill: "rgb(255, 0, 0)",
          stroke: "rgb(0, 0, 0)",
          strokeWidth: "2px",
          fillOpacity: "1",
          strokeOpacity: "1",
          opacity: "1",
          strokeLinecap: "butt",
          strokeLinejoin: "miter",
        } as unknown as CSSStyleDeclaration;
      }
      return s;
    });

    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const svgNode = allNodes(doc.root).find((n): n is SvgNode => n.type === "svg")!;
    expect(svgNode.inlineSvg).toContain('fill="rgb(255, 0, 0)"');
    expect(svgNode.inlineSvg).toContain('stroke="rgb(0, 0, 0)"');
    expect(svgNode.inlineSvg).toContain('stroke-width="2px"');
  });

  it("preserves local <defs> and gradient references in SVG", () => {
    const html = `
      <svg id="grad-svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="g1"><stop stop-color="red"/></linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#g1)"></rect>
      </svg>
    `;
    const { document } = setupDom(html);
    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const svgNode = allNodes(doc.root).find((n): n is SvgNode => n.type === "svg")!;
    expect(svgNode.inlineSvg).toContain('<linearGradient id="g1"');
    expect(svgNode.inlineSvg).toContain('fill="url(#g1)"');
  });

  it("sanitizes malicious script tags and event handlers with SVG_SANITIZED warning", () => {
    const html = `
      <svg id="bad-svg" viewBox="0 0 20 20">
        <script>alert('xss')</script>
        <circle cx="10" cy="10" r="5" onclick="alert('click')"></circle>
      </svg>
    `;
    const { document } = setupDom(html);
    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const svgNode = allNodes(doc.root).find((n): n is SvgNode => n.type === "svg")!;
    expect(svgNode.inlineSvg).not.toContain("<script");
    expect(svgNode.inlineSvg).not.toContain("onclick");
    expect(doc.warnings?.some(w => w.code === "SVG_SANITIZED")).toBe(true);
  });

  it("detects external SVG references and emits SVG_EXTERNAL_REFERENCE warning", () => {
    const html = `
      <svg id="ext-svg" viewBox="0 0 24 24">
        <use href="https://example.com/sprite.svg#icon"></use>
      </svg>
    `;
    const { document } = setupDom(html);
    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);
    expect(doc.warnings?.some(w => w.code === "SVG_EXTERNAL_REFERENCE")).toBe(true);
  });

  it("deduplicates identical inline SVGs into a single asset", () => {
    const html = `
      <svg id="s1" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>
      <svg id="s2" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>
    `;
    const { document } = setupDom(html);
    const doc = captureDocument(document);
    expect(safeParseDesignDocument(doc).success).toBe(true);

    const svgNodes = allNodes(doc.root).filter((n): n is SvgNode => n.type === "svg");
    expect(svgNodes).toHaveLength(2);
    expect(svgNodes[0]?.assetId).toBe(svgNodes[1]?.assetId);
    expect(doc.assets.filter(a => a.kind === "svg")).toHaveLength(1);
  });
});
