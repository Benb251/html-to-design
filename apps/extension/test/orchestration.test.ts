import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { simpleTextFixture } from "@web2design/test-fixtures";
import { canCaptureUrl, captureActivePage, decodeCaptureResponse } from "../src/orchestration.js";
afterEach(() => vi.unstubAllGlobals());
describe("extension page gate", () => {
  for (const url of ["chrome://extensions", "about:blank", "chrome-extension://abc/popup.html", "https://chromewebstore.google.com/detail/abc", "https://chrome.google.com/webstore/detail/a", "invalid"]) it("rejects " + url, () => expect(canCaptureUrl(url)).toBe(false));
  for (const url of ["https://example.com", "http://127.0.0.1:4173", "file:///fixture.html"]) it("accepts " + url, () => expect(canCaptureUrl(url)).toBe(true));
});
describe("orchestration", () => {
  it("injects isolated content script only into the user-active tab and validates response", async () => {
    const query = vi.fn().mockResolvedValue([{ id: 7, url: "https://example.com" }]), inject = vi.fn().mockResolvedValue([]), send = vi.fn().mockResolvedValue({ ok: true, document: simpleTextFixture });
    vi.stubGlobal("chrome", { tabs: { query, sendMessage: send }, scripting: { executeScript: inject } });
    expect(await captureActivePage()).toMatchObject({ schemaVersion: "0.4" });
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(inject).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ["content.js"], world: "ISOLATED" });
    expect(send).toHaveBeenCalledWith(7, { type: "web2design.capture.v1" });
  });
  it("does not inject into restricted pages", async () => {
    const inject = vi.fn(); vi.stubGlobal("chrome", { tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: "chrome://settings" }]) }, scripting: { executeScript: inject } });
    await expect(captureActivePage()).rejects.toThrow("normal"); expect(inject).not.toHaveBeenCalled();
  });
  it("surfaces injection/navigation failures", async () => {
    vi.stubGlobal("chrome", { tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: "https://example.com" }]) }, scripting: { executeScript: vi.fn().mockRejectedValue(new Error("Tab navigated")) } });
    await expect(captureActivePage()).rejects.toThrow("Tab navigated");
  });
  it("rejects invalid/unknown-field document responses using the public validator", () => {
    expect(() => decodeCaptureResponse({ ok: true, document: { ...simpleTextFixture, rawHtml: "<p>bad</p>" } })).toThrow("schema validation");
  });
  it("surfaces content errors and missing results", () => {
    expect(() => decodeCaptureResponse({ ok: false, error: "Page failed" })).toThrow("Page failed");
    expect(() => decodeCaptureResponse(undefined)).toThrow("no capture");
  });
});
it("manifest uses minimal MV3 permissions and references popup with no worker/host access", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  expect(manifest.manifest_version).toBe(3); expect(manifest.permissions).toEqual(["activeTab", "scripting", "clipboardWrite"]);
  expect(manifest.host_permissions).toBeUndefined(); expect(manifest.background).toBeUndefined(); expect(manifest.action.default_popup).toBe("popup.html");
  const html = readFileSync(new URL("../public/popup.html", import.meta.url), "utf8");
  expect(html).toContain('src="popup.js"'); expect(html).not.toMatch(/<script[^>]*>[^<]+<\/script>/);
});
