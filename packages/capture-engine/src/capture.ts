import { DESIGN_SCHEMA_VERSION, parseDesignDocument, type DesignDocument, type DesignNode, type DesignWarning, type FrameNode, type ImageNode, type TextNode } from "@web2design/design-schema";
import { captureId, documentRect, renderDecision } from "./geometry.js";
import { cssColor, cssPixels, textStyle, visualStyle, type Warn } from "./styles.js";
import { processElementTransform } from "./transform.js";
import { renderedText } from "./text.js";
import { createAssetRegistry, inferUrlMimeType, parseDataUrlMimeType, materializeBlobImage, serializeAndSanitizeSvg } from "./assets.js";
import { capturePseudoElement } from "./pseudo.js";

const ignored = new Set(["script", "style", "head", "meta", "link", "noscript", "template"]);
const unsupportedMedia = new Set(["canvas", "video", "audio", "iframe", "object", "embed"]);
const groups = new Set(["body", "main", "section", "header", "footer", "article", "nav", "aside"]);
export interface CaptureOptions { capturedAt?: string; maxNodes?: number; maxDepth?: number }
export function captureDocument(document: Document, options: CaptureOptions = {}): DesignDocument {
  const view = document.defaultView;
  if (!view || !document.body) throw new Error("Capture requires a rendered document with a body.");
  const maxNodes = options.maxNodes ?? 5000, maxDepth = options.maxDepth ?? 60;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 2 || maxNodes > 10000 || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 80) throw new Error("Invalid capture bounds.");
  const viewport = { width: view.innerWidth, height: view.innerHeight, devicePixelRatio: view.devicePixelRatio, scrollX: view.scrollX, scrollY: view.scrollY };
  const warnings: DesignWarning[] = [], warned = new Set<string>();
  const assetRegistry = createAssetRegistry();
  const htmlStyle = view.getComputedStyle(document.documentElement), bodyStyle = view.getComputedStyle(document.body);
  // HTML canvas background propagation: BODY's used background moves to the canvas
  // when HTML is transparent. Do not paint that alpha a second time on the body box.
  const htmlColor = cssColor(htmlStyle.backgroundColor);
  const canvasFromBody = htmlColor?.a === 0 && (!htmlStyle.backgroundImage || htmlStyle.backgroundImage === "none") &&
    (!htmlStyle.contain || htmlStyle.contain === "none") && (!bodyStyle.contain || bodyStyle.contain === "none");
  let count = 1, visited = 0;
  // One representative per feature/code bounds warning volume even on large pages.
  // References to pruned/skipped nodes are removed before schema validation.
  const warn: Warn = (code, message, nodeId) => { if (!warned.has(code)) { warned.add(code); warnings.push({ code, message, feature: code.toLowerCase(), ...(nodeId ? { nodeId } : {}) }); } };
  const emit = (node: DesignNode): DesignNode[] => { if (count >= maxNodes) { warn("NODE_LIMIT", "Capture node limit reached; output is partial."); return node.type === "frame" ? node.children : []; } count++; return [node]; };

  function visit(node: Node, path: number[], depth: number, inheritedStyle?: CSSStyleDeclaration): DesignNode[] {
    visited++;
    if (count >= maxNodes || visited > 20000 || depth > maxDepth) { warn("CAPTURE_TRUNCATED", "Node/depth/traversal bound reached; output is partial."); return []; }
    if (node.nodeType === 3) {
      if (!inheritedStyle || inheritedStyle.visibility === "hidden" || inheritedStyle.visibility === "collapse") return [];
      const text = renderedText(node, inheritedStyle, document);
      if (!text) return [];
      const id = captureId(path, "text"), warnText: Warn = (code, message) => warn(code, message, id);
      if (text.fragments > 1) warnText("TEXT_RANGE_APPROXIMATED", "Wrapped/bidirectional text uses one axis-aligned union box per DOM text run; line fragments are not reconstructed.");
      if (inheritedStyle.textTransform && inheritedStyle.textTransform !== "none") warnText("TEXT_TRANSFORM_UNSUPPORTED", "Text uses original characters; CSS text-transform is not applied.");
      return emit({ id, type: "text", sourceTag: node.parentElement?.localName ?? "text", name: "Text",
        ...documentRect(text.rect, viewport.scrollX, viewport.scrollY), opacity: 1, visible: true, children: [], characters: text.characters, textStyle: textStyle(inheritedStyle, warnText) });
    }
    if (node.nodeType !== 1) return [];
    const element = node as Element, tag = element.localName.toLowerCase();
    if (ignored.has(tag)) return [];
    const style = element === document.body ? bodyStyle : view!.getComputedStyle(element), rect = element.getBoundingClientRect();
    const id = captureId(path, "element"), warnElement: Warn = (code, message) => warn(code, message, id);
    const decision = renderDecision(style, rect);
    if (decision === "skip-subtree") return [];
    if (style.position === "fixed" || style.position === "sticky") {
      warn("POSITION_CONTEXT_UNSUPPORTED", "Fixed/sticky elements are omitted to avoid scroll-dependent document coordinates."); return [];
    }

    const geometry = documentRect(rect, viewport.scrollX, viewport.scrollY);
    const offW = (element as HTMLElement).offsetWidth;
    const offH = (element as HTMLElement).offsetHeight;
    const cssW = cssPixels(style.width);
    const cssH = cssPixels(style.height);

    let baseW = offW && offW > 0 ? offW : (cssW && cssW > 0 ? cssW : rect.width);
    let baseH = offH && offH > 0 ? offH : (cssH && cssH > 0 ? cssH : rect.height);

    // If offset dimensions are rounded integers of computed subpixel CSS dimensions, retain subpixel precision:
    if (cssW !== undefined && offW && Math.abs(offW - cssW) < 1) {
      baseW = cssW;
    }
    if (cssH !== undefined && offH && Math.abs(offH - cssH) < 1) {
      baseH = cssH;
    }

    const { transform, warnings: transformWarnings } = processElementTransform(
      style,
      geometry,
      baseW,
      baseH,
      view,
    );
    for (const tw of transformWarnings) {
      warnElement(tw.code, tw.message);
    }

    const hasDynamicTransform =
      Boolean(transform) &&
      ((style.animationName && style.animationName !== "none" && style.animationPlayState !== "paused") ||
        (style.transitionProperty &&
          (style.transitionProperty === "all" || style.transitionProperty.includes("transform")) &&
          style.transitionDuration !== "0s" &&
          style.transitionDuration !== ""));
    if (hasDynamicTransform) {
      warnElement(
        "DYNAMIC_TRANSFORM_SNAPSHOT",
        "Element transform was captured as a snapshot of current rendered animation/transition state.",
      );
    }

    if (style.zIndex && style.zIndex !== "auto" || style.order && style.order !== "0" || /reverse$/.test(style.flexDirection)) warnElement("PAINT_ORDER_UNSUPPORTED", "Explicit z-index/flex order may differ from captured DOM child order; stacking contexts are not reconstructed.");
    if (style.filter && style.filter !== "none") warnElement("FILTER_UNSUPPORTED", "Filters are not captured.");
    if (element.shadowRoot) warnElement("SHADOW_DOM_UNSUPPORTED", "Shadow-root content is omitted.");
    if (["input", "textarea", "select"].includes(tag)) warnElement("FORM_VALUE_UNSUPPORTED", "Live form values (including passwords) are not captured.");

    const effOverflowX = style.overflowX || style.overflow || "visible";
    const effOverflowY = style.overflowY || style.overflow || "visible";
    const clipX = effOverflowX === "hidden" || effOverflowX === "clip";
    const clipY = effOverflowY === "hidden" || effOverflowY === "clip";
    const hasClip = clipX || clipY;

    const isScrollContainer = (effOverflowX === "auto" || effOverflowX === "scroll" || effOverflowY === "auto" || effOverflowY === "scroll") &&
      !(clipX && effOverflowY === "auto") && !(clipY && effOverflowX === "auto");
    if (isScrollContainer) {
      warnElement("SCROLL_CONTAINER_CLIPPING_DEFERRED", "Scroll container overflow auto/scroll clipping and scrollable extent are deferred; viewport clipping is not reconstructed.");
    }
    if ((clipX || clipY) && style.overflowClipMargin && style.overflowClipMargin !== "0px" && style.overflowClipMargin !== "normal" && style.overflowClipMargin !== "content-box") {
      warnElement("OVERFLOW_CLIP_MARGIN_UNSUPPORTED", "Non-default overflow-clip-margin is not supported; standard container bounds are used.");
    }
    if (style.clipPath && style.clipPath !== "none") {
      warnElement("CLIP_PATH_UNSUPPORTED", "CSS clip-path is not supported; shape clipping is not reconstructed.");
    }

    const visuals = decision === "capture" ? visualStyle(style, warnElement, transform ? transform.baseBounds : (style.transform && style.transform !== "none" ? undefined : rect)) : {};
    if (element === document.body && canvasFromBody) delete visuals.fills;
    const base = { id, sourceTag: tag, name: tag, ...geometry, visible: true,
      opacity: Math.min(1, Math.max(0, Number.isFinite(Number(style.opacity)) && style.opacity !== "" ? Number(style.opacity) : 1)), style: visuals,
      ...(transform ? { transform } : {}) };
    if (unsupportedMedia.has(tag)) {
      if (tag === "iframe") {
        warnElement("IFRAME_UNSUPPORTED", "Iframe content is not captured; only an empty box placeholder is present.");
      } else if (tag === "canvas") {
        warnElement("CANVAS_UNSUPPORTED", "Canvas content is not captured; only an empty box placeholder is present.");
      } else {
        warnElement("MEDIA_UNSUPPORTED", "Video/audio media elements are not captured; only empty box placeholders may be present.");
      }
      return decision === "capture" ? emit({ ...base, type: "rectangle", children: [] }) : [];
    }
    if (tag === "img") {
      if (decision !== "capture") return [];
      const img = element as HTMLImageElement;
      const rawSrc = (img.currentSrc || img.getAttribute("src") || img.src || "").trim();
      const isLoaded = Boolean(img.naturalWidth && img.naturalHeight && img.naturalWidth > 0 && img.naturalHeight > 0);

      if (!isLoaded || !rawSrc) {
        warnElement("IMAGE_UNAVAILABLE", "Image is unavailable, unloaded or broken; only an empty box placeholder is captured.");
        return emit({ ...base, type: "rectangle", children: [] });
      }

      const intrinsic = { width: img.naturalWidth, height: img.naturalHeight };
      let assetId: string | undefined;

      if (rawSrc.startsWith("data:")) {
        if (!/^data:[^,]*,[\s\S]+$/.test(rawSrc)) {
          warnElement("IMAGE_UNAVAILABLE", "Data URL image payload is invalid; only an empty box placeholder is captured.");
          return emit({ ...base, type: "rectangle", children: [] });
        }
        const mimeType = parseDataUrlMimeType(rawSrc);
        assetId = assetRegistry.registerImageDataUrl(rawSrc, mimeType, intrinsic);
      } else if (rawSrc.startsWith("blob:")) {
        const materialized = materializeBlobImage(img);
        if (materialized) {
          assetId = assetRegistry.registerImageDataUrl(materialized.dataUrl, materialized.mimeType, intrinsic);
        } else {
          warnElement("BLOB_ASSET_UNAVAILABLE", "Blob URL asset could not be materialized into durable captured data; only an empty box placeholder is captured.");
          return emit({ ...base, type: "rectangle", children: [] });
        }
      } else {
        let resolvedUrl: string | undefined;
        try {
          resolvedUrl = new URL(rawSrc, (element.ownerDocument || document).baseURI || (element.ownerDocument || document).URL).href;
        } catch {
          resolvedUrl = undefined;
        }
        if (!resolvedUrl) {
          warnElement("IMAGE_UNAVAILABLE", "Image source URL could not be resolved; only an empty box placeholder is captured.");
          return emit({ ...base, type: "rectangle", children: [] });
        }
        const mimeType = inferUrlMimeType(resolvedUrl);
        assetId = assetRegistry.registerImageUrl(resolvedUrl, mimeType, intrinsic);
      }

      const fit = ["fill", "contain", "cover", "none", "scale-down"].includes(style.objectFit)
        ? (style.objectFit as ImageNode["fit"])
        : undefined;
      if (style.objectPosition && style.objectPosition !== "50% 50%" && style.objectPosition !== "center") {
        warnElement("OBJECT_POSITION_APPROXIMATED", "CSS object-position is not represented in the design schema.");
      }

      return emit({
        ...base,
        type: "image",
        children: [],
        assetId,
        ...(fit ? { fit } : {}),
      });
    }
    if (tag === "svg") {
      if (decision !== "capture") return [];
      const { serializedSvg, intrinsicDimensions } = serializeAndSanitizeSvg(element, view, warnElement);
      const assetId = assetRegistry.registerSvg(serializedSvg, intrinsicDimensions);
      return emit({
        ...base,
        type: "svg",
        children: [],
        inlineSvg: serializedSvg,
        assetId,
      });
    }
    if (["input", "textarea", "select"].includes(tag)) return decision === "capture" ? emit({ ...base, type: "rectangle", children: [] }) : [];
    const styled = Object.keys(visuals).length > 0;
    const contentChildren = Array.from(element.childNodes).filter(child =>
      child.nodeType === 1 || child.nodeType === 3 && (/[^\t\r\n\f ]/.test(child.textContent ?? "") || ["pre", "pre-wrap", "break-spaces"].includes(style.whiteSpace) && (child.textContent ?? "").length > 0),
    );

    const beforeNodes = capturePseudoElement({
      element,
      pseudoKind: "::before",
      parentId: id,
      parentRect: rect,
      parentStyle: style,
      view: view!,
      scrollX: viewport.scrollX,
      scrollY: viewport.scrollY,
      warn,
    }).flatMap(emit);

    const hasMeaningfulClip = hasClip && (contentChildren.length > 0 || beforeNodes.length > 0);
    const hasTransform = Boolean(transform);
    const isFrame = decision === "capture" && (contentChildren.length > 0 || beforeNodes.length > 0) &&
      (groups.has(tag) || styled || base.opacity < 1 || hasMeaningfulClip || hasTransform || tag === "div" && (contentChildren.length > 1 || beforeNodes.length > 0) || (beforeNodes.length > 0 && styled));
    // Reserve ancestors before descending so truncation preserves grouping and local opacity.
    if (isFrame) count++;
    const children: DesignNode[] = [...beforeNodes];
    for (let index = 0; index < element.childNodes.length; index++) {
      if (count >= maxNodes || visited >= 20000) {
        warn("CAPTURE_TRUNCATED", "Node/depth/traversal bound reached; output is partial.");
        break;
      }
      const child = element.childNodes[index];
      if (child) children.push(...visit(child, [...path, index], depth + 1, style));
    }

    const afterNodes = capturePseudoElement({
      element,
      pseudoKind: "::after",
      parentId: id,
      parentRect: rect,
      parentStyle: style,
      view: view!,
      scrollX: viewport.scrollX,
      scrollY: viewport.scrollY,
      warn,
    }).flatMap(emit);

    children.push(...afterNodes);

    const activeClip = hasClip && children.length > 0 ? { x: clipX, y: clipY } : undefined;

    if (!styled && !hasClip && children.length === 1 && children[0]!.type === "text" && transform) {
      const childText = children[0] as TextNode;
      if (isFrame) count--;
      return [{
        id,
        sourceTag: tag,
        name: tag,
        type: "text",
        ...geometry,
        visible: true,
        opacity: base.opacity,
        characters: childText.characters,
        textStyle: childText.textStyle,
        children: [],
        transform,
      }];
    }

    if (isFrame || (children.length > 0 && decision === "capture" && (groups.has(tag) || styled || base.opacity < 1 || hasClip || hasTransform || (tag === "div" && children.length > 1)))) {
      return [{ ...base, type: "frame", ...(activeClip ? { clip: activeClip } : {}), children }];
    }
    if (decision !== "capture") {
      if (children.length && base.opacity < 1 && style.display !== "contents") {
        warn("UNBOXED_OPACITY_APPROXIMATED", "Opacity on an omitted hidden/zero-size wrapper is not reconstructed.");
      }
      return children;
    }
    if (styled || base.opacity < 1) {
      if (children.length > 0) {
        return [{ ...base, type: "frame", ...(activeClip ? { clip: activeClip } : {}), children }];
      }
      return emit({ ...base, type: "rectangle", children: [] });
    }
    return children;
  }
  const html = document.documentElement, body = document.body;
  const htmlBox = documentRect(html.getBoundingClientRect(), viewport.scrollX, viewport.scrollY);
  const bodyBox = documentRect(body.getBoundingClientRect(), viewport.scrollX, viewport.scrollY);
  let rootTransformResult: ReturnType<typeof processElementTransform> | undefined;
  if (htmlStyle.transform && htmlStyle.transform !== "none") {
    rootTransformResult = processElementTransform(
      htmlStyle,
      htmlBox,
      html.offsetWidth || viewport.width,
      html.offsetHeight || viewport.height,
      view,
    );
    for (const tw of rootTransformResult.warnings) {
      warn(tw.code, tw.message, "root");
    }
  }
  if (htmlStyle.filter && htmlStyle.filter !== "none") warn("FILTER_UNSUPPORTED", "Filters on the document element are not captured.", "root");
  if (htmlStyle.zIndex && htmlStyle.zIndex !== "auto") warn("PAINT_ORDER_UNSUPPORTED", "Explicit document stacking is not reconstructed; children preserve DOM order.", "root");
  const children = htmlStyle.display === "none" || htmlStyle.contentVisibility === "hidden" ||
    htmlStyle.opacity !== "" && Number(htmlStyle.opacity) === 0 ? [] : visit(document.body, [], 0);
  const rootStyle = visualStyle(htmlStyle, (code, message) => warn(code, message, "root"));
  const canvasColor = canvasFromBody && bodyStyle.display !== "none" ? cssColor(bodyStyle.backgroundColor) : undefined;
  if (canvasColor && canvasColor.a > 0) rootStyle.fills = [{ type: "solid", color: canvasColor }];
  const htmlClipX = htmlStyle.overflowX === "hidden" || htmlStyle.overflowX === "clip";
  const htmlClipY = htmlStyle.overflowY === "hidden" || htmlStyle.overflowY === "clip";
  const rootClip = htmlClipX || htmlClipY ? { x: htmlClipX, y: htmlClipY } : undefined;
  const root: FrameNode = { id: "root", type: "frame", sourceTag: "html", name: document.title || "Page", x: 0, y: 0,
    width: Math.max(viewport.width, html.scrollWidth, body.scrollWidth, htmlBox.x + htmlBox.width, bodyBox.x + bodyBox.width), height: Math.max(viewport.height, html.scrollHeight, body.scrollHeight, htmlBox.y + htmlBox.height, bodyBox.y + bodyBox.height),
    visible: true, opacity: htmlStyle.opacity === "" ? 1 : Math.min(1, Math.max(0, Number(htmlStyle.opacity))), style: rootStyle,
    ...(rootClip ? { clip: rootClip } : {}),
    ...(rootTransformResult?.transform ? { transform: rootTransformResult.transform } : {}),
    children };
  const emittedIds = new Set<string>();
  const collect = (node: DesignNode) => { emittedIds.add(node.id); node.children.forEach(collect); };
  collect(root);
  for (const warning of warnings) if (warning.nodeId && !emittedIds.has(warning.nodeId)) delete warning.nodeId;
  warn("CAPTURE_SCOPE", "W2D-015: rendered light-DOM boxes, synthetic pseudo-elements, editable text, basic styles, gradient fills, per-side borders, multi/inset shadows, container clipping, CSS 2D transforms and rotation, images and inline SVG. Full paint order, media and advanced layout/style semantics are not reconstructed.");
  return parseDesignDocument({ schemaVersion: DESIGN_SCHEMA_VERSION, capture: { capturedAt: options.capturedAt ?? new Date().toISOString(),
    source: { kind: "chrome-extension", name: "Web2Design", version: "0.1.0" }, page: { url: document.URL, title: document.title } },
    viewport, root, assets: assetRegistry.getAssets(), warnings }) as DesignDocument;
}
