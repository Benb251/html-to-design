import type { AssetRecord } from "@web2design/design-schema";
import type { Warn } from "./styles.js";

export interface AssetRegistry {
  registerImageUrl(url: string, mimeType?: string, intrinsic?: { width: number; height: number }): string;
  registerImageDataUrl(dataUrl: string, mimeType?: string, intrinsic?: { width: number; height: number }): string;
  registerSvg(serializedSvg: string, intrinsic?: { width: number; height: number }): string;
  getAssets(): AssetRecord[];
}

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createAssetRegistry(): AssetRegistry {
  const assets: AssetRecord[] = [];
  const keyToAssetId = new Map<string, string>();
  let nextImageIndex = 1;
  let nextSvgIndex = 1;

  return {
    registerImageUrl(url: string, mimeType?: string, intrinsic?: { width: number; height: number }): string {
      const key = `url:${url}`;
      const existing = keyToAssetId.get(key);
      if (existing) return existing;
      const id = `asset-image-${nextImageIndex++}`;
      keyToAssetId.set(key, id);
      assets.push({
        id,
        kind: "image",
        source: { type: "url", url },
        contentHash: `url:${fnv1a(url)}`,
        ...(mimeType ? { mimeType } : {}),
        ...(intrinsic && intrinsic.width > 0 && intrinsic.height > 0 ? { intrinsicDimensions: intrinsic } : {}),
      });
      return id;
    },
    registerImageDataUrl(dataUrl: string, mimeType?: string, intrinsic?: { width: number; height: number }): string {
      const key = `data:${dataUrl}`;
      const existing = keyToAssetId.get(key);
      if (existing) return existing;
      const id = `asset-image-${nextImageIndex++}`;
      keyToAssetId.set(key, id);
      assets.push({
        id,
        kind: "image",
        source: { type: "data-url", dataUrl },
        contentHash: `data:${fnv1a(dataUrl)}`,
        ...(mimeType ? { mimeType } : {}),
        ...(intrinsic && intrinsic.width > 0 && intrinsic.height > 0 ? { intrinsicDimensions: intrinsic } : {}),
      });
      return id;
    },
    registerSvg(serializedSvg: string, intrinsic?: { width: number; height: number }): string {
      const key = `svg:${serializedSvg}`;
      const existing = keyToAssetId.get(key);
      if (existing) return existing;
      const id = `asset-svg-${nextSvgIndex++}`;
      keyToAssetId.set(key, id);
      assets.push({
        id,
        kind: "svg",
        source: {
          type: "data-url",
          dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(serializedSvg)}`,
        },
        contentHash: `svg:${fnv1a(serializedSvg)}`,
        mimeType: "image/svg+xml",
        ...(intrinsic && intrinsic.width > 0 && intrinsic.height > 0 ? { intrinsicDimensions: intrinsic } : {}),
      });
      return id;
    },
    getAssets(): AssetRecord[] {
      return assets;
    },
  };
}

export function inferUrlMimeType(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".svg")) return "image/svg+xml";
    if (pathname.endsWith(".gif")) return "image/gif";
    if (pathname.endsWith(".avif")) return "image/avif";
    if (pathname.endsWith(".ico")) return "image/x-icon";
  } catch {
    return undefined;
  }
  return undefined;
}

export function parseDataUrlMimeType(dataUrl: string): string | undefined {
  const match = /^data:([a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+)/.exec(dataUrl);
  return match ? match[1] : undefined;
}

export function materializeBlobImage(img: HTMLImageElement): { dataUrl: string; mimeType: string } | undefined {
  try {
    if (!img.naturalWidth || !img.naturalHeight) return undefined;
    const doc = img.ownerDocument;
    if (!doc) return undefined;
    const canvas = doc.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    if (!dataUrl || !dataUrl.startsWith("data:image/png")) return undefined;
    return { dataUrl, mimeType: "image/png" };
  } catch {
    return undefined;
  }
}

export interface SvgCaptureResult {
  serializedSvg: string;
  intrinsicDimensions?: { width: number; height: number };
}

export function serializeAndSanitizeSvg(
  svgElement: Element,
  view: Window | null,
  warn: Warn,
): SvgCaptureResult {
  let intrinsicDimensions: { width: number; height: number } | undefined;
  const vb = svgElement.getAttribute("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && parts[2]! > 0 && Number.isFinite(parts[3]) && parts[3]! > 0) {
      intrinsicDimensions = { width: parts[2]!, height: parts[3]! };
    }
  }
  if (!intrinsicDimensions) {
    const w = parseFloat(svgElement.getAttribute("width") || "");
    const h = parseFloat(svgElement.getAttribute("height") || "");
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      intrinsicDimensions = { width: w, height: h };
    }
  }

  const clone = svgElement.cloneNode(true) as Element;
  if (clone.hasAttribute("id")) {
    clone.removeAttribute("id");
  }
  if (!clone.hasAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  let sanitized = false;
  let externalRef = false;

  function processElement(liveNode: Element, cloneNode: Element): void {
    const tag = cloneNode.localName.toLowerCase();

    // Detect external references
    if (tag === "use") {
      const href = cloneNode.getAttribute("href") || cloneNode.getAttribute("xlink:href") || "";
      if (href && !href.startsWith("#")) {
        externalRef = true;
      }
    }
    if (tag === "image") {
      const href = cloneNode.getAttribute("href") || cloneNode.getAttribute("xlink:href") || "";
      if (href && !href.startsWith("data:")) {
        externalRef = true;
      }
    }

    // Sanitize dangerous attributes
    const attrNames = Array.from(cloneNode.attributes).map(a => a.name);
    for (const name of attrNames) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on")) {
        cloneNode.removeAttribute(name);
        sanitized = true;
      } else if (lower === "href" || lower === "xlink:href") {
        const val = (cloneNode.getAttribute(name) || "").trim().toLowerCase();
        if (val.startsWith("javascript:") || val.startsWith("data:text/html")) {
          cloneNode.removeAttribute(name);
          sanitized = true;
        }
      }
    }

    // Inlining computed visual styles for SVG shape elements
    if (view) {
      const style = view.getComputedStyle(liveNode);
      const isGraphic = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan"].includes(tag);

      if (isGraphic || tag === "g") {
        // fill
        const attrFill = cloneNode.getAttribute("fill");
        if (attrFill && /^url\(#/.test(attrFill.trim())) {
          // Keep local gradient/filter reference intact
        } else if (style.fill && style.fill !== "") {
          if (style.fill === "none") {
            cloneNode.setAttribute("fill", "none");
          } else {
            const hashMatch = /#([a-zA-Z0-9_-]+)\)?$/.exec(style.fill);
            if (style.fill.includes("url(") && hashMatch) {
              cloneNode.setAttribute("fill", `url(#${hashMatch[1]})`);
            } else {
              cloneNode.setAttribute("fill", style.fill);
            }
          }
        }

        // fill-opacity
        if (style.fillOpacity && style.fillOpacity !== "1" && style.fillOpacity !== "") {
          cloneNode.setAttribute("fill-opacity", style.fillOpacity);
        }

        // stroke
        const attrStroke = cloneNode.getAttribute("stroke");
        if (attrStroke && /^url\(#/.test(attrStroke.trim())) {
          // Keep local reference
        } else if (style.stroke && style.stroke !== "none" && style.stroke !== "") {
          const hashMatch = /#([a-zA-Z0-9_-]+)\)?$/.exec(style.stroke);
          if (style.stroke.includes("url(") && hashMatch) {
            cloneNode.setAttribute("stroke", `url(#${hashMatch[1]})`);
          } else {
            cloneNode.setAttribute("stroke", style.stroke);
          }
          if (style.strokeWidth && style.strokeWidth !== "") {
            cloneNode.setAttribute("stroke-width", style.strokeWidth);
          }
          if (style.strokeOpacity && style.strokeOpacity !== "1" && style.strokeOpacity !== "") {
            cloneNode.setAttribute("stroke-opacity", style.strokeOpacity);
          }
          if (style.strokeLinecap && style.strokeLinecap !== "" && !cloneNode.hasAttribute("stroke-linecap")) {
            cloneNode.setAttribute("stroke-linecap", style.strokeLinecap);
          }
          if (style.strokeLinejoin && style.strokeLinejoin !== "" && !cloneNode.hasAttribute("stroke-linejoin")) {
            cloneNode.setAttribute("stroke-linejoin", style.strokeLinejoin);
          }
        }

        // opacity (only for descendants, not root svg)
        if (cloneNode !== clone && style.opacity && style.opacity !== "1" && style.opacity !== "" && !cloneNode.hasAttribute("opacity")) {
          cloneNode.setAttribute("opacity", style.opacity);
        }
      }
    }

    // Process children, removing <script>
    const liveChildren = Array.from(liveNode.children);
    const cloneChildren = Array.from(cloneNode.children);
    for (let i = 0; i < liveChildren.length && i < cloneChildren.length; i++) {
      const lc = liveChildren[i]!;
      const cc = cloneChildren[i]!;
      if (cc.localName.toLowerCase() === "script") {
        cc.remove();
        sanitized = true;
      } else {
        processElement(lc, cc);
      }
    }
  }

  processElement(svgElement, clone);

  if (sanitized) {
    warn("SVG_SANITIZED", "Script or event-handler content was removed from serialized SVG.");
  }
  if (externalRef) {
    warn("SVG_EXTERNAL_REFERENCE", "SVG references external resource that may not be portable.");
  }

  let serializedSvg: string;
  if (typeof XMLSerializer !== "undefined") {
    serializedSvg = new XMLSerializer().serializeToString(clone);
  } else {
    serializedSvg = clone.outerHTML;
  }

  return {
    serializedSvg,
    ...(intrinsicDimensions ? { intrinsicDimensions } : {}),
  };
}
