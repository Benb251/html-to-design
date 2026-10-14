import { describe, expect, it } from "vitest";
import {
  analyzeFlexContainer,
  predictAutoLayoutGeometry,
  type AutoLayoutContainerSpec,
  type AutoLayoutChildSpec,
  type NodeInspectionMetadata,
} from "../src/autolayout.js";
import type { DesignNode } from "@web2design/design-schema";

describe("predictAutoLayoutGeometry", () => {
  it("predicts horizontal row start alignment with gap and padding", () => {
    const container: AutoLayoutContainerSpec = {
      width: 300,
      height: 100,
      direction: "horizontal",
      gap: 16,
      padding: { top: 10, right: 20, bottom: 10, left: 20 },
      primaryAlign: "start",
      crossAlign: "start",
    };
    const children: AutoLayoutChildSpec[] = [
      { id: "c1", width: 60, height: 40 },
      { id: "c2", width: 80, height: 50 },
    ];

    const result = predictAutoLayoutGeometry(container, children);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "c1", x: 20, y: 10, width: 60, height: 40 });
    expect(result[1]).toEqual({ id: "c2", x: 20 + 60 + 16, y: 10, width: 80, height: 50 });
  });

  it("predicts horizontal row center alignment", () => {
    const container: AutoLayoutContainerSpec = {
      width: 200,
      height: 80,
      direction: "horizontal",
      gap: 10,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      primaryAlign: "center",
      crossAlign: "center",
    };
    const children: AutoLayoutChildSpec[] = [
      { id: "c1", width: 40, height: 30 },
      { id: "c2", width: 50, height: 40 },
    ];
    // Total width = 40 + 10 + 50 = 100. Available = 200. Start = (200 - 100)/2 = 50.
    const result = predictAutoLayoutGeometry(container, children);
    expect(result[0]!.x).toBe(50);
    expect(result[0]!.y).toBe((80 - 30) / 2); // 25
    expect(result[1]!.x).toBe(50 + 40 + 10); // 100
    expect(result[1]!.y).toBe((80 - 40) / 2); // 20
  });

  it("predicts horizontal row space-between alignment", () => {
    const container: AutoLayoutContainerSpec = {
      width: 300,
      height: 50,
      direction: "horizontal",
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      primaryAlign: "space-between",
      crossAlign: "start",
    };
    const children: AutoLayoutChildSpec[] = [
      { id: "c1", width: 50, height: 50 },
      { id: "c2", width: 50, height: 50 },
    ];
    // Spacing = (300 - 100) / (2 - 1) = 200.
    const result = predictAutoLayoutGeometry(container, children);
    expect(result[0]!.x).toBe(0);
    expect(result[1]!.x).toBe(250);
  });

  it("predicts flex-grow: 1 child expansion in horizontal row", () => {
    const container: AutoLayoutContainerSpec = {
      width: 300,
      height: 60,
      direction: "horizontal",
      gap: 10,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      primaryAlign: "start",
      crossAlign: "stretch",
    };
    const children: AutoLayoutChildSpec[] = [
      { id: "c1", width: 50, height: 60, grow: false },
      { id: "c2", width: 20, height: 60, grow: true },
    ];
    // availableForGrow = 300 - 50 - 10 = 240.
    const result = predictAutoLayoutGeometry(container, children);
    expect(result[0]!.x).toBe(0);
    expect(result[0]!.width).toBe(50);
    expect(result[1]!.x).toBe(60);
    expect(result[1]!.width).toBe(240);
    expect(result[1]!.height).toBe(60);
  });

  it("predicts vertical column with gap, padding, and center alignment", () => {
    const container: AutoLayoutContainerSpec = {
      width: 150,
      height: 400,
      direction: "vertical",
      gap: 20,
      padding: { top: 15, right: 15, bottom: 15, left: 15 },
      primaryAlign: "start",
      crossAlign: "center",
    };
    const children: AutoLayoutChildSpec[] = [
      { id: "c1", width: 80, height: 50 },
      { id: "c2", width: 100, height: 60 },
    ];
    const result = predictAutoLayoutGeometry(container, children);
    // contentWidth = 150 - 30 = 120.
    // child 1: x = 15 + (120 - 80) / 2 = 35. y = 15.
    // child 2: x = 15 + (120 - 100) / 2 = 25. y = 15 + 50 + 20 = 85.
    expect(result[0]).toEqual({ id: "c1", x: 35, y: 15, width: 80, height: 50 });
    expect(result[1]).toEqual({ id: "c2", x: 25, y: 85, width: 100, height: 60 });
  });
});

