import { describe, expect, it } from "vitest";
import { renderSvgNode } from "../src/svg.js";
import { WarningCollector } from "../src/warnings.js";
import { FakeFigmaHost, FakeFrameNode, FakeRectangleNode } from "./helpers/fake-figma-host.js";

describe("figma-renderer - svg", () => {
  it("imports valid SVG string using createNodeFromSvg and scales to captured dimensions", () => {
    const host = new FakeFigmaHost();
    const warnings = new WarningCollector();
    const svgNode = {
      id: "svg-1",
      type: "svg" as const,
      x: 10,
      y: 10,
      width: 48,
      height: 48,
      visible: true,
      opacity: 1,
      children: [] as [],
      inlineSvg: '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
    };

    const sceneNode = renderSvgNode(svgNode, svgNode.inlineSvg, host, warnings);

    expect(sceneNode).toBeInstanceOf(FakeFrameNode);
    expect(sceneNode.width).toBe(48);
    expect(sceneNode.height).toBe(48);
    expect(warnings.getWarnings().length).toBe(0);
  });

  it("warns when natural SVG aspect ratio differs significantly from captured box", () => {
    const host = new FakeFigmaHost();
    const warnings = new WarningCollector();
    const svgNode = {
      id: "svg-distorted",
      type: "svg" as const,
      x: 0,
      y: 0,
      width: 200, // aspect 2:1
      height: 100,
      visible: true,
      opacity: 1,
      children: [] as [],
      inlineSvg: '<svg width="50" height="100"><rect/></svg>', // natural aspect 1:2
    };

    const sceneNode = renderSvgNode(svgNode, svgNode.inlineSvg, host, warnings);

    expect(sceneNode.width).toBe(200);
    expect(sceneNode.height).toBe(100);
    expect(warnings.getWarnings().some((w) => w.code === "SVG_ASPECT_APPROXIMATED")).toBe(true);
  });

  it("falls back to placeholder rectangle on SVG import syntax failure", () => {
    const host = new FakeFigmaHost();
    const warnings = new WarningCollector();
    const svgNode = {
      id: "svg-broken",
      type: "svg" as const,
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      visible: true,
      opacity: 1,
      children: [] as [],
      inlineSvg: '<svg throw-error-syntax-broken="true">',
    };

    const sceneNode = renderSvgNode(svgNode, svgNode.inlineSvg, host, warnings);

    expect(sceneNode).toBeInstanceOf(FakeRectangleNode);
    expect(sceneNode.width).toBe(32);
    expect(sceneNode.height).toBe(32);
    expect(warnings.getWarnings().some((w) => w.code === "SVG_IMPORT_FAILED")).toBe(true);
  });
});
