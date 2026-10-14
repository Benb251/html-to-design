// scripts/spot-check-rich-text.mjs
// Spot-checks real-site rich-text paragraph flow capture and rendering for W2D-016 on representative pages.
// Compares against W2D-010 recorded baselines.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { safeParseDesignDocument } from "../packages/design-schema/dist/index.js";
import { renderDesignDocument, FakeFigmaHost } from "../packages/figma-renderer/dist/index.js";

const TARGETS = [
  {
    id: "docs-02-wikipedia",
    url: "https://en.wikipedia.org/wiki/Responsive_web_design",
    title: "Wikipedia (Responsive web design)",
    w2d010File: "docs/evidence/w2d-010/docs-02-wikipedia.json",
  },
  {
    id: "framework-01-react",
    url: "https://react.dev",
    title: "React Documentation",
    w2d010File: "docs/evidence/w2d-010/framework-01-react.json",
  },
  {
    id: "docs-01-nodejs",
    url: "https://nodejs.org/en",
    title: "Node.js Official Portal",
    w2d010File: "docs/evidence/w2d-010/docs-01-nodejs.json",
  },
  {
    id: "saas-01-hackernews",
    url: "https://news.ycombinator.com",
    title: "Hacker News",
    w2d010File: "docs/evidence/w2d-010/saas-01-hackernews.json",
  },
];

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

let executable;
for (const c of candidates) {
  try {
    await fs.access(c);
    executable = c;
    break;
  } catch {
    /* try next candidate */
  }
}

if (!executable) {
  console.error("Chrome executable not found. Skipping spot check.");
  process.exit(0);
}

