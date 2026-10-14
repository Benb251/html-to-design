import type { TextStyle, TextRun, TextRunStyle } from "@web2design/design-schema";
import { cssColor, cssPixels, fontFamilies, textStyle, type Warn } from "./styles.js";

const INLINE_FORMATTING_TAGS = new Set([
  "span",
  "strong",
  "b",
  "em",
  "i",
  "a",
  "code",
  "small",
  "mark",
  "sub",
  "sup",
  "u",
  "s",
  "strike",
  "del",
  "ins",
  "abbr",
  "cite",
  "q",
  "time",
  "label",
  "br",
]);

const REPLACED_AND_BOX_TAGS = new Set([
  "img",
  "svg",
  "button",
  "input",
  "textarea",
  "select",
  "canvas",
  "video",
  "audio",
  "iframe",
  "object",
  "embed",
  "hr",
  "table",
]);

/**
 * Checks if a descendant element has independent box semantics that prevent
 * collapsing into an inline text range.
 */
export function hasIndependentBoxSemantics(element: Element, style: CSSStyleDeclaration): boolean {
  const tag = element.localName.toLowerCase();
  if (REPLACED_AND_BOX_TAGS.has(tag)) return true;

  const display = style.display || "inline";
  if (display !== "inline" && display !== "contents") {
    return true;
  }

  // Positioned box
  if (style.position === "absolute" || style.position === "fixed" || style.position === "sticky") {
    return true;
  }

  // CSS transform
  if (style.transform && style.transform !== "none") {
    return true;
  }

  // Padding
  const padTop = cssPixels(style.paddingTop) ?? 0;
  const padRight = cssPixels(style.paddingRight) ?? 0;
  const padBottom = cssPixels(style.paddingBottom) ?? 0;
  const padLeft = cssPixels(style.paddingLeft) ?? 0;
  if (padTop > 0 || padRight > 0 || padBottom > 0 || padLeft > 0) {
    return true;
  }

  // Border
  const borderTop = cssPixels(style.borderTopWidth) ?? 0;
  const borderRight = cssPixels(style.borderRightWidth) ?? 0;
  const borderBottom = cssPixels(style.borderBottomWidth) ?? 0;
  const borderLeft = cssPixels(style.borderLeftWidth) ?? 0;
  const hasBorderWidth = borderTop > 0 || borderRight > 0 || borderBottom > 0 || borderLeft > 0;
  const hasBorderStyle = (style.borderTopStyle && style.borderTopStyle !== "none" && style.borderTopStyle !== "hidden") ||
    (style.borderRightStyle && style.borderRightStyle !== "none" && style.borderRightStyle !== "hidden") ||
    (style.borderBottomStyle && style.borderBottomStyle !== "none" && style.borderBottomStyle !== "hidden") ||
    (style.borderLeftStyle && style.borderLeftStyle !== "none" && style.borderLeftStyle !== "hidden");
  if (hasBorderWidth && hasBorderStyle) {
    const topColor = cssColor(style.borderTopColor);
    const rightColor = cssColor(style.borderRightColor);
    const bottomColor = cssColor(style.borderBottomColor);
    const leftColor = cssColor(style.borderLeftColor);
    if ((topColor?.a ?? 0) > 0 || (rightColor?.a ?? 0) > 0 || (bottomColor?.a ?? 0) > 0 || (leftColor?.a ?? 0) > 0) {
      return true;
    }
  }

  // Background color
  const bgColor = cssColor(style.backgroundColor);
  if (bgColor && bgColor.a > 0) {
    return true;
  }

  // Border radius
  const rTopLeft = cssPixels(style.borderTopLeftRadius) ?? 0;
  const rTopRight = cssPixels(style.borderTopRightRadius) ?? 0;
  const rBottomRight = cssPixels(style.borderBottomRightRadius) ?? 0;
  const rBottomLeft = cssPixels(style.borderBottomLeftRadius) ?? 0;
  if (rTopLeft > 0 || rTopRight > 0 || rBottomRight > 0 || rBottomLeft > 0) {
    return true;
  }

  // Box shadow
  if (style.boxShadow && style.boxShadow !== "none") {
    return true;
  }

  // Opacity group
  if (style.opacity !== "" && Number(style.opacity) < 1) {
    return true;
  }

  // Filter
  if (style.filter && style.filter !== "none") {
    return true;
  }

  return false;
}

