import { serializeCapture, countNodes, captureFilename } from "@web2design/capture-engine";
import { captureActivePage } from "./orchestration.js";

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing popup element: " + id);
  return element as T;
}
const capture = required<HTMLButtonElement>("capture"), copy = required<HTMLButtonElement>("copy"), download = required<HTMLButtonElement>("download");
const status = required("status"), details = required("details"), page = required("page"), output = required<HTMLTextAreaElement>("json");
let current: { json: string; filename: string } | undefined;
function message(text: string) { status.textContent = text; }
function clear() { current = undefined; output.value = ""; output.hidden = true; details.textContent = ""; copy.disabled = true; download.disabled = true; }
void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  try { page.textContent = tab?.url ? new URL(tab.url).hostname || "Local page" : "Unavailable"; }
  catch { page.textContent = "Unavailable"; }
}).catch(() => { page.textContent = "Unavailable"; });
capture.addEventListener("click", async () => {
  clear(); capture.disabled = true; message("Capturing");
  try {
    const document = await captureActivePage();
    const json = serializeCapture(document);
    current = { json, filename: captureFilename(document.capture.page?.url ?? "https://page.invalid", document.capture.capturedAt) };
    output.value = json; output.hidden = false;
    details.textContent = "Nodes: " + countNodes(document.root) + " · Assets: " + document.assets.length + " · Warnings: " + (document.warnings?.length ?? 0);
    copy.disabled = false; download.disabled = false; message("Success");
  } catch (error) { message("Error: " + (error instanceof Error ? error.message : "Capture failed.")); }
  finally { capture.disabled = false; }
});
copy.addEventListener("click", async () => {
  if (!current) return;
  try { await navigator.clipboard.writeText(current.json); message("Success — JSON copied"); }
  catch { message("Error: clipboard write failed. Select the JSON below and copy it manually."); }
});
download.addEventListener("click", () => {
  if (!current) return;
  try {
    const url = URL.createObjectURL(new Blob([current.json], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = current.filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message("Success — JSON download requested");
  } catch { message("Error: download could not be started."); }
});