async function runSpotCheck() {
  console.log("======================================================");
  console.log(" Web2Design Real-Site Rich Text Spot Check (W2D-016)");
  console.log("======================================================");

  const contentScript = await fs.readFile(path.resolve("apps/extension/dist/content.js"), "utf8");
  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2d-spotcheck-richtext-"));

  const chromeProcess = spawn(
    executable,
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${tempProfileDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let cdpPort;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const portFile = await fs.readFile(path.join(tempProfileDir, "DevToolsActivePort"), "utf8");
      cdpPort = Number(portFile.split("\n")[0]);
      if (cdpPort) break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  if (!cdpPort) {
    chromeProcess.kill();
    throw new Error("Failed to connect to Chrome DevTools port.");
  }

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === "page");
  if (!pageTarget) throw new Error("No page target found.");

  const WebSocket = (await import("ws")).default;
  const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let messageId = 0;
  const pendingRequests = new Map();
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pendingRequests.has(msg.id)) {
      const p = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };

  function sendCommand(method, params = {}) {
    const id = ++messageId;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCommand("Page.enable");
  await sendCommand("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const results = [];
  await fs.mkdir("docs/evidence/w2d-016", { recursive: true });

  try {
    for (const target of TARGETS) {
      console.log(`\nEvaluating: ${target.title} (${target.url})...`);
      try {
        await sendCommand("Page.navigate", { url: target.url });
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (err) {
        console.warn(`  [WARN] Failed to navigate to ${target.url}: ${err.message}`);
        continue;
      }

      // Inject Content Script into Isolated World
      const tree = await sendCommand("Page.getFrameTree");
      const isolated = await sendCommand("Page.createIsolatedWorld", {
        frameId: tree.frameTree.frame.id,
        worldName: "w2d-spotcheck-richtext-world",
      });

      await sendCommand("Runtime.evaluate", {
        expression: `globalThis.chrome = { runtime: { id: "spotcheck-richtext-ext", onMessage: { addListener(fn) { globalThis.smokeHandler = fn; } } } };`,
        contextId: isolated.executionContextId,
      });

      await sendCommand("Runtime.evaluate", {
        expression: contentScript,
        contextId: isolated.executionContextId,
      });

      const capStart = Date.now();
      const captureRes = await sendCommand("Runtime.evaluate", {
        expression: `new Promise(resolve => globalThis.smokeHandler({ type: "web2design.capture.v1" }, { id: "spotcheck-richtext-ext" }, resolve))`,
        contextId: isolated.executionContextId,
        awaitPromise: true,
        returnByValue: true,
      });
      const captureDuration = Date.now() - capStart;

      const capOutput = captureRes.result?.value;
      if (!capOutput || !capOutput.ok || !capOutput.document) {
        console.warn(`  [WARN] Capture failed for ${target.title}`);
        continue;
      }

      const doc = capOutput.document;
      const parseResult = safeParseDesignDocument(doc);
      const isSchemaValid = parseResult.success;

      // Read baseline if present
      let w2d010TextNodeCount = null;
      try {
        const baseContent = await fs.readFile(path.resolve(target.w2d010File), "utf8");
        const baseDoc = JSON.parse(baseContent);
        if (baseDoc.metrics?.nodeCounts?.text !== undefined) {
          w2d010TextNodeCount = baseDoc.metrics.nodeCounts.text;
        } else if (baseDoc.root) {
          let count = 0;
          function countTexts(n) {
            if (n.type === "text") count++;
            if (n.children) n.children.forEach(countTexts);
          }
          countTexts(baseDoc.root);
          w2d010TextNodeCount = count;
        }
      } catch {
        // baseline optional
      }

      // Inspect captured document text nodes & rich runs
      let totalNodes = 0;
      let totalTextNodes = 0;
      let richTextNodes = 0;
      let totalRuns = 0;
      let maxRuns = 0;
      let boldRuns = 0;
      let italicRuns = 0;
      let colorRuns = 0;
      let fontSizeRuns = 0;
      let linkRuns = 0;

      function walk(node) {
        totalNodes++;
        if (node.type === "text") {
          totalTextNodes++;
          if (node.runs && node.runs.length > 0) {
            richTextNodes++;
            totalRuns += node.runs.length;
            if (node.runs.length > maxRuns) maxRuns = node.runs.length;

            for (const r of node.runs) {
              if (r.style.fontWeight && r.style.fontWeight !== 400 && r.style.fontWeight !== "normal") boldRuns++;
              if (r.style.fontStyle === "italic") italicRuns++;
              if (r.style.color) colorRuns++;
              if (r.style.fontSize) fontSizeRuns++;
              if (r.hyperlink) linkRuns++;
            }
          }
        }
        if (node.children) {
          for (const c of node.children) walk(c);
        }
      }
      walk(doc.root);

      // Render with FakeFigmaHost
      const host = new FakeFigmaHost();
      const renderRes = await renderDesignDocument(doc, host);
      const fontFallbackWarnings = renderRes.warnings.filter((w) => w.code === "FONT_FALLBACK");
      const boxStyleWarnings = doc.warnings.filter((w) => w.code === "RICH_TEXT_BOX_STYLE_UNSUPPORTED");
      const splitWarnings = doc.warnings.filter((w) => w.code === "RICH_TEXT_EMBEDDED_NODE_SPLIT");

      const entry = {
        id: target.id,
        title: target.title,
        url: target.url,
        totalNodes,
        totalTextNodes,
        richTextNodes,
        totalRuns,
        maxRuns,
        boldRuns,
        italicRuns,
        colorRuns,
        fontSizeRuns,
        linkRuns,
        w2d010TextNodeCount,
        boxStyleWarnings: boxStyleWarnings.length,
        splitWarnings: splitWarnings.length,
        fontFallbackCount: fontFallbackWarnings.length,
        schemaValidity: isSchemaValid ? "PASS" : "FAIL",
        rendererSuccess: renderRes.rootNodeId ? "PASS" : "FAIL",
        createdNodes: renderRes.createdNodeCount,
        skippedNodes: renderRes.skippedNodeCount,
        captureDuration,
      };

      results.push(entry);
      await fs.writeFile(path.resolve(`docs/evidence/w2d-016/${target.id}.json`), JSON.stringify(doc, null, 2));

      console.log(`  [OK] ${target.title}:`);
      console.log(`       Total Nodes: ${totalNodes}, TextNodes: ${totalTextNodes}, Rich Flows: ${richTextNodes}`);
      console.log(`       Runs: ${totalRuns} (max ${maxRuns}), Bold: ${boldRuns}, Italic: ${italicRuns}, Links: ${linkRuns}`);
      console.log(`       Schema: ${entry.schemaValidity}, Renderer: ${entry.rendererSuccess}, Duration: ${captureDuration}ms`);
      if (w2d010TextNodeCount !== null) {
        console.log(`       W2D-010 Text Nodes: ${w2d010TextNodeCount} -> W2D-016 Text Nodes: ${totalTextNodes}`);
      }
    }
  } finally {
    socket.close();
    chromeProcess.kill();
    await fs.rm(tempProfileDir, { recursive: true, force: true }).catch(() => {});
  }

  await fs.writeFile(path.resolve("docs/evidence/w2d-016/summary.json"), JSON.stringify(results, null, 2));
  console.log("\nSpot check complete. Summary written to docs/evidence/w2d-016/summary.json\n");
}

runSpotCheck().catch((err) => {
  console.error("Spot check error:", err);
  process.exit(1);
});
