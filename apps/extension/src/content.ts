import { captureDocument } from "@web2design/capture-engine";
const scope = globalThis as typeof globalThis & { __web2designCaptureV1?: boolean };
// Programmatic injection is idempotent in Chrome's isolated world.
if (!scope.__web2designCaptureV1) {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== "object" || !("type" in message) || message.type !== "web2design.capture.v1") return;
    try { sendResponse({ ok: true, document: captureDocument(document) }); }
    catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : "Capture failed." }); }
  });
  scope.__web2designCaptureV1 = true;
}
