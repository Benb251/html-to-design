import { describe, expect, it } from "vitest";
import { handleUiMessage, type SessionState } from "../src/main.js";
import type { PluginToUiMessage } from "../src/messages.js";
import { imageFixture, simpleTextFixture } from "@web2design/test-fixtures";
import type { FigmaRendererHost } from "@web2design/figma-renderer";

function createHarness() {
  const messages: PluginToUiMessage[] = [];
  const notifications: Array<{ message: string; options?: { error?: boolean } | undefined }> = [];
  let closed = false;

  const postMessage = (msg: PluginToUiMessage): void => {
    messages.push(msg);
  };

  const notify = (msg: string, opts?: { error?: boolean }): void => {
    notifications.push({ message: msg, options: opts });
  };

  const close = (): void => {
    closed = true;
  };

  return {
    messages,
    notifications,
    get isClosed() {
      return closed;
    },
    postMessage,
    notify,
    close,
  };
}

class FakeNode {
  id = "test-node-1";
  name = "";
  x = 0;
  y = 0;
  width = 100;
  height = 100;
  visible = true;
  opacity = 1;
  fills = [];
  strokes = [];
  strokeWeight = 0;
  effects = [];
  layoutMode = "NONE";
  children: unknown[] = [];
  pluginData = new Map<string, string>();
  setPluginData(k: string, v: string) {
    this.pluginData.set(k, v);
  }
  getPluginData(k: string) {
    return this.pluginData.get(k) ?? "";
  }
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  appendChild(child: unknown) {
    this.children.push(child);
  }
}

function createFakeHost(): FigmaRendererHost {
  const roots: FrameNode[] = [];
  return {
    createFrame: () => new FakeNode() as unknown as FrameNode,
    createRectangle: () => new FakeNode() as unknown as RectangleNode,
    createText: () =>
      Object.assign(new FakeNode(), {
        characters: "",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 16,
        lineHeight: { unit: "AUTO" },
        letterSpacing: { value: 0, unit: "PIXELS" },
        textAlignHorizontal: "LEFT",
        textAutoResize: "NONE",
      }) as unknown as TextNode,
    createNodeFromSvg: () => new FakeNode() as unknown as FrameNode,
    createImage: () => ({ hash: "fake-hash" } as unknown as Image),
    createImageAsync: async () => ({ hash: "fake-url-hash" } as unknown as Image),
    base64Decode: (d: string) => Buffer.from(d, "base64"),
    loadFontAsync: async () => {},
    listAvailableFontsAsync: async () => [{ fontName: { family: "Inter", style: "Regular" } } as unknown as Font],
    appendRoot: (root: FrameNode) => {
      roots.push(root);
    },
    setSelection: () => {},
    scrollAndZoomIntoView: () => {},
    getViewportCenter: () => ({ x: 0, y: 0 }),
  };
}

