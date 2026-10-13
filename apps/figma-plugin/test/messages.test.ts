import { describe, expect, it } from "vitest";
import { handleUiMessage } from "../src/main.js";
import type { PluginToUiMessage } from "../src/messages.js";
import { imageFixture, simpleTextFixture } from "@web2design/test-fixtures";

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

describe("Figma plugin - message handling protocol", () => {
  it("processes a valid document object and returns validation-success", () => {
    const harness = createHarness();

    handleUiMessage({ type: "validate-document", raw: simpleTextFixture }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-success");
    if (response.type === "validation-success") {
      expect(response.summary.totalNodes).toBe(2);
      expect(response.summary.schemaVersion).toBe("0.1");
      expect(response.document).toEqual(simpleTextFixture);
    }
    expect(harness.notifications[0]).toEqual({
      message: "Web2Design document validated",
      options: undefined,
    });
  });

  it("parses and validates a raw JSON string document", () => {
    const harness = createHarness();
    const jsonString = JSON.stringify(imageFixture);

    handleUiMessage({ type: "validate-document", raw: jsonString }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-success");
    if (response.type === "validation-success") {
      expect(response.summary.assetCount).toBe(1);
      expect(response.summary.nodeCounts.image).toBe(1);
    }
  });

  it("handles malformed JSON syntax string with a serializable error and notification", () => {
    const harness = createHarness();

    handleUiMessage({ type: "validate-document", raw: '{"broken": json...}' }, harness.postMessage, harness.notify);

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

  it("rejects invalid schema version with validation issues", () => {
    const harness = createHarness();
    const invalidDoc = { ...simpleTextFixture, schemaVersion: "0.2" };

    handleUiMessage({ type: "validate-document", raw: invalidDoc }, harness.postMessage, harness.notify);

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

  it("rejects image node with missing asset reference", () => {
    const harness = createHarness();
    const brokenAssetDoc = {
      ...imageFixture,
      assets: [], // missing asset referenced by image-1
    };

    handleUiMessage({ type: "validate-document", raw: brokenAssetDoc }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-error");
    if (response.type === "validation-error") {
      expect(response.error.issues.some((i) => i.message.includes("missing or non-image asset"))).toBe(true);
    }
  });

  it("rejects unknown schema fields under strict schema validation", () => {
    const harness = createHarness();
    const docWithUnknownField = { ...simpleTextFixture, customFigmaField: 123 };

    handleUiMessage({ type: "validate-document", raw: docWithUnknownField }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(1);
    const response = harness.messages[0]!;
    expect(response.type).toBe("validation-error");
    if (response.type === "validation-error") {
      expect(response.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    }
  });

  it("handles malformed message object missing 'type'", () => {
    const harness = createHarness();

    handleUiMessage(null, harness.postMessage, harness.notify);
    handleUiMessage("not an object", harness.postMessage, harness.notify);
    handleUiMessage({ invalid: true }, harness.postMessage, harness.notify);

    expect(harness.messages.length).toBe(3);
    for (const msg of harness.messages) {
      expect(msg.type).toBe("validation-error");
    }
  });

  it("handles close-plugin and notify messages", () => {
    const harness = createHarness();

    handleUiMessage({ type: "close-plugin" }, harness.postMessage, harness.notify, harness.close);
    expect(harness.isClosed).toBe(true);

    handleUiMessage({ type: "notify", message: "Hello", error: true }, harness.postMessage, harness.notify);
    expect(harness.notifications[0]).toEqual({
      message: "Hello",
      options: { error: true },
    });
  });

  it("ensures state isolation across consecutive validation attempts", () => {
    const harness = createHarness();

    // 1. Fail with bad JSON
    handleUiMessage({ type: "validate-document", raw: "invalid json string" }, harness.postMessage, harness.notify);
    expect(harness.messages[0]?.type).toBe("validation-error");

    // 2. Succeed with valid document
    handleUiMessage({ type: "validate-document", raw: simpleTextFixture }, harness.postMessage, harness.notify);
    expect(harness.messages[1]?.type).toBe("validation-success");

    // 3. Fail with missing asset
    handleUiMessage({ type: "validate-document", raw: { ...imageFixture, assets: [] } }, harness.postMessage, harness.notify);
    expect(harness.messages[2]?.type).toBe("validation-error");

    // 4. Succeed again
    handleUiMessage({ type: "validate-document", raw: imageFixture }, harness.postMessage, harness.notify);
    expect(harness.messages[3]?.type).toBe("validation-success");
  });
});