const RICH_FORMATTING_TAGS = new Set([
  "strong",
  "b",
  "em",
  "i",
  "a",
  "code",
  "small",
  "mark",
  "sub",
  "sup",
  "u",
  "s",
  "strike",
  "del",
  "ins",
]);

/**
 * Checks if an element qualifies as a rich text flow root.
 * A root must contain inline text descendants and cannot contain structural or box elements.
 */
export function isEligibleRichTextRoot(element: Element, view: Window): boolean {
  const tag = element.localName.toLowerCase();
  if (REPLACED_AND_BOX_TAGS.has(tag)) return false;

  const rawText = element.textContent ?? "";
  if (!/[^\t\r\n\f ]/.test(rawText)) return false;

  // Must have at least one child element (e.g. <span>, <strong>, <a>, <br>)
  // to warrant rich text flow processing
  let hasChildElement = false;
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i]!;
    if (child.nodeType === 1) {
      hasChildElement = true;
      break;
    }
  }

  if (!hasChildElement) {
    return false;
  }

  // Verify all descendants
  const descendants = Array.from(element.querySelectorAll("*"));
  const rootStyle = view.getComputedStyle(element);
  let hasRichFeature = false;

  for (const current of descendants) {
    const curTag = current.localName.toLowerCase();
    const curStyle = view.getComputedStyle(current);

    if (hasIndependentBoxSemantics(current, curStyle)) {
      return false;
    }

    if (!INLINE_FORMATTING_TAGS.has(curTag) && curStyle.display !== "inline" && curStyle.display !== "contents") {
      return false;
    }

    if (RICH_FORMATTING_TAGS.has(curTag) || current.hasAttribute("href")) {
      hasRichFeature = true;
    } else if (
      curStyle.fontFamily !== rootStyle.fontFamily ||
      curStyle.fontWeight !== rootStyle.fontWeight ||
      curStyle.fontStyle !== rootStyle.fontStyle ||
      curStyle.fontSize !== rootStyle.fontSize ||
      curStyle.color !== rootStyle.color ||
      curStyle.letterSpacing !== rootStyle.letterSpacing ||
      curStyle.lineHeight !== rootStyle.lineHeight ||
      curStyle.textDecorationLine !== rootStyle.textDecorationLine
    ) {
      hasRichFeature = true;
    }
  }

  return hasRichFeature;
}

export function resolveSafeHyperlink(anchor: HTMLAnchorElement, warn?: Warn, nodeId?: string): string | undefined {
  const rawHref = anchor.getAttribute("href");
  if (!rawHref) return undefined;
  const trimmed = rawHref.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    warn?.("RICH_TEXT_LINK_UNSUPPORTED", `Unsafe hyperlink scheme '${trimmed.split(":")[0]}' was omitted.`, nodeId);
    return undefined;
  }

  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const base = anchor.ownerDocument.baseURI || anchor.ownerDocument.URL;
    const resolved = new URL(trimmed, base).href;
    const protocol = new URL(resolved).protocol;
    if (["http:", "https:", "mailto:", "tel:"].includes(protocol)) {
      return resolved;
    }
    warn?.("RICH_TEXT_LINK_UNSUPPORTED", `Hyperlink protocol '${protocol}' is not supported.`, nodeId);
    return undefined;
  } catch {
    return trimmed;
  }
}

export function areRunStylesEqual(s1: TextRunStyle, s2: TextRunStyle): boolean {
  if (s1.fontFamily !== s2.fontFamily) return false;
  if (s1.fontSize !== s2.fontSize) return false;
  if (s1.fontWeight !== s2.fontWeight) return false;
  if (s1.fontStyle !== s2.fontStyle) return false;
  if (s1.lineHeight !== s2.lineHeight) return false;
  if (s1.letterSpacing !== s2.letterSpacing) return false;
  if (s1.textDecoration !== s2.textDecoration) return false;
  if ((s1.color === undefined) !== (s2.color === undefined)) return false;
  if (s1.color && s2.color) {
    if (
      s1.color.r !== s2.color.r ||
      s1.color.g !== s2.color.g ||
      s1.color.b !== s2.color.b ||
      s1.color.a !== s2.color.a
    ) {
      return false;
    }
  }
  const f1 = s1.fontFallbacks ?? [];
  const f2 = s2.fontFallbacks ?? [];
  if (f1.length !== f2.length || !f1.every((v, i) => v === f2[i])) return false;
  return true;
}

