import { describe, expect, it } from "vitest";
import type { VersionedDesignDocument } from "@web2design/design-schema";
import {
  FakeFigmaHost,
  FakeFrameNode,
  FakeTextNode,
  renderDesignDocument,
} from "../src/index.js";

// Reproduction fixture modeling the real-world 9Router layout:
// Vertical sidebar with horizontal items, nested Auto Layout containers, and multi-word text nodes
const routerDashboardFixture: VersionedDesignDocument = {
  schemaVersion: "0.7",
  capture: {
    capturedAt: "2026-10-14T12:00:00.000Z",
    source: { kind: "chrome-extension", name: "Web2Design", version: "0.1.0" },
    page: { url: "http://192.168.1.1/dashboard", title: "9Router Gateway Control" },
  },
  viewport: { width: 1200, height: 800, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
  assets: [],
  warnings: [],
  root: {
    id: "root-page",
    type: "frame",
    sourceTag: "body",
    name: "Dashboard Page",
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
    visible: true,
    opacity: 1,
    style: {
      fills: [{ type: "solid", color: { r: 0.96, g: 0.97, b: 0.98, a: 1 } }],
    },
    layout: {
      type: "flex",
      direction: "horizontal",
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      primaryAlign: "start",
      crossAlign: "start",
      primarySizing: "fixed",
      crossSizing: "fixed",
      confidence: "high",
    },
    children: [
      // 1. Sidebar Container (Vertical Auto Layout)
      {
        id: "sidebar",
        type: "frame",
        sourceTag: "aside",
        name: "Sidebar Navigation",
        x: 0,
        y: 0,
        width: 260,
        height: 800,
        visible: true,
        opacity: 1,
        style: {
          fills: [{ type: "solid", color: { r: 0.11, g: 0.14, b: 0.19, a: 1 } }],
        },
        layout: {
          type: "flex",
          direction: "vertical",
          gap: 12,
          padding: { top: 20, right: 16, bottom: 20, left: 16 },
          primaryAlign: "start",
          crossAlign: "start",
          primarySizing: "fixed",
          crossSizing: "fixed",
          confidence: "high",
        },
        children: [
          // Sidebar Item 1: CLI Tools
          {
            id: "nav-item-cli",
            type: "frame",
            sourceTag: "div",
            name: "Nav Item — CLI Tools",
            x: 16,
            y: 20,
            width: 228,
            height: 40,
            visible: true,
            opacity: 1,
            style: {},
            layout: {
              type: "flex",
              direction: "horizontal",
              gap: 10,
              padding: { top: 10, right: 12, bottom: 10, left: 12 },
              primaryAlign: "start",
              crossAlign: "center",
              primarySizing: "fixed",
              crossSizing: "fixed",
              confidence: "high",
            },
            children: [
              {
                id: "icon-cli",
                type: "rectangle",
                sourceTag: "span",
                name: "Icon",
                x: 28,
                y: 30,
                width: 20,
                height: 20,
                visible: true,
                opacity: 1,
                style: { fills: [{ type: "solid", color: { r: 0.4, g: 0.5, b: 0.7, a: 1 } }] },
                children: [],
              },
              {
                id: "label-cli",
                type: "text",
                sourceTag: "span",
                name: "Label",
                characters: "CLI Tools",
                x: 58,
                y: 30,
                width: 140,
                height: 20,
                visible: true,
                opacity: 1,
                textStyle: {
                  fontFamily: "Inter",
                  fontSize: 14,
                  fontWeight: 500,
                  fontStyle: "normal",
                  lineHeight: 20,
                  letterSpacing: 0,
                  color: { r: 1, g: 1, b: 1, a: 1 },
                  textAlign: "left",
                },
                children: [],
              },
            ],
          },
          // Sidebar Item 2: Endpoint & Key
          {
            id: "nav-item-endpoint",
            type: "frame",
            sourceTag: "div",
            name: "Nav Item — Endpoint & Key",
            x: 16,
            y: 72,
            width: 228,
            height: 40,
            visible: true,
            opacity: 1,
            style: {},
            layout: {
              type: "flex",
              direction: "horizontal",
              gap: 10,
              padding: { top: 10, right: 12, bottom: 10, left: 12 },
              primaryAlign: "start",
              crossAlign: "center",
              primarySizing: "fixed",
              crossSizing: "fixed",
              confidence: "high",
            },
            children: [
              {
                id: "icon-endpoint",
                type: "rectangle",
                sourceTag: "span",
                name: "Icon",
                x: 28,
                y: 82,
                width: 20,
                height: 20,
                visible: true,
                opacity: 1,
                style: { fills: [{ type: "solid", color: { r: 0.4, g: 0.5, b: 0.7, a: 1 } }] },
                children: [],
              },
              {
                id: "label-endpoint",
                type: "text",
                sourceTag: "span",
                name: "Label",
                characters: "Endpoint & Key",
                x: 58,
                y: 82,
                width: 150,
                height: 20,
                visible: true,
                opacity: 1,
                textStyle: {
                  fontFamily: "Inter",
                  fontSize: 14,
                  fontWeight: 500,
                  fontStyle: "normal",
                  lineHeight: 20,
                  letterSpacing: 0,
                  color: { r: 1, g: 1, b: 1, a: 1 },
                  textAlign: "left",
                },
                children: [],
              },
            ],
          },
          // Sidebar Item 3: Quota Tracker
          {
            id: "nav-item-quota",
            type: "frame",
            sourceTag: "div",
            name: "Nav Item — Quota Tracker",
            x: 16,
            y: 124,
            width: 228,
            height: 40,
            visible: true,
            opacity: 1,
            style: {},
            layout: {
              type: "flex",
              direction: "horizontal",
              gap: 10,
              padding: { top: 10, right: 12, bottom: 10, left: 12 },
              primaryAlign: "start",
              crossAlign: "center",
              primarySizing: "fixed",
              crossSizing: "fixed",
              confidence: "high",
            },
            children: [
              {
                id: "icon-quota",
                type: "rectangle",
                sourceTag: "span",
                name: "Icon",
                x: 28,
                y: 134,
                width: 20,
                height: 20,
                visible: true,
                opacity: 1,
                style: { fills: [{ type: "solid", color: { r: 0.4, g: 0.5, b: 0.7, a: 1 } }] },
                children: [],
              },
              {
                id: "label-quota",
                type: "text",
                sourceTag: "span",
                name: "Label",
                characters: "Quota Tracker",
                x: 58,
                y: 134,
                width: 145,
                height: 20,
                visible: true,
                opacity: 1,
                textStyle: {
                  fontFamily: "Inter",
                  fontSize: 14,
                  fontWeight: 500,
                  fontStyle: "normal",
                  lineHeight: 20,
                  letterSpacing: 0,
                  color: { r: 1, g: 1, b: 1, a: 1 },
                  textAlign: "left",
                },
                children: [],
              },
            ],
          },
        ],
      },
      // 2. Main Content Card with Action Buttons
      {
        id: "main-card",
        type: "frame",
        sourceTag: "main",
        name: "Configuration Card",
        x: 290,
        y: 30,
        width: 600,
        height: 400,
        visible: true,
        opacity: 1,
        style: {
          fills: [{ type: "solid", color: { r: 1, g: 1, b: 1, a: 1 } }],
        },
        layout: {
          type: "flex",
          direction: "vertical",
          gap: 16,
          padding: { top: 24, right: 24, bottom: 24, left: 24 },
          primaryAlign: "start",
          crossAlign: "start",
          primarySizing: "fixed",
          crossSizing: "fixed",
          confidence: "high",
        },
        children: [
          {
            id: "card-title",
            type: "text",
            sourceTag: "h2",
            name: "Title",
            characters: "Endpoint Settings",
            x: 314,
            y: 54,
            width: 250,
            height: 28,
            visible: true,
            opacity: 1,
            textStyle: {
              fontFamily: "Inter",
              fontSize: 20,
              fontWeight: 700,
              fontStyle: "normal",
              lineHeight: 28,
              letterSpacing: 0,
              color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
              textAlign: "left",
            },
            children: [],
          },
          {
            id: "button-row",
            type: "frame",
            sourceTag: "div",
            name: "Button Group",
            x: 314,
            y: 98,
            width: 200,
            height: 36,
            visible: true,
            opacity: 1,
            style: {},
            layout: {
              type: "flex",
              direction: "horizontal",
              gap: 8,
              padding: { top: 6, right: 12, bottom: 6, left: 12 },
              primaryAlign: "start",
              crossAlign: "center",
              primarySizing: "fixed",
              crossSizing: "fixed",
              confidence: "high",
            },
            children: [
              {
                id: "btn-apply-label",
                type: "text",
                sourceTag: "span",
                name: "Apply Text",
                characters: "Apply",
                x: 326,
                y: 104,
                width: 60,
                height: 24,
                visible: true,
                opacity: 1,
                textStyle: {
                  fontFamily: "Inter",
                  fontSize: 14,
                  fontWeight: 600,
                  fontStyle: "normal",
                  lineHeight: 24,
                  letterSpacing: 0,
                  color: { r: 0.2, g: 0.4, b: 0.9, a: 1 },
                  textAlign: "center",
                },
                children: [],
              },
              {
                id: "btn-reset-label",
                type: "text",
                sourceTag: "span",
                name: "Reset Text",
                characters: "Reset",
                x: 394,
                y: 104,
                width: 60,
                height: 24,
                visible: true,
                opacity: 1,
                textStyle: {
                  fontFamily: "Inter",
                  fontSize: 14,
                  fontWeight: 600,
                  fontStyle: "normal",
                  lineHeight: 24,
                  letterSpacing: 0,
                  color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
                  textAlign: "center",
                },
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("W2D-018A: Real Figma Text & Auto Layout Fidelity Regression Suite", () => {
  it("verifies FakeTextNode correctly simulates real Figma textAutoResize semantics", () => {
    const textNode = new FakeTextNode();
    expect(textNode.textAutoResize).toBe("WIDTH_AND_HEIGHT");

    // In real Figma, calling resize() while textAutoResize is WIDTH_AND_HEIGHT is ignored
    textNode.resize(250, 40);
    expect(textNode.width).toBe(100); // remains initial default
    expect(textNode.height).toBe(100);

    // After setting textAutoResize = "NONE", explicit resize takes effect
    textNode.textAutoResize = "NONE";
    textNode.resize(250, 40);
    expect(textNode.width).toBe(250);
    expect(textNode.height).toBe(40);
  });

  it("renders representative complex dashboard in normal mode with full text fidelity (abs <= 0.5px)", async () => {
    const host = new FakeFigmaHost();
    const result = await renderDesignDocument(routerDashboardFixture, host, {
      diagnosticLayoutMode: "normal",
    });

    expect(result.skippedNodeCount).toBe(0);
    expect(result.createdNodeCount).toBeGreaterThan(5);

    const root = host.roots[0] as unknown as FakeFrameNode;
    expect(root.layoutMode).toBe("HORIZONTAL");

    // Map all created nodes by id
    const nodeMap = new Map<string, unknown>();
    function collect(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const n = node as { getPluginData?: (k: string) => string; children?: unknown[] };
      const id = n.getPluginData?.("web2design:id");
      if (id) nodeMap.set(id, node);
      if (Array.isArray(n.children)) {
        for (const child of n.children) {
          collect(child);
        }
      }
    }
    collect(root);

    // Assert representative text nodes retain expected width/height without collapsing
    const textChecks = [
      { id: "label-cli", expectedWidth: 140, expectedHeight: 20 },
      { id: "label-endpoint", expectedWidth: 150, expectedHeight: 20 },
      { id: "label-quota", expectedWidth: 145, expectedHeight: 20 },
      { id: "card-title", expectedWidth: 250, expectedHeight: 28 },
      { id: "btn-apply-label", expectedWidth: 60, expectedHeight: 24 },
      { id: "btn-reset-label", expectedWidth: 60, expectedHeight: 24 },
    ];

    for (const check of textChecks) {
      const node = nodeMap.get(check.id) as unknown as FakeTextNode | undefined;
      expect(node, `Node ${check.id} must exist`).toBeDefined();
      expect(node!.textAutoResize).toBe("NONE");
      expect(Math.abs(node!.width - check.expectedWidth)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(node!.height - check.expectedHeight)).toBeLessThanOrEqual(0.5);
    }

    // Verify Auto Layout container frame configurations
    const sidebar = nodeMap.get("sidebar") as unknown as FakeFrameNode;
    expect(sidebar.layoutMode).toBe("VERTICAL");
    expect(sidebar.itemSpacing).toBe(12);

    const buttonRow = nodeMap.get("button-row") as unknown as FakeFrameNode;
    expect(buttonRow.layoutMode).toBe("HORIZONTAL");
    expect(buttonRow.itemSpacing).toBe(8);
  });

  it("renders in diagnostic absolute-only mode: all frames layoutMode=NONE and placement matches schema", async () => {
    const host = new FakeFigmaHost();
    const result = await renderDesignDocument(routerDashboardFixture, host, {
      diagnosticLayoutMode: "absolute-only",
    });

    expect(result.skippedNodeCount).toBe(0);
    const root = host.roots[0] as unknown as FakeFrameNode;
    expect(root.layoutMode).toBe("NONE");

    const frames: FakeFrameNode[] = [];
    const texts: FakeTextNode[] = [];

    function collectAll(n: unknown): void {
      if (n instanceof FakeFrameNode) {
        frames.push(n);
        for (const c of n.children) collectAll(c);
      } else if (n instanceof FakeTextNode) {
        texts.push(n);
      }
    }
    collectAll(root);

    // In absolute-only diagnostic mode, every frame must remain layoutMode = "NONE"
    for (const frame of frames) {
      expect(frame.layoutMode).toBe("NONE");
    }

    // Every text node must have textAutoResize = "NONE" and width > 0
    for (const text of texts) {
      expect(text.textAutoResize).toBe("NONE");
      expect(text.width).toBeGreaterThan(0);
      expect(text.height).toBeGreaterThan(0);
    }

    // Verify CLI label in absolute-only mode
    const cliLabel = texts.find((t) => t.getPluginData("web2design:id") === "label-cli");
    expect(cliLabel).toBeDefined();
    expect(Math.abs(cliLabel!.width - 140)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(cliLabel!.height - 20)).toBeLessThanOrEqual(0.5);
  });
});
