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
      border: {
        top: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
        right: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
        bottom: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
        left: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
      },
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

export const perSideWidthsFixture = documentWith([
  {
    id: "per-side-widths",
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
      border: {
        top: { width: 1, style: "solid", color: { r: 0.2, g: 0.4, b: 0.6, a: 1 } },
        right: { width: 2, style: "solid", color: { r: 0.2, g: 0.4, b: 0.6, a: 1 } },
        bottom: { width: 3, style: "solid", color: { r: 0.2, g: 0.4, b: 0.6, a: 1 } },
        left: { width: 4, style: "solid", color: { r: 0.2, g: 0.4, b: 0.6, a: 1 } },
      },
    },
  },
]);

export const mixedSideColorsFixture = documentWith([
  {
    id: "mixed-side-colors",
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
      border: {
        top: { width: 2, style: "solid", color: { r: 1, g: 0, b: 0, a: 1 } },
        right: { width: 2, style: "solid", color: { r: 0, g: 1, b: 0, a: 1 } },
        bottom: { width: 2, style: "solid", color: { r: 0, g: 0, b: 1, a: 1 } },
        left: { width: 2, style: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
      },
    },
  },
]);

export const multipleDropShadowsFixture = documentWith([
  {
    id: "multi-shadows",
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
          offsetY: 2,
          blurRadius: 4,
          spreadRadius: 0,
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          inset: false,
        },
        {
          offsetX: 0,
          offsetY: 8,
          blurRadius: 16,
          spreadRadius: -2,
          color: { r: 0, g: 0, b: 0, a: 0.15 },
          inset: false,
        },
      ],
    },
  },
]);

export const insetShadowFixture = documentWith([
  {
    id: "inset-shadow",
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
          offsetY: 2,
          blurRadius: 6,
          spreadRadius: 0,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          inset: true,
        },
      ],
    },
  },
]);

export const mixedShadowStackFixture = documentWith([
  {
    id: "mixed-shadow-stack",
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
          blurRadius: 8,
          spreadRadius: 0,
          color: { r: 0, g: 0, b: 0, a: 0.2 },
          inset: false,
        },
        {
          offsetX: 0,
          offsetY: 1,
          blurRadius: 2,
          spreadRadius: 0,
          color: { r: 1, g: 1, b: 1, a: 0.5 },
          inset: true,
        },
      ],
    },
  },
]);

export const historicalV01Fixture = {
  schemaVersion: "0.1" as const,
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
    type: "frame" as const,
    name: "Page",
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    visible: true,
    opacity: 1,
    children: [
      {
        id: "rect-v01",
        type: "rectangle" as const,
        x: 24,
        y: 24,
        width: 320,
        height: 180,
        visible: true,
        opacity: 1,
        children: [] as [],
        style: {
          fills: [{ type: "solid" as const, color: { r: 1, g: 1, b: 1, a: 1 } }],
          border: { width: 1, style: "solid" as const, color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
          cornerRadius: 12,
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
    ],
  },
  assets: [],
};

export const historicalV02GradientFixture = {
  schemaVersion: "0.2" as const,
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
    type: "frame" as const,
    name: "Page",
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    visible: true,
    opacity: 1,
    children: [
      {
        id: "rect-v02",
        type: "rectangle" as const,
        x: 24,
        y: 24,
        width: 300,
        height: 100,
        visible: true,
        opacity: 1,
        children: [] as [],
        style: {
          fills: [
            {
              type: "linear-gradient" as const,
              angle: 90,
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
                { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
              ],
            },
          ],
          border: { width: 2, style: "solid" as const, color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } },
        },
      },
    ],
  },
  assets: [],
};

