import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { simpleTextFixture } from "@web2design/test-fixtures";
import { FakeFigmaHost, renderDesignDocument } from "@web2design/figma-renderer";
import type { FakeFrameNode } from "@web2design/figma-renderer";
import type { DesignDocument } from "@web2design/design-schema";
import { handleUiMessage, type SessionState } from "../src/main.js";
import type { PluginToUiMessage } from "../src/messages.js";

function createTestHarness() {
  const messages: PluginToUiMessage[] = [];
  const notifications: Array<{ message: string; options?: { error?: boolean } }> = [];
  let closed = false;

  const postMessage = (msg: PluginToUiMessage): void => {
    messages.push(msg);
  };

  const notify = (msg: string, opts?: { error?: boolean }): void => {
    notifications.push(opts !== undefined ? { message: msg, options: opts } : { message: msg });
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

describe("W2D-008 - Figma Plugin Integration & Regression (Sections 35-38)", () => {
  it("35. verifies complete import lifecycle: validate -> import-document -> import-started -> import-success", async () => {
    const harness = createTestHarness();
    const host = new FakeFigmaHost();
    const state: SessionState = { currentValidatedDoc: null, isImporting: false };

    // 1. Validate
    await handleUiMessage(
      { type: "validate-document", raw: simpleTextFixture },
      harness.postMessage,
      harness.notify,
      harness.close,
      host,
      state,
    );

    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]!.type).toBe("validation-success");
    expect(state.currentValidatedDoc).toBeDefined();

    // 2. Import
    await handleUiMessage(
      { type: "import-document" },
      harness.postMessage,
      harness.notify,
      harness.close,
      host,
      state,
    );

    expect(harness.messages).toHaveLength(3);
    expect(harness.messages[1]!.type).toBe("import-started");
    expect(harness.messages[2]!.type).toBe("import-success");
    expect(state.isImporting).toBe(false);
    expect(host.roots).toHaveLength(1);
  });

  it("35b. handles renderer failure and emits import-error", async () => {
    const harness = createTestHarness();
    const host = new FakeFigmaHost();
    // Simulate host failure
    host.createFrame = () => {
      throw new Error("Simulated Figma host canvas failure");
    };

    const state: SessionState = {
      currentValidatedDoc: simpleTextFixture,
      isImporting: false,
    };

    await handleUiMessage(
      { type: "import-document" },
      harness.postMessage,
      harness.notify,
      harness.close,
      host,
      state,
    );

    expect(harness.messages).toHaveLength(2);
    expect(harness.messages[0]!.type).toBe("import-started");
    expect(harness.messages[1]!.type).toBe("import-error");
    expect(state.isImporting).toBe(false);
  });

  it("35c. guards against concurrent/double-click in-flight import", async () => {
    const harness = createTestHarness();
    const host = new FakeFigmaHost();
    const state: SessionState = {
      currentValidatedDoc: simpleTextFixture,
      isImporting: true, // Already in-flight
    };

    await handleUiMessage(
      { type: "import-document" },
      harness.postMessage,
      harness.notify,
      harness.close,
      host,
      state,
    );

    // No new messages sent to UI, only warning notification
    expect(harness.messages).toHaveLength(0);
    expect(harness.notifications).toContainEqual({
      message: "Import already in progress",
    });
  });

  it("36. verifies fatal cleanup transaction rollback and non-rollback on child warning", async () => {
    // Part A: Recoverable child error does NOT trigger rollback
    const host1 = new FakeFigmaHost();
    const docWithBrokenChild: DesignDocument = {
      ...simpleTextFixture,
      root: {
        ...simpleTextFixture.root,
        children: [
          {
            id: "normal-rect",
            type: "rectangle",
            x: 10,
            y: 10,
            width: 100,
            height: 100,
            visible: true,
            opacity: 1,
            children: [],
          },
        ],
      },
    };

    host1.createRectangle = () => {
      throw new Error("Simulated recoverable child rectangle error");
    };

    const res = await renderDesignDocument(docWithBrokenChild, host1);
    expect(res.skippedNodeCount).toBe(1);
    expect(res.warnings).toContainEqual(
      expect.objectContaining({
        code: "CHILD_RENDER_FAILED",
        nodeId: "normal-rect",
      }),
    );
    expect(host1.roots).toHaveLength(1); // Recoverable warning did not trigger rollback!

    // Part B: Fatal renderer error causes transaction rollback and root removal
    const host2 = new FakeFigmaHost();
    let createdRoot: FakeFrameNode | null = null;
    const origCreateFrame = host2.createFrame.bind(host2);
    host2.createFrame = () => {
      const f = origCreateFrame();
      if (!createdRoot) createdRoot = f as unknown as FakeFrameNode;
      return f;
    };
    host2.appendRoot = () => {
      throw new Error("Fatal host canvas failure");
    };

    await expect(renderDesignDocument(simpleTextFixture, host2)).rejects.toThrow(
      "Fatal host canvas failure",
    );
    expect(createdRoot).not.toBeNull();
    expect(createdRoot!.removed).toBe(true); // Root was removed in rollback
    expect(host2.roots).toHaveLength(0); // Not appended to canvas
  });

  it("37. verifies built plugin artifacts exist in dist/", () => {
    const pluginDir = resolve(__dirname, "..");
    const distManifest = resolve(pluginDir, "dist/manifest.json");
    const distMain = resolve(pluginDir, "dist/main.js");
    const distUi = resolve(pluginDir, "dist/ui.html");
    const distSample = resolve(pluginDir, "dist/sample-w2d-document.json");

    expect(existsSync(distManifest)).toBe(true);
    expect(existsSync(distMain)).toBe(true);
    expect(existsSync(distUi)).toBe(true);
    expect(existsSync(distSample)).toBe(true);
  });

  it("38. verifies manifest configuration locks allowedDomains: ['*']", () => {
    const pluginDir = resolve(__dirname, "..");
    const manifestPath = resolve(pluginDir, "manifest.json");
    const distManifestPath = resolve(pluginDir, "dist/manifest.json");

    for (const p of [manifestPath, distManifestPath]) {
      const content = JSON.parse(readFileSync(p, "utf-8"));
      expect(content.networkAccess).toBeDefined();
      expect(content.networkAccess.allowedDomains).toEqual(["*"]);
      expect(content.networkAccess.allowedDomains).not.toContain("none");
      expect(content.editorType).toEqual(["figma"]);
    }
  });
});