describe("Figma plugin - message handling protocol", () => {
  it("processes a valid document object and returns validation-success", async () => {
    const harness = createHarness();

    await handleUiMessage({ type: "validate-document", raw: simpleTextFixture }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-success");
    if (response.type === "validation-success") {
      expect(response.summary.totalNodes).toBe(2);
      expect(response.summary.schemaVersion).toBe("0.5");
      expect(response.document).toEqual(simpleTextFixture);
    }
    expect(harness.notifications[0]).toEqual({
      message: "Web2Design document validated",
      options: undefined,
    });
  });

  it("parses and validates a V0.3 document retaining schemaVersion 0.3", async () => {
    const harness = createHarness();
    const v03Doc = { ...simpleTextFixture, schemaVersion: "0.3" };

    await handleUiMessage({ type: "validate-document", raw: v03Doc }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-success");
    if (response.type === "validation-success") {
      expect(response.summary.schemaVersion).toBe("0.3");
    }
  });

  it("parses and validates a V0.2 document retaining schemaVersion 0.2", async () => {
    const harness = createHarness();
    const v02Doc = { ...simpleTextFixture, schemaVersion: "0.2" };

    await handleUiMessage({ type: "validate-document", raw: v02Doc }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-success");
    if (response.type === "validation-success") {
      expect(response.summary.schemaVersion).toBe("0.2");
    }
  });

  it("parses and validates a V0.1 document retaining schemaVersion 0.1", async () => {
    const harness = createHarness();
    const v01Doc = { ...simpleTextFixture, schemaVersion: "0.1" };

    await handleUiMessage({ type: "validate-document", raw: v01Doc }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-success");
    if (response.type === "validation-success") {
      expect(response.summary.schemaVersion).toBe("0.1");
    }
  });

  it("parses and validates a raw JSON string document", async () => {
    const harness = createHarness();
    const jsonString = JSON.stringify(imageFixture);

    await handleUiMessage({ type: "validate-document", raw: jsonString }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-success");
    if (response.type === "validation-success") {
      expect(response.summary.assetCount).toBe(1);
      expect(response.summary.nodeCounts.image).toBe(1);
    }
  });

  it("handles malformed JSON syntax string with a serializable error and notification", async () => {
    const harness = createHarness();

    await handleUiMessage({ type: "validate-document", raw: '{"broken": json...}' }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-error");
    if (response.type === "validation-error") {
      expect(response.error.message).toContain("JSON syntax error");
      expect(response.error.issues[0]?.code).toBe("json_parse_error");
    }
    expect(harness.notifications[0]).toEqual({
      message: "Invalid JSON syntax",
      options: { error: true },
    });
  });

  it("rejects invalid schema version with validation issues", async () => {
    const harness = createHarness();
    const invalidDoc = { ...simpleTextFixture, schemaVersion: "0.6" };

    await handleUiMessage({ type: "validate-document", raw: invalidDoc }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-error");
    if (response.type === "validation-error") {
      expect(response.error.issues.some((i) => i.path.includes("schemaVersion"))).toBe(true);
    }
    expect(harness.notifications[0]).toEqual({
      message: "Invalid Web2Design document",
      options: { error: true },
    });
  });

  it("rejects image node with missing asset reference", async () => {
    const harness = createHarness();
    const brokenAssetDoc = {
      ...imageFixture,
      assets: [], // missing asset referenced by image-1
    };

    await handleUiMessage({ type: "validate-document", raw: brokenAssetDoc }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-error");
    if (response.type === "validation-error") {
      expect(response.error.issues.some((i) => i.message.includes("missing or non-image asset"))).toBe(true);
    }
  });

  it("rejects unknown schema fields under strict schema validation", async () => {
    const harness = createHarness();
    const docWithUnknownField = { ...simpleTextFixture, customFigmaField: 123 };

    await handleUiMessage({ type: "validate-document", raw: docWithUnknownField }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-error");
    if (response.type === "validation-error") {
      expect(response.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    }
  });

  it("handles malformed message object missing 'type'", async () => {
    const harness = createHarness();

    await handleUiMessage(null, harness.postMessage, harness.notify);
    await handleUiMessage("not an object", harness.postMessage, harness.notify);
    await handleUiMessage({ invalid: true }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(3);
    for (const msg of harness.messages) {
      expect(msg.type).toBe("validation-error");
    }
  });

  it("handles close-plugin and notify messages", async () => {
    const harness = createHarness();

    await handleUiMessage({ type: "close-plugin" }, harness.postMessage, harness.notify, harness.close);
    expect(harness.isClosed).toBe(true);

    await handleUiMessage({ type: "notify", message: "Hello", error: true }, harness.postMessage, harness.notify);
    expect(harness.notifications[0]).toEqual({
      message: "Hello",
      options: { error: true },
    });
  });

  it("handles import-document flow after successful validation", async () => {
    const harness = createHarness();
    const host = createFakeHost();
    const sessionState: SessionState = { currentValidatedDoc: null, isImporting: false };

    // 1. Validate
    await handleUiMessage(
      { type: "validate-document", raw: simpleTextFixture },
      harness.postMessage,
      harness.notify,
      harness.close,
      host,
      sessionState,
    );
    expect(harness.messages[0]?.type).toBe("validation-success");

    // 2. Import
    await handleUiMessage(
      { type: "import-document" },
      harness.postMessage,
      harness.notify,
      harness.close,
      host,
      sessionState,
    );

    expect(harness.messages.length).toBe(3); // validation-success, import-started, import-success
    expect(harness.messages[1]?.type).toBe("import-started");
    expect(harness.messages[2]?.type).toBe("import-success");
    if (harness.messages[2]?.type === "import-success") {
      expect(harness.messages[2].result.createdNodeCount).toBe(2);
    }
  });

  it("rejects import-document if no document was validated yet", async () => {
    const harness = createHarness();
    const host = createFakeHost();
    const sessionState: SessionState = { currentValidatedDoc: null, isImporting: false };

    await handleUiMessage(
      { type: "import-document" },
      harness.postMessage,
      harness.notify,
      harness.close,
      host,
      sessionState,
    );

    expect(harness.messages.length).toBe(1);
    expect(harness.messages[0]?.type).toBe("import-error");
    expect(harness.notifications[0]?.message).toContain("Please validate a document before importing");
  });

  it("ensures state isolation across consecutive validation attempts", async () => {
    const harness = createHarness();

    // 1. Fail with bad JSON
    await handleUiMessage({ type: "validate-document", raw: "invalid json string" }, harness.postMessage, harness.notify);
    expect(harness.messages[0]?.type).toBe("validation-error");

    // 2. Succeed with valid document
    await handleUiMessage({ type: "validate-document", raw: simpleTextFixture }, harness.postMessage, harness.notify);
    expect(harness.messages[1]?.type).toBe("validation-success");

    // 3. Fail with missing asset
    await handleUiMessage({ type: "validate-document", raw: { ...imageFixture, assets: [] } }, harness.postMessage, harness.notify);
    expect(harness.messages[2]?.type).toBe("validation-error");

    // 4. Succeed again
    await handleUiMessage({ type: "validate-document", raw: imageFixture }, harness.postMessage, harness.notify);
    expect(harness.messages[3]?.type).toBe("validation-success");
  });
});
