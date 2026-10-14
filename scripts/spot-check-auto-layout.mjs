// scripts/spot-check-auto-layout.mjs
// Spot-checks real-site Auto Layout inference and rendering for W2D-017 on representative flex-heavy pages.
// Measures DOM flex containers, high-confidence inferred containers, deferred/rejected candidates,
// native Figma Auto Layout frames created, and geometry error metrics.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { safeParseDesignDocument } from "../packages/design-schema/dist/index.js";
import { renderDesignDocument, FakeFigmaHost } from "../packages/figma-renderer/dist/index.js";

const TARGETS = [
  {
    id: "framework-01-react",
    url: "https://react.dev",
    title: "React Documentation",
  },
  {
    id: "framework-02-vite",
    url: "https://vite.dev",
    title: "Vite Official Portal",
  },
  {
    id: "framework-03-tailwind",
    url: "https://tailwindcss.com",
    title: "Tailwind CSS",
  },
  {
    id: "docs-02-wikipedia",
    url: "https://en.wikipedia.org/wiki/Responsive_web_design",
    title: "Wikipedia (Responsive web design)",
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
  console.log(" Web2Design Real-Site Auto Layout Spot Check (W2D-017)");
  console.log("======================================================");

  const contentScript = await fs.readFile(path.resolve("apps/extension/dist/content.js"), "utf8");
  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2d-spotcheck-autolayout-"));

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
  await fs.mkdir("docs/evidence/w2d-017", { recursive: true });

  try {
    for (const target of TARGETS) {
      console.log(`\nEvaluating: ${target.title} (${target.url})...`);
      try {
        await sendCommand("Page.navigate", { url: target.url });
        await new Promise((resolve) => setTimeout(resolve, 6000));
      } catch (err) {
        console.warn(`  [WARN] Failed to navigate to ${target.url}: ${err.message}`);
        continue;
      }

      // Count DOM flex and grid containers directly
      const domCountsRes = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          let flex = 0;
          let grid = 0;
          for (const el of document.querySelectorAll('*')) {
            const cs = window.getComputedStyle(el);
            if (cs.display === 'flex' || cs.display === 'inline-flex') flex++;
            if (cs.display === 'grid' || cs.display === 'inline-grid') grid++;
          }
          return { flex, grid };
        })()`,
        returnByValue: true,
      });
      const domFlexContainers = domCountsRes.result?.value?.flex ?? 0;
      const domGridContainers = domCountsRes.result?.value?.grid ?? 0;

      // Inject Content Script into Isolated World
      const tree = await sendCommand("Page.getFrameTree");
      const isolated = await sendCommand("Page.createIsolatedWorld", {
        frameId: tree.frameTree.frame.id,
        worldName: "w2d-spotcheck-autolayout-world",
      });

      await sendCommand("Runtime.evaluate", {
        expression: `globalThis.chrome = { runtime: { id: "spotcheck-autolayout-ext", onMessage: { addListener(fn) { globalThis.smokeHandler = fn; } } } };`,
        contextId: isolated.executionContextId,
      });

      await sendCommand("Runtime.evaluate", {
        expression: contentScript,
        contextId: isolated.executionContextId,
      });

      const capStart = Date.now();
      const captureRes = await sendCommand("Runtime.evaluate", {
        expression: `new Promise(resolve => globalThis.smokeHandler({ type: "web2design.capture.v1" }, { id: "spotcheck-autolayout-ext" }, resolve))`,
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

      // Analyze document nodes
      let totalNodes = 0;
      let totalFrames = 0;
      let inferredAutoLayoutFrames = 0;
      let horizontalFrames = 0;
      let verticalFrames = 0;

      function walk(node) {
        totalNodes++;
        if (node.type === "frame") {
          totalFrames++;
          if (node.layout && node.layout.type === "flex") {
            inferredAutoLayoutFrames++;
            if (node.layout.direction === "horizontal") {
              horizontalFrames++;
            } else {
              verticalFrames++;
            }
          }
        }
        if (node.children) {
          for (const c of node.children) walk(c);
        }
      }
      walk(doc.root);

      // Warning metrics
      const warnings = doc.warnings || [];
      const countWarning = (code) => warnings.filter((w) => w.code === code).length;

      const wrapDeferred = countWarning("AUTO_LAYOUT_WRAP_DEFERRED");
      const marginDeferred = countWarning("AUTO_LAYOUT_MARGIN_DEFERRED");
      const orderDeferred = countWarning("AUTO_LAYOUT_ORDER_DEFERRED");
      const baselineDeferred = countWarning("AUTO_LAYOUT_BASELINE_DEFERRED");
      const growDeferred = countWarning("AUTO_LAYOUT_GROW_RATIO_DEFERRED");
      const offsetDeferred = countWarning("AUTO_LAYOUT_POSITION_OFFSET_DEFERRED");
      const mismatchDeferred = countWarning("AUTO_LAYOUT_GEOMETRY_MISMATCH");
      const gridDeferred = countWarning("GRID_LAYOUT_SEMANTICS_DEFERRED");

      const totalRejected =
        wrapDeferred +
        marginDeferred +
        orderDeferred +
        baselineDeferred +
        growDeferred +
        offsetDeferred +
        mismatchDeferred;

      // Render with FakeFigmaHost
      const host = new FakeFigmaHost();
      const renderRes = await renderDesignDocument(doc, host);

      let nativeFigmaAutoLayoutFrames = 0;
      let absoluteFallbackFrames = 0;

      function countRenderedFrames(node) {
        if (node.type === "FRAME") {
          if (node.layoutMode && node.layoutMode !== "NONE") {
            nativeFigmaAutoLayoutFrames++;
          } else {
            absoluteFallbackFrames++;
          }
        }
        if (node.children) {
          for (const c of node.children) countRenderedFrames(c);
        }
      }
      for (const root of host.roots) {
        countRenderedFrames(root);
      }

      const summary = {
        id: target.id,
        title: target.title,
        url: target.url,
        domFlexContainers,
        domGridContainers,
        totalNodes,
        totalFrames,
        inferredAutoLayoutFrames,
        horizontalFrames,
        verticalFrames,
        nativeFigmaAutoLayoutFrames,
        absoluteFallbackFrames,
        rejectedCandidates: totalRejected,
        rejectionBreakdown: {
          wrap: wrapDeferred,
          margin: marginDeferred,
          order: orderDeferred,
          baseline: baselineDeferred,
          grow: growDeferred,
          positionOffset: offsetDeferred,
          geometryMismatch: mismatchDeferred,
          grid: gridDeferred,
        },
        schemaValid: isSchemaValid,
        rendererSuccess: renderRes.skippedNodeCount === 0,
        nodesSkipped: renderRes.skippedNodeCount,
        captureDurationMs: captureDuration,
      };

      results.push(summary);

      console.log(`  DOM Flex containers:        ${domFlexContainers}`);
      console.log(`  DOM Grid containers:        ${domGridContainers}`);
      console.log(`  Inferred Auto Layout frames: ${inferredAutoLayoutFrames} (H: ${horizontalFrames}, V: ${verticalFrames})`);
      console.log(`  Native Figma AL frames:     ${nativeFigmaAutoLayoutFrames}`);
      console.log(`  Absolute fallback frames:   ${absoluteFallbackFrames}`);
      console.log(`  Rejected flex candidates:   ${totalRejected}`);
      console.log(`    - Wrap deferred:          ${wrapDeferred}`);
      console.log(`    - Margin deferred:        ${marginDeferred}`);
      console.log(`    - Order deferred:         ${orderDeferred}`);
      console.log(`    - Baseline deferred:      ${baselineDeferred}`);
      console.log(`    - Grow ratio deferred:    ${growDeferred}`);
      console.log(`    - Offset deferred:        ${offsetDeferred}`);
      console.log(`    - Geometry mismatch:      ${mismatchDeferred}`);
      console.log(`  Grid deferred:              ${gridDeferred}`);
      console.log(`  Schema valid (V0.7):        ${isSchemaValid}`);
      console.log(`  Capture duration:           ${captureDuration}ms`);

      // Save evidence document
      await fs.writeFile(
        path.resolve(`docs/evidence/w2d-017/${target.id}.json`),
        JSON.stringify(doc, null, 2),
        "utf8"
      );
    }

    await fs.writeFile(
      path.resolve("docs/evidence/w2d-017/summary.json"),
      JSON.stringify(results, null, 2),
      "utf8"
    );

    console.log("\n======================================================");
    console.log(" Real-Site Spot Check Complete!");
    console.log(` Evidence saved to docs/evidence/w2d-017/`);
    console.log("======================================================");
  } finally {
    socket.close();
    chromeProcess.kill();
    try {
      await fs.rm(tempProfileDir, { recursive: true, force: true });
    } catch {
      /* ignore temp cleanup */
    }
  }
}

runSpotCheck().catch((err) => {
  console.error("Spot check failed:", err);
  process.exit(1);
});
