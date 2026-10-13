import { characters } from "./styles.js";

// Keep each direct DOM run editable. Range measures glyph/line regions, never parent padding.
export function renderedText(node: Node, style: CSSStyleDeclaration, document: Document) {
  const raw = node.textContent ?? "";
  let value = characters(raw, style.whiteSpace);
  if (!value) return undefined;
  const range = document.createRange();
  range.selectNodeContents(node);
  // Let the browser decide whether edge whitespace was collapsed away. Do not trim
  // NBSP or preformatted spacing, or guess from the containing element's box.
  if (["normal", "nowrap", "pre-line", ""].includes(style.whiteSpace) && range.setStart && range.setEnd) {
    const leadingPattern = style.whiteSpace === "pre-line" ? /^[\t\f ]+/ : /^[\t\r\n\f ]+/;
    const trailingPattern = style.whiteSpace === "pre-line" ? /[\t\f ]+$/ : /[\t\r\n\f ]+$/;
    const leading = leadingPattern.exec(raw)?.[0].length ?? 0;
    const trailing = trailingPattern.exec(raw)?.[0].length ?? 0;
    if (leading) {
      range.setEnd(node, leading);
      if (range.getBoundingClientRect().width === 0) value = value.replace(leadingPattern, "");
    }
    range.selectNodeContents(node);
    if (trailing) {
      range.setStart(node, raw.length - trailing);
      if (range.getBoundingClientRect().width === 0) value = value.replace(trailingPattern, "");
    }
    range.selectNodeContents(node);
  }
  if (!value) return undefined;
  const rect = range.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return { characters: value, rect, fragments: Array.from(range.getClientRects()).filter(box => box.width > 0 && box.height > 0).length };
}
