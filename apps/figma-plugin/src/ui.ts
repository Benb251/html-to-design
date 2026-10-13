import type { DocumentSummary, PluginToUiMessage, UiToPluginMessage } from "./messages.js";
import type { ValidationIssue } from "@web2design/design-schema";

function elem<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error("Missing UI element: " + id);
  return el as T;
}

const SAMPLE_DOCUMENT = {
  schemaVersion: "0.1",
  capture: {
    capturedAt: "2026-10-13T12:00:00.000Z",
    source: { kind: "chrome-extension", name: "Web2Design", version: "0.1.0" },
    page: { url: "https://example.com/demo", title: "Web2Design Demo Page" },
  },
  viewport: { width: 1440, height: 900, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
  root: {
    id: "root",
    type: "frame",
    sourceTag: "html",
    name: "Web2Design Demo Page",
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
    visible: true,
    opacity: 1,
    children: [
      {
        id: "w2d-element-body",
        type: "frame",
        sourceTag: "body",
        name: "body",
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
        visible: true,
        opacity: 1,
        children: [
          {
            id: "w2d-text-1",
            type: "text",
            sourceTag: "h1",
            name: "Text",
            x: 48,
            y: 48,
            width: 380,
            height: 40,
            visible: true,
            opacity: 1,
            children: [],
            characters: "Web2Design V0.1 Sample",
            textStyle: {
              fontFamily: "Inter",
              fontFallbacks: ["sans-serif"],
              fontSize: 32,
              fontWeight: 700,
              fontStyle: "normal",
              lineHeight: 40,
              letterSpacing: 0,
              textAlign: "start",
              color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
            },
          },
          {
            id: "w2d-image-1",
            type: "image",
            sourceTag: "img",
            name: "img",
            x: 48,
            y: 110,
            width: 320,
            height: 180,
            visible: true,
            opacity: 1,
            children: [],
            assetId: "asset-image-1",
            fit: "cover",
          },
          {
            id: "w2d-svg-1",
            type: "svg",
            sourceTag: "svg",
            name: "svg",
            x: 48,
            y: 310,
            width: 48,
            height: 48,
            visible: true,
            opacity: 1,
            children: [],
            inlineSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgb(24, 160, 251)"/></svg>',
            assetId: "asset-svg-1",
          },
        ],
      },
    ],
  },
  assets: [
    {
      id: "asset-image-1",
      kind: "image",
      source: { type: "url", url: "https://example.com/demo.png" },
      contentHash: "url:demo-image-1",
      mimeType: "image/png",
      intrinsicDimensions: { width: 640, height: 360 },
    },
    {
      id: "asset-svg-1",
      kind: "svg",
      source: {
        type: "data-url",
        dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgb(24, 160, 251)"/></svg>',
      },
      contentHash: "svg:demo-circle",
      mimeType: "image/svg+xml",
      intrinsicDimensions: { width: 24, height: 24 },
    },
  ],
  warnings: [
    { code: "CAPTURE_SCOPE", message: "W2D-005: rendered light-DOM boxes, text, styles, images and inline SVG." },
  ],
};

function postToPlugin(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

export function initUi(): void {
  const jsonInput = elem<HTMLTextAreaElement>("json-input");
  const fileInput = elem<HTMLInputElement>("file-input");
  const validateBtn = elem<HTMLButtonElement>("validate-btn");
  const sampleBtn = elem<HTMLButtonElement>("sample-btn");
  const clearBtn = elem<HTMLButtonElement>("clear-btn");
  const statusBar = elem<HTMLElement>("status-bar");
  const statusText = elem<HTMLElement>("status-text");
  const summarySection = elem<HTMLElement>("summary-section");
  const errorSection = elem<HTMLElement>("error-section");
  const errorMessage = elem<HTMLElement>("error-message");
  const issuesList = elem<HTMLElement>("issues-list");

  function setStatus(status: "waiting" | "validating" | "ready" | "error", text: string): void {
    statusBar.className = `status-bar status-${status}`;
    statusText.textContent = text;
  }

  function clearState(): void {
    jsonInput.value = "";
    if (fileInput) fileInput.value = "";
    summarySection.classList.add("hidden");
    errorSection.classList.add("hidden");
    setStatus("waiting", "Waiting for document input");
  }

  function renderSummary(summary: DocumentSummary): void {
    errorSection.classList.add("hidden");
    summarySection.classList.remove("hidden");
    setStatus("ready", `Ready for import (${summary.totalNodes} nodes, ${summary.assetCount} assets)`);

    elem("summary-schema-version").textContent = `Schema ${summary.schemaVersion}`;
    elem("summary-page-title").textContent = summary.pageTitle || summary.pageUrl || "—";
    elem("summary-viewport").textContent = `${summary.viewport.width} × ${summary.viewport.height}`;
    elem("summary-captured-at").textContent = summary.capturedAt ? summary.capturedAt.slice(0, 19).replace("T", " ") : "—";
    elem("summary-source-kind").textContent = summary.sourceKind || "—";

    elem("stat-total-nodes").textContent = String(summary.totalNodes);
    elem("stat-frames").textContent = String(summary.nodeCounts.frame);
    elem("stat-text").textContent = String(summary.nodeCounts.text);
    elem("stat-rectangles").textContent = String(summary.nodeCounts.rectangle);
    elem("stat-images").textContent = String(summary.nodeCounts.image);
    elem("stat-svgs").textContent = String(summary.nodeCounts.svg);
    elem("stat-assets").textContent = String(summary.assetCount);
    elem("stat-warnings").textContent = String(summary.warningCount);
  }

  function renderError(message: string, issues: ValidationIssue[]): void {
    summarySection.classList.add("hidden");
    errorSection.classList.remove("hidden");
    setStatus("error", message);

    errorMessage.textContent = message;
    issuesList.innerHTML = "";
    for (const issue of issues) {
      const div = document.createElement("div");
      div.className = "issue-item";
      const pathStr = issue.path.length ? `[${issue.path.join(".")}] ` : "";
      div.textContent = `${pathStr}${issue.message} (${issue.code})`;
      issuesList.appendChild(div);
    }
  }

  function handleValidate(): void {
    const rawText = jsonInput.value.trim();
    if (!rawText) {
      renderError("Input is empty. Paste a Web2Design JSON document.", []);
      return;
    }
    setStatus("validating", "Sending to plugin main for validation...");
    postToPlugin({ type: "validate-document", raw: rawText });
  }

  validateBtn.addEventListener("click", handleValidate);
  clearBtn.addEventListener("click", clearState);

  sampleBtn.addEventListener("click", () => {
    jsonInput.value = JSON.stringify(SAMPLE_DOCUMENT, null, 2);
    handleValidate();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === "string") {
        jsonInput.value = content;
        handleValidate();
      }
    };
    reader.onerror = () => {
      renderError("Failed to read local file", []);
    };
    reader.readAsText(file);
  });

  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data?.pluginMessage as PluginToUiMessage | undefined;
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;

    if (msg.type === "validation-success") {
      renderSummary(msg.summary);
    } else if (msg.type === "validation-error") {
      renderError(msg.error.message, msg.error.issues);
    }
  });
}

if (typeof document !== "undefined") {
  initUi();
}
