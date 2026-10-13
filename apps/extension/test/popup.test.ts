import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { simpleTextFixture } from "@web2design/test-fixtures";
import { serializeCapture } from "@web2design/capture-engine";

let dom: JSDOM;
let clipboard: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;
function button(id: string): HTMLButtonElement {
  const element = dom.window.document.querySelector<HTMLButtonElement>("#" + id);
  if (!element) throw new Error("Missing button: " + id);
  return element;
}
function status(): string | null {
  return dom.window.document.getElementById("status")?.textContent ?? null;
}
async function capture(): Promise<void> {
  button("capture").click();
  await vi.waitFor(() => expect(status()).toBe("Success"));
}

beforeEach(async () => {
  vi.resetModules();
  dom = new JSDOM(readFileSync(new URL("../public/popup.html", import.meta.url), "utf8"));
  clipboard = vi.fn().mockResolvedValue(undefined);
  sendMessage = vi.fn().mockResolvedValue({ ok: true, document: simpleTextFixture });
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", { clipboard: { writeText: clipboard } });
  vi.stubGlobal("chrome", {
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 7, url: "https://example.com" }]),
      sendMessage,
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
  });
  await import("../src/popup.js");
});
afterEach(() => {
  vi.useRealTimers();
  dom.window.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("popup capture and exports", () => {
  it("shows the active hostname, ready state and disabled export actions", async () => {
    await vi.waitFor(() => expect(dom.window.document.getElementById("page")?.textContent).toBe("example.com"));
    expect(status()).toBe("Ready");
    expect(button("copy").disabled).toBe(true);
    expect(button("download").disabled).toBe(true);
  });
  it("shows validated JSON and node/warning counts after capture", async () => {
    await capture();
    const output = dom.window.document.querySelector<HTMLTextAreaElement>("#json");
    expect(output?.value).toBe(serializeCapture(simpleTextFixture));
    expect(output?.hidden).toBe(false);
    expect(dom.window.document.getElementById("details")?.textContent).toContain("Nodes: 2");
    expect(button("copy").disabled).toBe(false);
    expect(button("download").disabled).toBe(false);
    expect(button("capture").disabled).toBe(false);
  });
  it("copies exactly the validated, pretty-printed JSON", async () => {
    await capture();
    button("copy").click();
    await vi.waitFor(() => expect(status()).toContain("JSON copied"));
    expect(clipboard).toHaveBeenCalledWith(serializeCapture(simpleTextFixture));
  });
  it("makes clipboard failure visible while retaining selectable JSON", async () => {
    clipboard.mockRejectedValue(new Error("Denied"));
    await capture();
    button("copy").click();
    await vi.waitFor(() => expect(status()).toContain("clipboard write failed"));
    expect(dom.window.document.querySelector<HTMLTextAreaElement>("#json")?.value).toBe(serializeCapture(simpleTextFixture));
  });
  it("downloads identical bytes under a hostname/date filename", async () => {
    let savedBlob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation(blob => {
      if (!(blob instanceof Blob)) throw new Error("Expected JSON Blob");
      savedBlob = blob;
      return "blob:popup-export";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const anchors: Array<{ filename: string; href: string }> = [];
    vi.spyOn(dom.window.HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push({ filename: this.download, href: this.href });
    });
    await capture();
    vi.useFakeTimers();
    button("download").click();
    expect(anchors).toEqual([{ filename: "web2design-example-com-2026-10-13.json", href: "blob:popup-export" }]);
    expect(await savedBlob?.text()).toBe(serializeCapture(simpleTextFixture));
    expect(status()).toContain("download requested");
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:popup-export");
    vi.useRealTimers();
  });
  it("clears old exports and shows an error for invalid schema output", async () => {
    await capture();
    sendMessage.mockResolvedValue({ ok: true, document: { ...simpleTextFixture, unknownField: true } });
    button("capture").click();
    await vi.waitFor(() => expect(status()).toContain("schema validation"));
    expect(button("copy").disabled).toBe(true);
    expect(button("download").disabled).toBe(true);
    expect(dom.window.document.querySelector<HTMLTextAreaElement>("#json")?.value).toBe("");
  });
});