export interface CollectedRichTextFlow {
  characters: string;
  textStyle: TextStyle;
  runs?: TextRun[] | undefined;
  rect: DOMRect;
  fragments: number;
}

/**
 * Traverses an eligible inline rich text flow and generates a single normalized
 * characters string along with ordered, contiguous, non-overlapping TextRuns.
 */
export function collectRichTextFlow(
  element: Element,
  view: Window,
  document: Document,
  warn?: Warn,
  nodeId?: string,
): CollectedRichTextFlow | undefined {
  const rootStyle = view.getComputedStyle(element);
  const baseTextStyle = textStyle(rootStyle, (code, message) => warn?.(code, message, nodeId));

  interface RawFragment {
    text: string;
    style: TextRunStyle;
    hyperlink?: string | undefined;
  }

  const rawFragments: RawFragment[] = [];

  function walk(node: Node) {
    if (node.nodeType === 3) {
      // Text node
      const parent = (node.parentElement || element) as Element;
      const compStyle = view.getComputedStyle(parent);
      if (compStyle.visibility === "hidden" || compStyle.visibility === "collapse") {
        return;
      }

      // Check inline background unsupported warning
      const bg = cssColor(compStyle.backgroundColor);
      if (bg && bg.a > 0 && parent !== element) {
        warn?.("RICH_TEXT_BACKGROUND_UNSUPPORTED", "CSS background-color on inline text span cannot be rendered as a text range; background was omitted.", nodeId);
      }

      // Check text shadow
      if (compStyle.textShadow && compStyle.textShadow !== "none") {
        warn?.("TEXT_SHADOW_UNSUPPORTED", "CSS text-shadow on rich text is not supported.", nodeId);
      }

      // Check gradient text
      const isGradText =
        (compStyle.webkitBackgroundClip === "text" || compStyle.backgroundClip === "text") &&
        (compStyle.color === "transparent" || compStyle.color === "rgba(0, 0, 0, 0)");
      if (isGradText) {
        warn?.("TEXT_GRADIENT_UNSUPPORTED", "CSS background-clip: text gradient text is not supported; standard text color used.", nodeId);
      }

      // Check text-transform
      if (compStyle.textTransform && compStyle.textTransform !== "none") {
        warn?.("TEXT_TRANSFORM_UNSUPPORTED", "Text uses original characters; CSS text-transform is not applied.", nodeId);
      }

      const raw = node.textContent ?? "";
      if (raw.length === 0) return;

      const families = fontFamilies(compStyle.fontFamily);
      const fontSize = cssPixels(compStyle.fontSize) ?? 16;
      const weight = compStyle.fontWeight === "bold" ? 700 : compStyle.fontWeight === "normal" ? 400 : Number(compStyle.fontWeight);
      const fontStyleVal = compStyle.fontStyle ?? "normal";
      const line = cssPixels(compStyle.lineHeight) ?? (fontSize * 1.2);
      const spacing = compStyle.letterSpacing === "normal" || !compStyle.letterSpacing ? 0 : (cssPixels(compStyle.letterSpacing) ?? 0);
      const color = cssColor(compStyle.color) ?? { r: 0, g: 0, b: 0, a: 1 };

      // Text decoration
      let textDecoration: "none" | "underline" | "line-through" = "none";
      const decLine = (compStyle.textDecorationLine || compStyle.textDecoration || "").toLowerCase();
      if (decLine.includes("underline")) {
        textDecoration = "underline";
      } else if (decLine.includes("line-through")) {
        textDecoration = "line-through";
      }

      const decStyle = (compStyle.textDecorationStyle || "").toLowerCase();
      if (decStyle === "wavy" || decStyle === "dotted" || decStyle === "dashed") {
        warn?.("TEXT_DECORATION_APPROXIMATED", `Complex text-decoration-style '${decStyle}' is approximated as standard underline/line-through.`, nodeId);
      }

      const anchor = parent.closest("a") as HTMLAnchorElement | null;
      const hyperlink = anchor ? resolveSafeHyperlink(anchor, warn, nodeId) : undefined;

      const runStyle: TextRunStyle = {
        fontFamily: families[0] ?? "sans-serif",
        ...(families.length > 1 ? { fontFallbacks: families.slice(1) } : {}),
        fontSize,
        fontWeight: Number.isFinite(weight) && weight > 0 ? Math.min(1000, Math.max(1, Math.round(weight))) : 400,
        fontStyle: fontStyleVal.startsWith("oblique") ? "oblique" : fontStyleVal === "italic" ? "italic" : "normal",
        lineHeight: line,
        letterSpacing: spacing,
        color,
        textDecoration,
      };

      rawFragments.push({
        text: raw,
        style: runStyle,
        hyperlink,
      });
    } else if (node.nodeType === 1) {
      const el = node as Element;
      const tag = el.localName.toLowerCase();
      if (tag === "br") {
        // Line break
        const parent = (el.parentElement || element) as Element;
        const compStyle = view.getComputedStyle(parent);
        const families = fontFamilies(compStyle.fontFamily);
        const fontSize = cssPixels(compStyle.fontSize) ?? 16;
        const line = cssPixels(compStyle.lineHeight) ?? (fontSize * 1.2);
        const spacing = compStyle.letterSpacing === "normal" || !compStyle.letterSpacing ? 0 : (cssPixels(compStyle.letterSpacing) ?? 0);
        const color = cssColor(compStyle.color) ?? { r: 0, g: 0, b: 0, a: 1 };
        const weight = compStyle.fontWeight === "bold" ? 700 : compStyle.fontWeight === "normal" ? 400 : Number(compStyle.fontWeight);
        const fontStyleVal = compStyle.fontStyle ?? "normal";
        rawFragments.push({
          text: "\n",
          style: {
            fontFamily: families[0] ?? "sans-serif",
            ...(families.length > 1 ? { fontFallbacks: families.slice(1) } : {}),
            fontSize,
            fontWeight: Number.isFinite(weight) && weight > 0 ? Math.min(1000, Math.max(1, Math.round(weight))) : 400,
            fontStyle: fontStyleVal === "italic" ? "italic" : fontStyleVal.startsWith("oblique") ? "oblique" : "normal",
            lineHeight: line,
            letterSpacing: spacing,
            color,
            textDecoration: "none",
          },
        });
      } else {
        for (let i = 0; i < el.childNodes.length; i++) {
          walk(el.childNodes[i]!);
        }
      }
    }
  }

  for (let i = 0; i < element.childNodes.length; i++) {
    walk(element.childNodes[i]!);
  }

  if (rawFragments.length === 0) return undefined;

  // Build normalized characters string and map exact character offsets
  const whiteSpace = rootStyle.whiteSpace || "normal";
  const isPre = whiteSpace.startsWith("pre") || whiteSpace === "break-spaces";

  let finalCharacters = "";
  const collectedRuns: TextRun[] = [];

  let isAtBlockStart = true;
  let lastCharWasSpace = false;

  for (const frag of rawFragments) {
    if (frag.text === "\n") {
      // Remove trailing space right before \n if present
      if (lastCharWasSpace && finalCharacters.endsWith(" ")) {
        finalCharacters = finalCharacters.slice(0, -1);
        if (collectedRuns.length > 0) {
          const last = collectedRuns[collectedRuns.length - 1]!;
          last.end = finalCharacters.length;
          if (last.start >= last.end) {
            collectedRuns.pop();
          }
        }
      }
      const start = finalCharacters.length;
      finalCharacters += "\n";
      const end = finalCharacters.length;
      collectedRuns.push({
        start,
        end,
        style: frag.style,
        hyperlink: frag.hyperlink,
      });
      lastCharWasSpace = false;
      isAtBlockStart = true;
      continue;
    }

    if (isPre) {
      const normalized = frag.text.replace(/\r\n?/g, "\n");
      if (normalized.length > 0) {
        const start = finalCharacters.length;
        finalCharacters += normalized;
        const end = finalCharacters.length;
        collectedRuns.push({
          start,
          end,
          style: frag.style,
          hyperlink: frag.hyperlink,
        });
        isAtBlockStart = false;
        lastCharWasSpace = normalized.endsWith(" ") || normalized.endsWith("\n");
      }
      continue;
    }

    // Normal whitespace collapsing
    let fragNorm = "";
    for (let c = 0; c < frag.text.length; c++) {
      const char = frag.text[c]!;
      const isWhitespace = char === " " || char === "\t" || char === "\r" || char === "\n" || char === "\f";
      if (isWhitespace) {
        if (!isAtBlockStart && !lastCharWasSpace) {
          fragNorm += " ";
          lastCharWasSpace = true;
        }
      } else {
        fragNorm += char;
        lastCharWasSpace = false;
        isAtBlockStart = false;
      }
    }

    if (fragNorm.length > 0) {
      const start = finalCharacters.length;
      finalCharacters += fragNorm;
      const end = finalCharacters.length;
      collectedRuns.push({
        start,
        end,
        style: frag.style,
        hyperlink: frag.hyperlink,
      });
    }
  }

  // Trim trailing whitespace at end of flow
  if (!isPre && finalCharacters.endsWith(" ")) {
    finalCharacters = finalCharacters.slice(0, -1);
    if (collectedRuns.length > 0) {
      const last = collectedRuns[collectedRuns.length - 1]!;
      last.end = finalCharacters.length;
      if (last.start >= last.end) {
        collectedRuns.pop();
      }
    }
  }

  if (finalCharacters.length === 0) return undefined;

  // Coalesce adjacent runs with identical style and hyperlink
  const coalescedRuns: TextRun[] = [];
  for (const run of collectedRuns) {
    if (run.start >= run.end) continue;
    if (coalescedRuns.length === 0) {
      coalescedRuns.push({ ...run });
    } else {
      const prev = coalescedRuns[coalescedRuns.length - 1]!;
      if (prev.end === run.start && prev.hyperlink === run.hyperlink && areRunStylesEqual(prev.style, run.style)) {
        prev.end = run.end;
      } else {
        coalescedRuns.push({ ...run });
      }
    }
  }

  // Check whole-node style optimization:
  // If only 1 run exists, and its style matches baseTextStyle with no hyperlink, runs can be omitted!
  let effectiveRuns: TextRun[] | undefined = coalescedRuns;
  if (coalescedRuns.length === 1) {
    const single = coalescedRuns[0]!;
    if (
      single.start === 0 &&
      single.end === finalCharacters.length &&
      !single.hyperlink &&
      areRunStylesEqual(single.style, {
        fontFamily: baseTextStyle.fontFamily,
        fontFallbacks: baseTextStyle.fontFallbacks,
        fontSize: baseTextStyle.fontSize,
        fontWeight: baseTextStyle.fontWeight,
        fontStyle: baseTextStyle.fontStyle,
        lineHeight: baseTextStyle.lineHeight,
        letterSpacing: baseTextStyle.letterSpacing,
        color: baseTextStyle.color,
        textDecoration: "none",
      })
    ) {
      effectiveRuns = undefined;
      if (element.childNodes.length === 1 && element.firstChild?.nodeType === 1) {
        return undefined;
      }
    }
  }

  // Calculate text range bounding rect
  let rect: DOMRect;
  let fragments = 1;
  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    rect = range.getBoundingClientRect();
    fragments = Array.from(range.getClientRects()).filter(b => b.width > 0 && b.height > 0).length || 1;
  } catch {
    rect = element.getBoundingClientRect();
  }

  if (rect.width <= 0 || rect.height <= 0) {
    rect = element.getBoundingClientRect();
  }

  if (fragments > 1) {
    warn?.("TEXT_RANGE_APPROXIMATED", "Wrapped/bidirectional text uses one axis-aligned union box per DOM text run; line fragments are not reconstructed.", nodeId);
  }

  return {
    characters: finalCharacters,
    textStyle: baseTextStyle,
    runs: effectiveRuns,
    rect,
    fragments,
  };
}
