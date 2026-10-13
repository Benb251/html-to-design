// packages/capture-engine/src/pseudo.ts
// Synthetic pseudo-element (::before / ::after) capture for Web2Design V0.1.

import type { DesignNode, FrameNode, RectangleNode, TextNode, VisualStyle } from "@web2design/design-schema";
import { documentRect, type Rect } from "./geometry.js";
import { cssPixels, textStyle, visualStyle, type Warn } from "./styles.js";

export interface ParsedGeneratedContent {
  kind: "text" | "empty" | "unsupported" | "none";
  value?: string;
  reason?: string;
  raw?: string;
}

/**
 * Decodes standard CSS string escapes (hex code points \2605, \f005, \A, and character escapes).
 */
export function unescapeCssString(str: string): string {
  return str.replace(/\\(?:([0-9a-fA-F]{1,6})[\t\r\n\f ]?|([\s\S]))/g, (_, hex, char) => {
    if (hex) {
      try {
        const codePoint = parseInt(hex, 16);
        if (codePoint >= 0 && codePoint <= 0x10ffff) {
          return String.fromCodePoint(codePoint);
        }
      } catch {
        // Fallback to empty if code point is out of range
      }
    }
    return char ?? "";
  });
}

/**
 * Parses CSS generated content property string safely without eval.
 */
export function parseGeneratedContent(rawContent: string | undefined): ParsedGeneratedContent {
  if (!rawContent) return { kind: "none" };
  const trimmed = rawContent.trim();
  if (!trimmed || trimmed === "none" || trimmed === "normal") {
    return { kind: "none" };
  }

  // Quoted string (e.g. "NEW", 'Hello', "\2605", "")
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    const unquoted = trimmed.slice(1, -1);
    if (unquoted.length === 0) {
      return { kind: "empty" };
    }
    const unescaped = unescapeCssString(unquoted);
    if (unescaped.length === 0) {
      return { kind: "empty" };
    }
    return { kind: "text", value: unescaped };
  }

  // Unsupported forms: url(...), counter(...), counters(...), attr(...)
  if (trimmed.startsWith("url(")) {
    return { kind: "unsupported", reason: "url_content", raw: trimmed };
  }
  if (trimmed.startsWith("counter(") || trimmed.startsWith("counters(")) {
    return { kind: "unsupported", reason: "counter_content", raw: trimmed };
  }
  if (trimmed.startsWith("attr(")) {
    return { kind: "unsupported", reason: "unresolved_attr", raw: trimmed };
  }
  if (
    trimmed === "open-quote" ||
    trimmed === "close-quote" ||
    trimmed === "no-open-quote" ||
    trimmed === "no-close-quote"
  ) {
    return { kind: "unsupported", reason: "quote_content", raw: trimmed };
  }

  return { kind: "unsupported", reason: "unknown_content", raw: trimmed };
}

/**
 * Measures text bounding box using an isolated, temporary offscreen DOM node.
 * Guarantees zero DOM pollution post-measurement.
 */
export function measureTextInDocument(
  doc: Document,
  text: string,
  style: CSSStyleDeclaration,
): { width: number; height: number } | undefined {
  if (!doc || !text) return undefined;
  const targetParent = doc.body || doc.documentElement;
  if (!targetParent || typeof doc.createElement !== "function") return undefined;

  try {
    const span = doc.createElement("span");
    span.textContent = text;
    span.style.fontFamily = style.fontFamily;
    span.style.fontSize = style.fontSize;
    span.style.fontWeight = style.fontWeight;
    span.style.fontStyle = style.fontStyle;
    span.style.letterSpacing = style.letterSpacing;
    span.style.lineHeight = style.lineHeight;
    span.style.whiteSpace = "nowrap";
    span.style.position = "absolute";
    span.style.left = "-9999px";
    span.style.top = "-9999px";
    span.style.visibility = "hidden";
    span.style.pointerEvents = "none";

    targetParent.appendChild(span);
    const rect = span.getBoundingClientRect();
    span.remove();

    if (rect.width > 0 || rect.height > 0) {
      return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    }
  } catch {
    // Non-DOM or restricted environments fall back gracefully
  }
  return undefined;
}

export interface CapturePseudoOptions {
  element: Element;
  pseudoKind: "::before" | "::after";
  parentId: string;
  parentRect: DOMRect;
  parentStyle: CSSStyleDeclaration;
  view: Window;
  scrollX: number;
  scrollY: number;
  warn: Warn;
}

/**
 * Captures meaningful CSS ::before or ::after pseudo-elements into deterministic V0.1 DesignNodes.
 */