export const historicalV03BorderShadowFixture = {
  schemaVersion: "0.3" as const,
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
    type: "frame" as const,
    name: "Page",
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    visible: true,
    opacity: 1,
    children: [
      {
        id: "rect-v03",
        type: "rectangle" as const,
        x: 24,
        y: 24,
        width: 320,
        height: 180,
        visible: true,
        opacity: 1,
        children: [] as [],
        style: {
          fills: [{ type: "solid" as const, color: { r: 1, g: 1, b: 1, a: 1 } }],
          border: {
            top: { width: 1, style: "solid" as const, color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
            right: { width: 2, style: "solid" as const, color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
            bottom: { width: 3, style: "solid" as const, color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
            left: { width: 4, style: "solid" as const, color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
          },
          cornerRadius: 12,
          boxShadows: [
            {
              offsetX: 0,
              offsetY: 4,
              blurRadius: 12,
              spreadRadius: 0,
              color: { r: 0, g: 0, b: 0, a: 0.18 },
              inset: false,
            },
            {
              offsetX: 0,
              offsetY: 1,
              blurRadius: 2,
              spreadRadius: 0,
              color: { r: 0, g: 0, b: 0, a: 0.1 },
              inset: true,
            },
          ],
        },
      },
    ],
  },
  assets: [],
};

export const bothAxisClipFixture = documentWith([
  {
    id: "clip-both-frame",
    type: "frame",
    x: 24,
    y: 24,
    width: 200,
    height: 100,
    visible: true,
    opacity: 1,
    clip: { x: true, y: true },
    style: {
      fills: [{ type: "solid", color: white }],
    },
    children: [
      {
        id: "child-rect-overflow",
        type: "rectangle",
        x: 150,
        y: 50,
        width: 100,
        height: 100,
        visible: true,
        opacity: 1,
        children: [],
        style: {
          fills: [{ type: "solid", color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } }],
        },
      },
    ],
  },
]);

export const xOnlyClipFixture = documentWith([
  {
    id: "clip-x-frame",
    type: "frame",
    x: 24,
    y: 24,
    width: 200,
    height: 100,
    visible: true,
    opacity: 1,
    clip: { x: true, y: false },
    children: [
      {
        id: "child-x-overflow",
        type: "rectangle",
        x: 150,
        y: 20,
        width: 100,
        height: 60,
        visible: true,
        opacity: 1,
        children: [],
      },
    ],
  },
]);

export const yOnlyClipFixture = documentWith([
  {
    id: "clip-y-frame",
    type: "frame",
    x: 24,
    y: 24,
    width: 200,
    height: 100,
    visible: true,
    opacity: 1,
    clip: { x: false, y: true },
    children: [
      {
        id: "child-y-overflow",
        type: "rectangle",
        x: 20,
        y: 80,
        width: 100,
        height: 60,
        visible: true,
        opacity: 1,
        children: [],
      },
    ],
  },
]);

export const nestedClipsFixture = documentWith([
  {
    id: "outer-clip-frame",
    type: "frame",
    x: 24,
    y: 24,
    width: 300,
    height: 200,
    visible: true,
    opacity: 1,
    clip: { x: true, y: true },
    children: [
      {
        id: "inner-clip-frame",
        type: "frame",
        x: 50,
        y: 50,
        width: 150,
        height: 100,
        visible: true,
        opacity: 1,
        clip: { x: true, y: false },
        children: [
          {
            id: "deep-child",
            type: "rectangle",
            x: 100,
            y: 80,
            width: 100,
            height: 100,
            visible: true,
            opacity: 1,
            children: [],
          },
        ],
      },
    ],
  },
]);

export const roundedClipFrameFixture = documentWith([
  {
    id: "rounded-clip-card",
    type: "frame",
    x: 24,
    y: 24,
    width: 240,
    height: 160,
    visible: true,
    opacity: 1,
    clip: { x: true, y: true },
    style: {
      fills: [{ type: "solid", color: white }],
      cornerRadius: 24,
      border: {
        top: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
        right: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
        bottom: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
        left: { width: 1, style: "solid", color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } },
      },
    },
    children: [
      {
        id: "clipped-image-box",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 240,
        height: 120,
        visible: true,
        opacity: 1,
        children: [],
        style: {
          fills: [{ type: "solid", color: { r: 0.2, g: 0.6, b: 1, a: 1 } }],
        },
      },
    ],
  },
]);


