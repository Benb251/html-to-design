export interface Rect { x: number; y: number; width: number; height: number }
export function documentRect(rect: Rect, scrollX: number, scrollY: number): Rect {
  const values = [rect.x, rect.y, rect.width, rect.height, scrollX, scrollY];
  if (!values.every(Number.isFinite) || rect.width < 0 || rect.height < 0) throw new Error("Invalid rendered geometry.");
  return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
}
export function captureId(path: readonly number[], kind: "element" | "text"): string {
  if (!path.every(index => Number.isSafeInteger(index) && index >= 0)) throw new Error("Invalid DOM path.");
  return "w2d-" + kind + "-" + (path.length ? path.join("-") : "body");
}
export function renderDecision(style: Pick<CSSStyleDeclaration, "display" | "visibility" | "opacity" | "contentVisibility">, rect: Rect): "skip-subtree" | "traverse-only" | "capture" {
  if (style.display === "none" || style.contentVisibility === "hidden" || style.opacity.trim() !== "" && Number(style.opacity) === 0) return "skip-subtree";
  // visibility is overridable by descendants; display/opacity are not.
  if (style.visibility === "hidden" || style.visibility === "collapse" || rect.width <= 0 || rect.height <= 0 || style.display === "contents") return "traverse-only";
  return "capture";
}