describe("analyzeFlexContainer", () => {
  const dummyElement = {} as Element;

  it("infers high-confidence horizontal row when geometry agrees", () => {
    const warnings: string[] = [];
    const children: DesignNode[] = [
      {
        id: "child-1",
        type: "frame",
        sourceTag: "div",
        name: "div",
        x: 116,
        y: 110,
        width: 50,
        height: 30,
        visible: true,
        opacity: 1,
        children: [],
      },
      {
        id: "child-2",
        type: "frame",
        sourceTag: "div",
        name: "div",
        x: 176,
        y: 110,
        width: 60,
        height: 30,
        visible: true,
        opacity: 1,
        children: [],
      },
    ];

    const nodeMeta = new Map<string, NodeInspectionMetadata>([
      ["child-1", { style: { position: "static", flexGrow: "0" } as CSSStyleDeclaration }],
      ["child-2", { style: { position: "static", flexGrow: "0" } as CSSStyleDeclaration }],
    ]);

    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        justifyContent: "start",
        alignItems: "start",
        paddingTop: "10px",
        paddingRight: "16px",
        paddingBottom: "10px",
        paddingLeft: "16px",
        columnGap: "10px",
      } as CSSStyleDeclaration,
      children,
      containerBounds: { x: 100, y: 100, width: 250, height: 80 },
      nodeMetadataMap: nodeMeta,
      warn: (code) => warnings.push(code),
      containerId: "flex-root",
    });

    expect(result).not.toBeNull();
    expect(result!.layout).toEqual({
      type: "flex",
      direction: "horizontal",
      gap: 10,
      padding: { top: 10, right: 16, bottom: 10, left: 16 },
      primaryAlign: "start",
      crossAlign: "start",
      primarySizing: "fixed",
      crossSizing: "fixed",
      confidence: "high",
    });
    expect(warnings).toHaveLength(0);
  });

  it("handles absolute child alongside flow children", () => {
    const warnings: string[] = [];
    const children: DesignNode[] = [
      {
        id: "child-flow",
        type: "frame",
        sourceTag: "div",
        name: "div",
        x: 100,
        y: 100,
        width: 80,
        height: 40,
        visible: true,
        opacity: 1,
        children: [],
      },
      {
        id: "child-abs",
        type: "frame",
        sourceTag: "span",
        name: "span",
        x: 150,
        y: 80,
        width: 20,
        height: 20,
        visible: true,
        opacity: 1,
        children: [],
      },
    ];

    const nodeMeta = new Map<string, NodeInspectionMetadata>([
      ["child-flow", { style: { position: "static" } as CSSStyleDeclaration }],
      ["child-abs", { style: { position: "absolute" } as CSSStyleDeclaration }],
    ]);

    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "start",
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        gap: "0px",
      } as CSSStyleDeclaration,
      children,
      containerBounds: { x: 100, y: 100, width: 200, height: 60 },
      nodeMetadataMap: nodeMeta,
      warn: (code) => warnings.push(code),
      containerId: "flex-with-abs",
    });

    expect(result).not.toBeNull();
    expect(result!.childMetadata.get("child-abs")).toEqual({ positioning: "absolute" });
  });

  it("defers flex-wrap: wrap with AUTO_LAYOUT_WRAP_DEFERRED", () => {
    const warnings: string[] = [];
    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "flex",
        flexWrap: "wrap",
      } as CSSStyleDeclaration,
      children: [],
      containerBounds: { x: 0, y: 0, width: 100, height: 100 },
      nodeMetadataMap: new Map(),
      warn: (code) => warnings.push(code),
      containerId: "wrap-frame",
    });

    expect(result).toBeNull();
    expect(warnings).toContain("AUTO_LAYOUT_WRAP_DEFERRED");
  });

  it("defers row-reverse with AUTO_LAYOUT_REVERSE_DEFERRED", () => {
    const warnings: string[] = [];
    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "flex",
        flexDirection: "row-reverse",
      } as CSSStyleDeclaration,
      children: [],
      containerBounds: { x: 0, y: 0, width: 100, height: 100 },
      nodeMetadataMap: new Map(),
      warn: (code) => warnings.push(code),
      containerId: "reverse-frame",
    });

    expect(result).toBeNull();
    expect(warnings).toContain("AUTO_LAYOUT_REVERSE_DEFERRED");
  });

  it("defers CSS Grid with GRID_LAYOUT_SEMANTICS_DEFERRED", () => {
    const warnings: string[] = [];
    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "grid",
      } as CSSStyleDeclaration,
      children: [],
      containerBounds: { x: 0, y: 0, width: 100, height: 100 },
      nodeMetadataMap: new Map(),
      warn: (code) => warnings.push(code),
      containerId: "grid-frame",
    });

    expect(result).toBeNull();
    expect(warnings).toContain("GRID_LAYOUT_SEMANTICS_DEFERRED");
  });

  it("defers flow-child margins with AUTO_LAYOUT_MARGIN_DEFERRED", () => {
    const warnings: string[] = [];
    const children: DesignNode[] = [
      {
        id: "child-m",
        type: "frame",
        sourceTag: "div",
        name: "div",
        x: 10,
        y: 10,
        width: 40,
        height: 40,
        visible: true,
        opacity: 1,
        children: [],
      },
    ];
    const nodeMeta = new Map<string, NodeInspectionMetadata>([
      ["child-m", { style: { position: "static", marginTop: "10px" } as CSSStyleDeclaration }],
    ]);

    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "flex",
        flexDirection: "row",
      } as CSSStyleDeclaration,
      children,
      containerBounds: { x: 0, y: 0, width: 100, height: 100 },
      nodeMetadataMap: nodeMeta,
      warn: (code) => warnings.push(code),
      containerId: "margin-frame",
    });

    expect(result).toBeNull();
    expect(warnings).toContain("AUTO_LAYOUT_MARGIN_DEFERRED");
  });

  it("defers complex flex-grow ratio with AUTO_LAYOUT_GROW_RATIO_DEFERRED", () => {
    const warnings: string[] = [];
    const children: DesignNode[] = [
      {
        id: "child-g2",
        type: "frame",
        sourceTag: "div",
        name: "div",
        x: 0,
        y: 0,
        width: 80,
        height: 40,
        visible: true,
        opacity: 1,
        children: [],
      },
    ];
    const nodeMeta = new Map<string, NodeInspectionMetadata>([
      ["child-g2", { style: { position: "static", flexGrow: "2" } as CSSStyleDeclaration }],
    ]);

    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "flex",
        flexDirection: "row",
      } as CSSStyleDeclaration,
      children,
      containerBounds: { x: 0, y: 0, width: 100, height: 100 },
      nodeMetadataMap: nodeMeta,
      warn: (code) => warnings.push(code),
      containerId: "grow-ratio-frame",
    });

    expect(result).toBeNull();
    expect(warnings).toContain("AUTO_LAYOUT_GROW_RATIO_DEFERRED");
  });

  it("defers baseline alignment with AUTO_LAYOUT_BASELINE_DEFERRED", () => {
    const warnings: string[] = [];
    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "flex",
        alignItems: "baseline",
      } as CSSStyleDeclaration,
      children: [],
      containerBounds: { x: 0, y: 0, width: 100, height: 100 },
      nodeMetadataMap: new Map(),
      warn: (code) => warnings.push(code),
      containerId: "baseline-frame",
    });

    expect(result).toBeNull();
    expect(warnings).toContain("AUTO_LAYOUT_BASELINE_DEFERRED");
  });

  it("rejects when predicted geometry does not match captured layout", () => {
    const warnings: string[] = [];
    const children: DesignNode[] = [
      {
        id: "child-shifted",
        type: "frame",
        sourceTag: "div",
        name: "div",
        x: 50, // actual position 50, but predicted should be 0
        y: 0,
        width: 40,
        height: 40,
        visible: true,
        opacity: 1,
        children: [],
      },
    ];
    const nodeMeta = new Map<string, NodeInspectionMetadata>([
      ["child-shifted", { style: { position: "static" } as CSSStyleDeclaration }],
    ]);

    const result = analyzeFlexContainer({
      element: dummyElement,
      style: {
        display: "flex",
        flexDirection: "row",
        gap: "0px",
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        justifyContent: "start",
        alignItems: "start",
      } as CSSStyleDeclaration,
      children,
      containerBounds: { x: 0, y: 0, width: 100, height: 50 },
      nodeMetadataMap: nodeMeta,
      warn: (code) => warnings.push(code),
      containerId: "mismatch-frame",
    });

    expect(result).toBeNull();
    expect(warnings).toContain("AUTO_LAYOUT_GEOMETRY_MISMATCH");
  });
});
