import { safeParseDesignDocument, type DesignDocument } from "@web2design/design-schema";
export function canCaptureUrl(url: string): boolean {
  try {
    const page = new URL(url);
    return ["http:", "https:", "file:"].includes(page.protocol) &&
      !((page.hostname === "chromewebstore.google.com") || (page.hostname === "chrome.google.com" && page.pathname.startsWith("/webstore")));
  } catch { return false; }
}
export function decodeCaptureResponse(response: unknown): DesignDocument {
  if (!response || typeof response !== "object" || !("ok" in response)) throw new Error("The page returned no capture result.");
  if (response.ok !== true) {
    throw new Error("error" in response && typeof response.error === "string" ? response.error : "Page capture failed.");
  }
  const result = safeParseDesignDocument("document" in response ? response.document : undefined);
  if (!result.success) {
    const issue = result.issues[0];
    throw new Error("Capture failed schema validation: " + (issue ? issue.path.join(".") + ": " + issue.message : "invalid document"));
  }
  return result.data;
}
export async function captureActivePage(): Promise<DesignDocument> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !canCaptureUrl(tab.url ?? "")) throw new Error("Open a normal HTTP(S) page. Chrome internal pages and the Chrome Web Store cannot be captured.");
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"], world: "ISOLATED" });
    return decodeCaptureResponse(await chrome.tabs.sendMessage(tab.id, { type: "web2design.capture.v1" }));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message + " For file pages, enable Allow access to file URLs; otherwise use the local HTTP fixture." : "Unable to access this page.", { cause: error });
  }
}
