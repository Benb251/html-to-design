// packages/capture-engine/src/autolayout.ts
// Semantic Auto Layout inference and geometry prediction guard for Web2Design V0.7.

import type { AutoLayout, AutoLayoutChild, DesignNode } from "@web2design/design-schema";
import { cssPixels, type Warn } from "./styles.js";

export interface AutoLayoutContainerSpec {
  width: number;
  height: number;
  direction: "horizontal" | "vertical";
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  primaryAlign: "start" | "center" | "end" | "space-between";
  crossAlign: "start" | "center" | "end" | "stretch";
}

export interface AutoLayoutChildSpec {
  id: string;
  width: number;
  height: number;
  grow?: boolean;
  stretch?: boolean;
}

export interface PredictedChildPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function round4(val: number): number {
  const rounded = Math.round(val * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Returns base layout bounds for a node, using transform.baseBounds when transformed.
 */
export function getNodeLayoutBounds(node: DesignNode): { x: number; y: number; width: number; height: number } {
  if (node.transform?.baseBounds) {
    return node.transform.baseBounds;
  }
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

/**
 * Pure geometry prediction function:
 * Simulates native Figma Auto Layout placement and sizing for flow children.
 */
export function predictAutoLayoutGeometry(
  container: AutoLayoutContainerSpec,
  flowChildren: readonly AutoLayoutChildSpec[],
): PredictedChildPlacement[] {
  const count = flowChildren.length;
  if (count === 0) return [];

  const { width: contW, height: contH, direction, gap, padding, primaryAlign, crossAlign } = container;
  const contentWidth = Math.max(0, contW - padding.left - padding.right);
  const contentHeight = Math.max(0, contH - padding.top - padding.bottom);

  if (direction === "horizontal") {
    const growChildren = flowChildren.filter(c => c.grow);
    const fixedChildren = flowChildren.filter(c => !c.grow);
    const sumFixedWidth = fixedChildren.reduce((sum, c) => sum + c.width, 0);

    let effectiveGap = gap;
    if (primaryAlign === "space-between" && count > 1) {
      effectiveGap = Math.max(0, (contentWidth - sumFixedWidth) / (count - 1));
    }

    let growWidthPerChild = 0;
    if (growChildren.length > 0) {
      const totalGap = (count - 1) * effectiveGap;
      const availableForGrow = Math.max(0, contentWidth - sumFixedWidth - totalGap);
      growWidthPerChild = availableForGrow / growChildren.length;
    }

    const totalFlowWidth = flowChildren.reduce(
      (sum, c, i) => sum + (c.grow ? growWidthPerChild : c.width) + (i > 0 ? effectiveGap : 0),
      0,
    );

    let startX = padding.left;
    if (primaryAlign === "center") {
      startX = padding.left + (contentWidth - totalFlowWidth) / 2;
    } else if (primaryAlign === "end") {
      startX = padding.left + (contentWidth - totalFlowWidth);
    }

    let currentX = startX;
    const placements: PredictedChildPlacement[] = [];

    for (const child of flowChildren) {
      const childW = child.grow ? growWidthPerChild : child.width;
      const childH = child.stretch ? contentHeight : child.height;

      let childY: number;
      if (child.stretch) {
        childY = padding.top;
      } else if (crossAlign === "center") {
        childY = padding.top + (contentHeight - childH) / 2;
      } else if (crossAlign === "end") {
        childY = padding.top + (contentHeight - childH);
      } else {
        childY = padding.top;
      }

      placements.push({
        id: child.id,
        x: round4(currentX),
        y: round4(childY),
        width: round4(childW),
        height: round4(childH),
      });

      currentX += childW + effectiveGap;
    }

    return placements;
  } else {
    // vertical
    const growChildren = flowChildren.filter(c => c.grow);
    const fixedChildren = flowChildren.filter(c => !c.grow);
    const sumFixedHeight = fixedChildren.reduce((sum, c) => sum + c.height, 0);

    let effectiveGap = gap;
    if (primaryAlign === "space-between" && count > 1) {
      effectiveGap = Math.max(0, (contentHeight - sumFixedHeight) / (count - 1));
    }

    let growHeightPerChild = 0;
    if (growChildren.length > 0) {
      const totalGap = (count - 1) * effectiveGap;
      const availableForGrow = Math.max(0, contentHeight - sumFixedHeight - totalGap);
      growHeightPerChild = availableForGrow / growChildren.length;
    }

    const totalFlowHeight = flowChildren.reduce(
      (sum, c, i) => sum + (c.grow ? growHeightPerChild : c.height) + (i > 0 ? effectiveGap : 0),
      0,
    );

    let startY = padding.top;
    if (primaryAlign === "center") {
      startY = padding.top + (contentHeight - totalFlowHeight) / 2;
    } else if (primaryAlign === "end") {
      startY = padding.top + (contentHeight - totalFlowHeight);
    }

    let currentY = startY;
    const placements: PredictedChildPlacement[] = [];

    for (const child of flowChildren) {
      const childW = child.stretch ? contentWidth : child.width;
      const childH = child.grow ? growHeightPerChild : child.height;

      let childX: number;
      if (child.stretch) {
        childX = padding.left;
      } else if (crossAlign === "center") {
        childX = padding.left + (contentWidth - childW) / 2;
      } else if (crossAlign === "end") {
        childX = padding.left + (contentWidth - childW);
      } else {
        childX = padding.left;
      }

      placements.push({
        id: child.id,
        x: round4(childX),
        y: round4(currentY),
        width: round4(childW),
        height: round4(childH),
      });

      currentY += childH + effectiveGap;
    }

    return placements;
  }
}

export interface NodeInspectionMetadata {
  element?: Element;
  style?: CSSStyleDeclaration;
  isPseudo?: boolean;
}

export interface FlexAnalysisContext {
  element: Element;
  style: CSSStyleDeclaration;
  children: DesignNode[];
  containerBounds: { x: number; y: number; width: number; height: number };
  nodeMetadataMap: Map<string, NodeInspectionMetadata>;
  warn: Warn;
  containerId: string;
}

export interface FlexAnalysisResult {
  layout: AutoLayout;
  childMetadata: Map<string, AutoLayoutChild>;
}

/**
 * Analyzes a container node for high-confidence Auto Layout inference.
 * Rejects ambiguous/unsupported layouts and falls back to absolute layout.
 */
export function analyzeFlexContainer(context: FlexAnalysisContext): FlexAnalysisResult | null {
  const { element, style, children, containerBounds, nodeMetadataMap, warn, containerId } = context;

  // 1. Display check
  const display = (style.display || "").toLowerCase();
  if (display === "grid" || display === "inline-grid") {
    warn(
      "GRID_LAYOUT_SEMANTICS_DEFERRED",
      "CSS Grid layout semantics are deferred; container is captured using absolute geometry.",
      containerId,
    );
    return null;
  }

  if (display !== "flex" && display !== "inline-flex") {
    return null;
  }

  // 2. flex-wrap check
  const flexWrap = (style.flexWrap || "nowrap").toLowerCase();
  if (flexWrap === "wrap" || flexWrap === "wrap-reverse") {
    warn(
      "AUTO_LAYOUT_WRAP_DEFERRED",
      `CSS flex-wrap '${flexWrap}' is deferred; container is captured using absolute geometry.`,
      containerId,
    );
    return null;
  }

  // 3. flex-direction check
  const flexDir = (style.flexDirection || "row").toLowerCase();
  if (flexDir === "row-reverse" || flexDir === "column-reverse") {
    warn(
      "AUTO_LAYOUT_REVERSE_DEFERRED",
      `CSS flex-direction '${flexDir}' is deferred; container is captured using absolute geometry.`,
      containerId,
    );
    return null;
  }

  const direction: "horizontal" | "vertical" = flexDir === "column" ? "vertical" : "horizontal";

  // 4. justify-content check
  const rawJustify = (style.justifyContent || "start").toLowerCase().trim();
  let primaryAlign: "start" | "center" | "end" | "space-between";
  if (rawJustify === "flex-start" || rawJustify === "start" || rawJustify === "normal" || rawJustify === "") {
    primaryAlign = "start";
  } else if (rawJustify === "center") {
    primaryAlign = "center";
  } else if (rawJustify === "flex-end" || rawJustify === "end") {
    primaryAlign = "end";
  } else if (rawJustify === "space-between") {
    primaryAlign = "space-between";
  } else {
    warn(
      "AUTO_LAYOUT_ALIGNMENT_DEFERRED",
      `CSS justify-content '${rawJustify}' is deferred; container is captured using absolute geometry.`,
      containerId,
    );
    return null;
  }

  // 5. align-items check
  const rawAlign = (style.alignItems || "stretch").toLowerCase().trim();
  let crossAlign: "start" | "center" | "end" | "stretch";
  if (rawAlign === "baseline") {
    warn(
      "AUTO_LAYOUT_BASELINE_DEFERRED",
      "CSS align-items 'baseline' is deferred; container is captured using absolute geometry.",
      containerId,
    );
    return null;
  } else if (rawAlign === "flex-start" || rawAlign === "start") {
    crossAlign = "start";
  } else if (rawAlign === "center") {
    crossAlign = "center";
  } else if (rawAlign === "flex-end" || rawAlign === "end") {
    crossAlign = "end";
  } else if (rawAlign === "stretch" || rawAlign === "normal" || rawAlign === "") {
    crossAlign = "stretch";
  } else {
    warn(
      "AUTO_LAYOUT_ALIGNMENT_DEFERRED",
      `CSS align-items '${rawAlign}' is deferred; container is captured using absolute geometry.`,
      containerId,
    );
    return null;
  }

  // 6. Padding check
  const padTop = cssPixels(style.paddingTop) ?? 0;
  const padRight = cssPixels(style.paddingRight) ?? 0;
  const padBottom = cssPixels(style.paddingBottom) ?? 0;
  const padLeft = cssPixels(style.paddingLeft) ?? 0;
  const bTop = cssPixels(style.borderTopWidth) ?? 0;
  const bRight = cssPixels(style.borderRightWidth) ?? 0;
  const bBottom = cssPixels(style.borderBottomWidth) ?? 0;
  const bLeft = cssPixels(style.borderLeftWidth) ?? 0;

  const contentWidth = Math.max(0, containerBounds.width - padLeft - padRight - bLeft - bRight);
  const contentHeight = Math.max(0, containerBounds.height - padTop - padBottom - bTop - bBottom);

  // 7. Gap check
  const gap =
    direction === "horizontal"
      ? (cssPixels(style.columnGap) ?? cssPixels(style.gap) ?? 0)
      : (cssPixels(style.rowGap) ?? cssPixels(style.gap) ?? 0);
  if (gap < 0 || !Number.isFinite(gap)) {
    return null;
  }

  // 8. Child inspection
  const childMetadata = new Map<string, AutoLayoutChild>();
  interface FlowChildInternal extends AutoLayoutChildSpec {
    actualX: number;
    actualY: number;
  }
  const flowChildren: FlowChildInternal[] = [];

  for (const child of children) {
    const meta = nodeMetadataMap.get(child.id);
    const cStyle = meta?.style;

    if (cStyle) {
      // Check absolute positioning
      if (cStyle.position === "absolute") {
        childMetadata.set(child.id, { positioning: "absolute" });
        continue;
      }

      // Check relative position offset
      if (cStyle.position === "relative") {
        const top = cssPixels(cStyle.top) ?? 0;
        const left = cssPixels(cStyle.left) ?? 0;
        const right = cssPixels(cStyle.right) ?? 0;
        const bottom = cssPixels(cStyle.bottom) ?? 0;
        if (Math.abs(top) > 0.5 || Math.abs(left) > 0.5 || Math.abs(right) > 0.5 || Math.abs(bottom) > 0.5) {
          warn(
            "AUTO_LAYOUT_POSITION_OFFSET_DEFERRED",
            `Relative-positioned child with non-zero offset in flex container is deferred; container is captured using absolute geometry.`,
            containerId,
          );
          return null;
        }
      }

      // Check order
      if (cStyle.order && cStyle.order !== "0") {
        warn(
          "AUTO_LAYOUT_ORDER_DEFERRED",
          `CSS flex order '${cStyle.order}' is deferred; container is captured using absolute geometry.`,
          containerId,
        );
        return null;
      }

      // Check flow-child margins
      const mTop = cssPixels(cStyle.marginTop) ?? 0;
      const mRight = cssPixels(cStyle.marginRight) ?? 0;
      const mBottom = cssPixels(cStyle.marginBottom) ?? 0;
      const mLeft = cssPixels(cStyle.marginLeft) ?? 0;
      if (Math.abs(mTop) > 0.5 || Math.abs(mRight) > 0.5 || Math.abs(mBottom) > 0.5 || Math.abs(mLeft) > 0.5) {
        warn(
          "AUTO_LAYOUT_MARGIN_DEFERRED",
          "Non-zero flow-child margins in flex container are deferred; container is captured using absolute geometry.",
          containerId,
        );
        return null;
      }

      // Check flex-grow
      const growVal = parseFloat(cStyle.flexGrow || "0") || 0;
      if (growVal > 0 && Math.abs(growVal - 1) >= 0.01) {
        warn(
          "AUTO_LAYOUT_GROW_RATIO_DEFERRED",
          `Complex CSS flex-grow ratio '${cStyle.flexGrow}' is deferred; container is captured using absolute geometry.`,
          containerId,
        );
        return null;
      }
      const isGrow = Math.abs(growVal - 1) < 0.01;

      // Check align-self
      const selfAlign = (cStyle.alignSelf || "auto").toLowerCase().trim();
      if (selfAlign === "baseline") {
        warn(
          "AUTO_LAYOUT_BASELINE_DEFERRED",
          "CSS align-self 'baseline' is deferred; container is captured using absolute geometry.",
          containerId,
        );
        return null;
      }
      const bounds = getNodeLayoutBounds(child);
      let isStretch = selfAlign === "stretch";
      if (!isStretch && (selfAlign === "auto" || selfAlign === "normal")) {
        if (crossAlign === "stretch") {
          const crossDim = direction === "horizontal" ? bounds.height : bounds.width;
          const contentDim = direction === "horizontal" ? contentHeight : contentWidth;
          if (Math.abs(crossDim - contentDim) <= 0.5) {
            isStretch = true;
          }
        }
      }

      let localX: number;
      let localY: number;
      let localW: number;
      let localH: number;

      const htmlEl = meta?.element as HTMLElement | undefined;
      if (htmlEl && typeof htmlEl.offsetLeft === "number" && htmlEl.offsetParent === element) {
        localX = htmlEl.offsetLeft;
        localY = htmlEl.offsetTop;
        localW = child.transform?.baseBounds ? child.transform.baseBounds.width : htmlEl.offsetWidth;
        localH = child.transform?.baseBounds ? child.transform.baseBounds.height : htmlEl.offsetHeight;
      } else {
        localX = bounds.x - containerBounds.x;
        localY = bounds.y - containerBounds.y;
        localW = bounds.width;
        localH = bounds.height;
      }

      flowChildren.push({
        id: child.id,
        width: localW,
        height: localH,
        grow: isGrow,
        stretch: isStretch,
        actualX: localX,
        actualY: localY,
      });

      if (isGrow || isStretch) {
        childMetadata.set(child.id, {
          ...(isGrow ? { grow: true } : {}),
          ...(isStretch ? { stretch: true } : {}),
        });
      }
    } else {
      // Flow child without element style (e.g. text node run)
      const bounds = getNodeLayoutBounds(child);
      flowChildren.push({
        id: child.id,
        width: bounds.width,
        height: bounds.height,
        grow: false,
        stretch: false,
        actualX: bounds.x - containerBounds.x,
        actualY: bounds.y - containerBounds.y,
      });
    }
  }

  // If there are no flow children, fallback to standard frame
  if (flowChildren.length === 0) {
    return null;
  }

  // 9. Pure geometry prediction guard
  const containerSpec: AutoLayoutContainerSpec = {
    width: containerBounds.width,
    height: containerBounds.height,
    direction,
    gap,
    padding: {
      top: padTop + bTop,
      right: padRight + bRight,
      bottom: padBottom + bBottom,
      left: padLeft + bLeft,
    },
    primaryAlign,
    crossAlign,
  };

  const predicted = predictAutoLayoutGeometry(containerSpec, flowChildren);

  const TOLERANCE_PX = 0.5;
  for (let i = 0; i < flowChildren.length; i++) {
    const act = flowChildren[i]!;
    const pred = predicted[i]!;

    const dx = Math.abs(pred.x - act.actualX);
    const dy = Math.abs(pred.y - act.actualY);
    const dw = Math.abs(pred.width - act.width);
    const dh = Math.abs(pred.height - act.height);

    if (dx > TOLERANCE_PX || dy > TOLERANCE_PX || dw > TOLERANCE_PX || dh > TOLERANCE_PX) {
      warn(
        "AUTO_LAYOUT_GEOMETRY_MISMATCH",
        `Auto Layout predicted geometry discrepancy (dx=${dx.toFixed(2)}px, dy=${dy.toFixed(2)}px, dw=${dw.toFixed(2)}px, dh=${dh.toFixed(2)}px) exceeded tolerance on child '${act.id}'; container falls back to absolute layout.`,
        containerId,
      );
      return null;
    }
  }

  // 10. High-confidence inference confirmed
  const layout: AutoLayout = {
    type: "flex",
    direction,
    gap: Math.round(gap * 100) / 100,
    padding: {
      top: Math.round(padTop * 100) / 100,
      right: Math.round(padRight * 100) / 100,
      bottom: Math.round(padBottom * 100) / 100,
      left: Math.round(padLeft * 100) / 100,
    },
    primaryAlign,
    crossAlign,
    primarySizing: "fixed",
    crossSizing: "fixed",
    confidence: "high",
  };

  return { layout, childMetadata };
}
