import {
  DESIGN_SCHEMA_VERSION,
  type DesignDocument,
  type DesignNode,
} from "@web2design/design-schema";

const black = { r: 0, g: 0, b: 0, a: 1 } as const;
const white = { r: 1, g: 1, b: 1, a: 1 } as const;

function textNode(id: string, characters: string, x: number, y: number): DesignNode {
  return {
    id,
    type: "text",
    x,
    y,
    width: 240,
    height: 24,
    visible: true,
    opacity: 1,
    children: [],
    characters,
    textStyle: {
      fontFamily: "Inter",
      fontFallbacks: ["Arial", "sans-serif"],
      fontSize: 16,
      fontWeight: 400,
      fontStyle: "normal",
      lineHeight: 24,
      letterSpacing: 0,
      textAlign: "left",
      color: black,
    },
  };
}

function documentWith(children: DesignNode[], assets: DesignDocument["assets"] = []): DesignDocument {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    capture: {
      capturedAt: "2026-10-13T07:00:00.000Z",
      source: { kind: "fixture", name: "Web2Design fixtures", version: "0.1.0" },
      page: { url: "https://example.com/fixture", title: "Fixture" },
    },
    viewport: {
      width: 800,
      height: 600,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
    },
    root: {
      id: "root",
      type: "frame",
      name: "Page",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      visible: true,
      opacity: 1,
      children,
    },
    assets,
  };
}

export const simpleTextFixture = documentWith([
  textNode("text-1", "Hello Web2Design", 24, 24),
]);

export const styledRectangleFixture = documentWith([
  {
    id: "rectangle-1",
    type: "rectangle",
    x: 24,
    y: 24,
    width: 320,
    height: 180,
    visible: true,
    opacity: 1,
    children: [],
    style: {
      fills: [{ type: "solid", color: white }],
      border: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
      cornerRadius: 12,
    },
  },
]);

export const textCardFixture = documentWith([
  {
    id: "card",
    type: "frame",
    x: 24,
    y: 24,
    width: 360,
    height: 160,
    visible: true,
    opacity: 1,
    style: {
      fills: [{ type: "solid", color: white }],
      cornerRadius: 16,
    },
    children: [
      textNode("card-title", "Card title", 48, 48),
      textNode("card-body", "Card body copy", 48, 88),
    ],
  },
]);

export const imageFixture = documentWith(
  [
    {
      id: "image-1",
      type: "image",
      x: 24,
      y: 24,
      width: 320,
      height: 180,
      visible: true,
      opacity: 1,
      children: [],
      assetId: "asset-image-1",
      fit: "cover",
    },
  ],
  [
    {
      id: "asset-image-1",
      kind: "image",
      source: { type: "url", url: "https://example.com/image.png" },
      contentHash: "sha256:fixture-image",
      mimeType: "image/png",
      intrinsicDimensions: { width: 640, height: 360 },
    },
  ],
);

export const inlineSvgFixture = documentWith([
  {
    id: "svg-1",
    type: "svg",
    x: 24,
    y: 24,
    width: 24,
    height: 24,
    visible: true,
    opacity: 1,
    children: [],
    inlineSvg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
  },
]);

export const shadowFixture = documentWith([
  {
    id: "shadow-card",
    type: "rectangle",
    x: 24,
    y: 24,
    width: 240,
    height: 120,
    visible: true,
    opacity: 1,
    children: [],
    style: {
      fills: [{ type: "solid", color: white }],
      cornerRadius: 8,
      boxShadows: [
        {
          offsetX: 0,
          offsetY: 4,
          blurRadius: 12,
          spreadRadius: 0,
          color: { r: 0, g: 0, b: 0, a: 0.18 },
          inset: false,
        },
      ],
    },
  },
]);

export const nestedFramesFixture = documentWith([
  {
    id: "outer-frame",
    type: "frame",
    x: 40,
    y: 40,
    width: 400,
    height: 300,
    visible: true,
    opacity: 1,
    children: [
      {
        id: "inner-frame",
        type: "frame",
        x: 80,
        y: 80,
        width: 200,
        height: 120,
        visible: true,
        opacity: 1,
        children: [textNode("nested-text", "Nested", 96, 96)],
      },
    ],
  },
]);

export const representativeFixtures = {
  simpleText: simpleTextFixture,
  styledRectangle: styledRectangleFixture,
  textCard: textCardFixture,
  image: imageFixture,
  inlineSvg: inlineSvgFixture,
  shadow: shadowFixture,
  nestedFrames: nestedFramesFixture,
} satisfies Record<string, DesignDocument>;

