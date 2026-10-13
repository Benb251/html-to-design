// scripts/spot-check-clipping.mjs
// Spot-checks real-site container clipping capture for W2D-014 on representative pages.
// Compares against W2D-010 recorded baselines.

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
    title: "React Documentation & Landing",
    w2d010File: "docs/evidence/w2d-010/framework-01-react.json",
    w2d010ClippingCount: 112,
  },
  {
    id: "complex-css-01-tailwind",
    url: "https://tailwindcss.com",
    title: "Tailwind CSS",
    w2d010File: "docs/evidence/w2d-010/complex-css-01-tailwind.json",
    w2d010ClippingCount: 74,
  },
  {
    id: "docs-01-nodejs",
    url: "https://nodejs.org/en",
    title: "Node.js Official Documentation & Portal",
    w2d010File: "docs/evidence/w2d-010/docs-01-nodejs.json",
    w2d010ClippingCount: 42,
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
  console.log(" Web2Design Real-Site Container Clipping Spot Check (W2D-014)");
  console.log("======================================================");

  const contentScript = await fs.readFile(path.resolve("apps/extension/dist/content.js"), "utf8");
  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2d-spotcheck-clipping-"));

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
    { stdio: "ignore", windowsHide: true }
  );

  let cdpPort = 0;
  for (let attempt = 0; attempt < 50; attempt++) {
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

  const summaryResults = [];

  try {
    for (const target of TARGETS) {
      console.log(`\nEvaluating: ${target.title} (${target.url})...`);

      // 1. Navigate
      try {
        const navPromise = sendCommand("Page.navigate", { url: target.url });
        await Promise.race([
          navPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000)),
        ]);
      } catch (err) {
        console.warn(`  Navigation warning/timeout for ${target.id}:`, err.message);
      }

      // Settle
      await new Promise((r) => setTimeout(r, 4000));

      // 2. Count observed clipping elements in DOM
      const domStats = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          let bothAxisHiddenOrClip = 0;
          let singleAxisClip = 0;
          let autoOrScroll = 0;
          let clipMarginCount = 0;
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const cs = window.getComputedStyle(el);
            const ox = cs.overflowX || 'visible';
            const oy = cs.overflowY || 'visible';
            const cx = ox === 'hidden' || ox === 'clip';
            const cy = oy === 'hidden' || oy === 'clip';
            if (cx && cy) bothAxisHiddenOrClip++;
            else if (cx || cy) singleAxisClip++;
            if (ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll') autoOrScroll++;
            if ((cx || cy) && cs.overflowClipMargin && cs.overflowClipMargin !== '0px' && cs.overflowClipMargin !== 'normal' && cs.overflowClipMargin !== 'content-box') {
              clipMarginCount++;
            }
          }
          return { bothAxisHiddenOrClip, singleAxisClip, autoOrScroll, clipMarginCount, totalObserved: bothAxisHiddenOrClip + singleAxisClip };
        })()`,
        returnByValue: true,
      });

      const observed = domStats.result.value || { bothAxisHiddenOrClip: 0, singleAxisClip: 0, autoOrScroll: 0, clipMarginCount: 0, totalObserved: 0 };
      console.log(`  DOM observed clipping elements: ${observed.totalObserved} (both-axis: ${observed.bothAxisHiddenOrClip}, single-axis: ${observed.singleAxisClip}, auto/scroll: ${observed.autoOrScroll}, non-default clip-margin: ${observed.clipMarginCount})`);

      // 3. Inject bundle & capture
      const tree = await sendCommand("Page.getFrameTree");
      const isolated = await sendCommand("Page.createIsolatedWorld", {
        frameId: tree.frameTree.frame.id,
        worldName: "w2d-spotcheck-clipping-world",
      });

      await sendCommand("Runtime.evaluate", {
        expression: `globalThis.chrome = { runtime: { id: "spotcheck-clipping-ext", onMessage: { addListener(fn) { globalThis.smokeHandler = fn; } } } };`,
        contextId: isolated.executionContextId,
      });

      await sendCommand("Runtime.evaluate", {
        expression: contentScript,
        contextId: isolated.executionContextId,
      });

      const capStart = Date.now();
      const captureRes = await sendCommand("Runtime.evaluate", {
        expression: `new Promise(resolve => globalThis.smokeHandler({ type: "web2design.capture.v1" }, { id: "spotcheck-clipping-ext" }, resolve))`,
        contextId: isolated.executionContextId,
        awaitPromise: true,
        returnByValue: true,
      });
      const captureDurationMs = Date.now() - capStart;

      const capOutput = captureRes.result.value;
      if (!capOutput || !capOutput.ok) {
        console.error("  Capture failed for", target.id);
        continue;
      }

      const doc = capOutput.document;
      const parseRes = safeParseDesignDocument(doc);
      console.log(`  Schema valid: ${parseRes.success ? "YES (V0.4)" : "NO"} | Wire version: ${doc.schemaVersion} | Capture time: ${captureDurationMs}ms`);

      function flatten(node) {
        return [node, ...(node.children || []).flatMap(flatten)];
      }
      const allNodes = flatten(doc.root);

      let bothAxisSchemaClips = 0;
      let singleAxisSchemaClips = 0;

      for (const n of allNodes) {
        if (n.type === "frame" && n.clip) {
          if (n.clip.x && n.clip.y) bothAxisSchemaClips++;
          else if (n.clip.x || n.clip.y) singleAxisSchemaClips++;
        }
      }

      console.log(`  Total design nodes: ${allNodes.length}`);
      console.log(`  Captured schema clipping frames: ${bothAxisSchemaClips + singleAxisSchemaClips} (both-axis exact: ${bothAxisSchemaClips}, single-axis: ${singleAxisSchemaClips})`);

      // 4. Render through FakeFigmaHost
      const host = new FakeFigmaHost();
      const renderRes = await renderDesignDocument(doc, host);
      console.log(`  Renderer success: ${renderRes.createdNodeCount > 0 ? "PASS" : "FAIL"} (${renderRes.createdNodeCount} created nodes, ${renderRes.skippedNodeCount} skipped)`);

      function countFigmaClips(node) {
        let clips = 0;
        if (node.type === "FRAME" && node.clipsContent) clips++;
        for (const child of node.children || []) {
          clips += countFigmaClips(child);
        }
        return clips;
      }

      let nativeFigmaClips = 0;
      for (const root of host.roots) {
        nativeFigmaClips += countFigmaClips(root);
      }
      console.log(`  Native Figma FrameNode.clipsContent: ${nativeFigmaClips}`);

      const axisApproxWarnings = renderRes.warnings.filter((w) => w.code === "AXIS_CLIP_APPROXIMATED").length;
      const scrollDeferredWarnings = doc.warnings?.filter((w) => w.code === "SCROLL_CONTAINER_CLIPPING_DEFERRED").length ?? 0;
      const clipMarginWarnings = doc.warnings?.filter((w) => w.code === "OVERFLOW_CLIP_MARGIN_UNSUPPORTED").length ?? 0;

      console.log(`  Warnings: AXIS_CLIP_APPROXIMATED: ${axisApproxWarnings}`);
      console.log(`            SCROLL_CONTAINER_CLIPPING_DEFERRED: ${scrollDeferredWarnings}`);
      console.log(`            OVERFLOW_CLIP_MARGIN_UNSUPPORTED: ${clipMarginWarnings}`);

      summaryResults.push({
        id: target.id,
        title: target.title,
        url: target.url,
        w2d010ClippingCount: target.w2d010ClippingCount,
        domObserved: observed,
        totalNodes: allNodes.length,
        bothAxisSchemaClips,
        singleAxisSchemaClips,
        nativeFigmaClips,
        createdNodes: renderRes.createdNodeCount,
        skippedNodes: renderRes.skippedNodeCount,
        captureDurationMs,
        schemaValid: parseRes.success,
        wireVersion: doc.schemaVersion,
        rendererSuccess: renderRes.createdNodeCount > 0,
        warnings: {
          axisApproxWarnings,
          scrollDeferredWarnings,
          clipMarginWarnings,
        },
      });
    }

    console.log("\n======================================================");
    console.log(" Real-Site Spot Check Summary Table (W2D-014 vs W2D-010)");
    console.log("======================================================");
    console.table(
      summaryResults.map((r) => ({
        Site: r.title,
        "W2D-010 Clips": r.w2d010ClippingCount,
        "DOM Both-Axis": r.domObserved.bothAxisHiddenOrClip,
        "DOM Single-Axis": r.domObserved.singleAxisClip,
        "DOM Scroll": r.domObserved.autoOrScroll,
        "Schema Clips": r.bothAxisSchemaClips + r.singleAxisSchemaClips,
        "Figma clipsContent": r.nativeFigmaClips,
        "Axis Approx Warn": r.warnings.axisApproxWarnings,
        "Scroll Warn": r.warnings.scrollDeferredWarnings,
        "Nodes": r.totalNodes,
        "Cap(ms)": r.captureDurationMs,
      }))
    );

    const outDir = path.resolve("docs/evidence/w2d-014");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(
      path.join(outDir, "real-site-clipping-spotcheck.json"),
      JSON.stringify(summaryResults, null, 2) + "\n"
    );
    console.log(`\nEvidence written to docs/evidence/w2d-014/real-site-clipping-spotcheck.json`);
  } finally {
    socket.close();
    chromeProcess.kill();
  }
}

runSpotCheck().catch((err) => {
  console.error("Spot check failed:", err);
  process.exit(1);
});