export function capturePseudoElement(options: CapturePseudoOptions): DesignNode[] {
  const { element, pseudoKind, parentId, parentRect, parentStyle, view, scrollX, scrollY, warn } = options;
  if (!view || !element) return [];

  // In JSDOM test environments where getComputedStyle is not mocked/spied,
  // pseudo-elements are not implemented by JSDOM and return parent style while emitting stderr errors.
  if (
    typeof view.navigator !== "undefined" &&
    view.navigator.userAgent?.includes("jsdom") &&
    !("mock" in view.getComputedStyle) &&
    !("_isMockFunction" in view.getComputedStyle)
  ) {
    return [];
  }

  const pseudoStyle = view.getComputedStyle(element, pseudoKind);
  if (!pseudoStyle) return [];

  // Visibility / rendering exclusions
  if (pseudoStyle.display === "none") return [];
  if (pseudoStyle.visibility === "hidden" || pseudoStyle.visibility === "collapse") return [];
  if (pseudoStyle.opacity.trim() !== "" && Number(pseudoStyle.opacity) === 0) return [];

  const pseudoId = `${parentId}${pseudoKind}`;
  const pseudoWarn: Warn = (code, message) => warn(code, message, pseudoId);

  if (pseudoStyle.transform && pseudoStyle.transform !== "none") {
    pseudoWarn("TRANSFORM_APPROXIMATED", "Browser-rendered axis-aligned boxes are captured; rotation/skew/scale semantics are not preserved.");
  }

  // Content parsing
  const content = parseGeneratedContent(pseudoStyle.content);
  if (content.kind === "none") return [];
  if (content.kind === "unsupported") {
    pseudoWarn("PSEUDO_CONTENT_UNSUPPORTED", `Unsupported CSS generated-content format (${content.reason ?? "unsupported"}) was omitted.`);
    return [];
  }

  // Visual style evaluation
  const visuals: VisualStyle = visualStyle(pseudoStyle, pseudoWarn);
  const hasFills = Boolean(visuals.fills && visuals.fills.length > 0);
  const hasBorder = Boolean(visuals.border);
  const hasShadow = Boolean(visuals.boxShadows && visuals.boxShadows.length > 0);
  const hasVisualBox = hasFills || hasBorder || hasShadow;
  const hasText = content.kind === "text" && Boolean(content.value && content.value.length > 0);

  // If pseudo has neither text nor visual box styling, ignore it
  if (!hasText && !hasVisualBox) {
    return [];
  }

  // Dimension & Inset parsing
  const w = cssPixels(pseudoStyle.width);
  const h = cssPixels(pseudoStyle.height);
  const top = cssPixels(pseudoStyle.top);
  const left = cssPixels(pseudoStyle.left);
  const right = cssPixels(pseudoStyle.right);
  const bottom = cssPixels(pseudoStyle.bottom);
  const position = pseudoStyle.position;

  // Parent border & padding metrics
  const pBorderL = cssPixels(parentStyle.borderLeftWidth) ?? 0;
  const pBorderT = cssPixels(parentStyle.borderTopWidth) ?? 0;
  const pBorderR = cssPixels(parentStyle.borderRightWidth) ?? 0;
  const pBorderB = cssPixels(parentStyle.borderBottomWidth) ?? 0;
  const pPadL = cssPixels(parentStyle.paddingLeft) ?? 0;
  const pPadT = cssPixels(parentStyle.paddingTop) ?? 0;

  // Pseudo padding metrics
  const padL = cssPixels(pseudoStyle.paddingLeft) ?? 0;
  const padT = cssPixels(pseudoStyle.paddingTop) ?? 0;
  const padR = cssPixels(pseudoStyle.paddingRight) ?? 0;
  const padB = cssPixels(pseudoStyle.paddingBottom) ?? 0;

  let isHighConfidence = false;
  let rect: Rect | undefined;

  // Case 1: High-confidence absolute positioned pseudo-element
  if (position === "absolute") {
    const cbL = parentRect.left + pBorderL;
    const cbT = parentRect.top + pBorderT;
    const cbW = Math.max(0, parentRect.width - pBorderL - pBorderR);
    const cbH = Math.max(0, parentRect.height - pBorderT - pBorderB);

    let finalX = cbL;
    let finalY = cbT;
    let finalW = w;
    let finalH = h;

    if (left !== undefined) {
      finalX = cbL + left;
    } else if (right !== undefined && w !== undefined) {
      finalX = cbL + (cbW - right - w);
    } else if (right !== undefined) {
      finalX = cbL + (cbW - right);
    }

    if (top !== undefined) {
      finalY = cbT + top;
    } else if (bottom !== undefined && h !== undefined) {
      finalY = cbT + (cbH - bottom - h);
    } else if (bottom !== undefined) {
      finalY = cbT + (cbH - bottom);
    }

    if (left !== undefined && right !== undefined && w === undefined) {
      finalW = Math.max(0, cbW - left - right);
    }
    if (top !== undefined && bottom !== undefined && h === undefined) {
      finalH = Math.max(0, cbH - top - bottom);
    }

    if (finalW !== undefined && finalH !== undefined && finalW > 0 && finalH > 0) {
      isHighConfidence = true;
      rect = { x: finalX, y: finalY, width: finalW, height: finalH };
    } else if (hasText) {
      const measured = measureTextInDocument(element.ownerDocument, content.value!, pseudoStyle);
      const fs = cssPixels(pseudoStyle.fontSize) ?? 16;
      const lh = cssPixels(pseudoStyle.lineHeight) ?? fs * 1.2;
      const textW = measured?.width ?? Math.max(1, content.value!.length * fs * 0.6);
      const textH = measured?.height ?? lh;
      const boxW = finalW ?? textW + padL + padR;
      const boxH = finalH ?? textH + padT + padB;
      rect = { x: finalX, y: finalY, width: boxW, height: boxH };
      isHighConfidence = (left !== undefined || right !== undefined) && (top !== undefined || bottom !== undefined);
    }
  }

  // Case 2: In-flow / relative / auto-sized geometry
  if (!rect) {
    isHighConfidence = false;
    const flowX = parentRect.left + pBorderL + pPadL;
    const flowY = parentRect.top + pBorderT + pPadT;
    let boxW = w;
    let boxH = h;

    if (boxW === undefined || boxH === undefined) {
      if (hasText) {
        const measured = measureTextInDocument(element.ownerDocument, content.value!, pseudoStyle);
        const fs = cssPixels(pseudoStyle.fontSize) ?? 16;
        const lh = cssPixels(pseudoStyle.lineHeight) ?? fs * 1.2;
        const textW = measured?.width ?? Math.max(1, content.value!.length * fs * 0.6);
        const textH = measured?.height ?? lh;
        if (boxW === undefined) boxW = textW + padL + padR;
        if (boxH === undefined) boxH = textH + padT + padB;
      } else {
        if (boxW === undefined) boxW = 0;
        if (boxH === undefined) boxH = 0;
      }
    }

    rect = { x: flowX, y: flowY, width: Math.max(0, boxW), height: Math.max(0, boxH) };
  }

  if (!isHighConfidence) {
    pseudoWarn("PSEUDO_GEOMETRY_APPROXIMATED", "In-flow or auto-sized pseudo-element geometry is approximated.");
  }

  // Discard empty/invisible box if dimensions are zero and no text exists
  if (rect.width <= 0 || rect.height <= 0) {
    if (!hasText) return [];
    if (rect.width <= 0) rect.width = Math.max(1, content.value!.length * 10);
    if (rect.height <= 0) rect.height = 16;
  }

  // Local opacity preservation (does not multiply with parent)
  const pseudoOpacity = Math.min(
    1,
    Math.max(0, Number.isFinite(Number(pseudoStyle.opacity)) && pseudoStyle.opacity !== "" ? Number(pseudoStyle.opacity) : 1),
  );

  const geo = documentRect(rect, scrollX, scrollY);

  // Decomposition 1: Pure text pseudo-element (no visual box styling)
  if (hasText && !hasVisualBox) {
    const textNode: TextNode = {
      id: pseudoId,
      type: "text",
      sourceTag: pseudoKind,
      name: pseudoKind,
      x: geo.x,
      y: geo.y,
      width: geo.width,
      height: geo.height,
      visible: true,
      opacity: pseudoOpacity,
      children: [],
      characters: content.value!,
      textStyle: textStyle(pseudoStyle, pseudoWarn),
    };
    return [textNode];
  }

  // Decomposition 2: Pure visual decorative box (no text)
  if (!hasText && hasVisualBox) {
    const rectNode: RectangleNode = {
      id: pseudoId,
      type: "rectangle",
      sourceTag: pseudoKind,
      name: pseudoKind,
      x: geo.x,
      y: geo.y,
      width: geo.width,
      height: geo.height,
      visible: true,
      opacity: pseudoOpacity,
      children: [],
      style: visuals,
    };
    return [rectNode];
  }

  // Decomposition 3: Both visual box AND text (Frame container + Text child)
  const textGeo = documentRect(
    {
      x: rect.x + padL,
      y: rect.y + padT,
      width: Math.max(1, rect.width - padL - padR),
      height: Math.max(1, rect.height - padT - padB),
    },
    scrollX,
    scrollY,
  );

  const childTextNode: TextNode = {
    id: `${pseudoId}:text`,
    type: "text",
    sourceTag: pseudoKind,
    name: "Text",
    x: textGeo.x,
    y: textGeo.y,
    width: textGeo.width,
    height: textGeo.height,
    visible: true,
    opacity: 1, // local to container frame
    children: [],
    characters: content.value!,
    textStyle: textStyle(pseudoStyle, pseudoWarn),
  };

  const containerFrame: FrameNode = {
    id: pseudoId,
    type: "frame",
    sourceTag: pseudoKind,
    name: pseudoKind,
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height,
    visible: true,
    opacity: pseudoOpacity,
    children: [childTextNode],
    style: visuals,
  };

  return [containerFrame];
}
