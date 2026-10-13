// scripts/spot-check-pseudo.mjs
// Spot-checks real-site pseudo-element capture for W2D-011 on representative pages.
// Compares against W2D-010 recorded baselines.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { safeParseDesignDocument } from "../packages/design-schema/dist/index.js";
import { renderDesignDocument, FakeFigmaHost } from "../packages/figma-renderer/dist/index.js";

const TARGETS = [
  {
    id: "ecommerce-01-books",
    url: "https://books.toscrape.com",
    title: "Books to Scrape",
    w2d010File: "docs/evidence/w2d-010/ecommerce-01-books.json",
  },
  {
    id: "docs-02-wikipedia",
    url: "https://en.wikipedia.org/wiki/Figma",
    title: "Wikipedia (Figma)",
    w2d010File: "docs/evidence/w2d-010/docs-02-wikipedia.json",
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
  console.log(" Web2Design Real-Site Pseudo Spot Check (W2D-011)");
  console.log("======================================================");

  const contentScript = await fs.readFile(path.resolve("apps/extension/dist/content.js"), "utf8");
  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2d-spotcheck-chrome-"));

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

  const results = [];

  try {
    for (const target of TARGETS) {
      console.log(`\nEvaluating: ${target.title} (${target.url})...`);

      // 1. Navigate
      const navPromise = sendCommand("Page.navigate", { url: target.url });
      await Promise.race([
        navPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000)),
      ]);

      // Settle
      await new Promise((r) => setTimeout(r, 2500));

      // 2. Count observed pseudo elements in DOM
      const domStats = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          let beforeCount = 0, afterCount = 0, meaningful = 0;
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const b = window.getComputedStyle(el, '::before');
            if (b && b.content && b.content !== 'none' && b.content !== 'normal') {
              beforeCount++;
              if (b.display !== 'none' && b.visibility !== 'hidden') meaningful++;
            }
            const a = window.getComputedStyle(el, '::after');
            if (a && a.content && a.content !== 'none' && a.content !== 'normal') {
              afterCount++;
              if (a.display !== 'none' && a.visibility !== 'hidden') meaningful++;
            }
          }
          return { beforeCount, afterCount, totalObserved: beforeCount + afterCount, meaningful };
        })()`,
        returnByValue: true,
      });

      const observed = domStats.result.value || { beforeCount: 0, afterCount: 0, totalObserved: 0, meaningful: 0 };
      console.log(`  DOM observed pseudo-elements: ${observed.totalObserved} (meaningful: ${observed.meaningful})`);

      // 3. Inject bundle & capture
      const tree = await sendCommand("Page.getFrameTree");
      const isolated = await sendCommand("Page.createIsolatedWorld", {
        frameId: tree.frameTree.frame.id,
        worldName: "w2d-spotcheck-world",
      });

      await sendCommand("Runtime.evaluate", {
        expression: `globalThis.chrome = { runtime: { id: "spotcheck-ext", onMessage: { addListener(fn) { globalThis.smokeHandler = fn; } } } };`,
        contextId: isolated.executionContextId,
      });

      await sendCommand("Runtime.evaluate", {
        expression: contentScript,
        contextId: isolated.executionContextId,
      });

      const captureRes = await sendCommand("Runtime.evaluate", {
        expression: `new Promise(resolve => globalThis.smokeHandler({ type: "web2design.capture.v1" }, { id: "spotcheck-ext" }, resolve))`,
        contextId: isolated.executionContextId,
        awaitPromise: true,
        returnByValue: true,
      });

      const capOutput = captureRes.result.value;
      if (!capOutput || !capOutput.ok) {
        console.error("  Capture failed for", target.id);
        continue;
      }

      const doc = capOutput.document;
      const parseRes = safeParseDesignDocument(doc);
      console.log(`  Schema valid: ${parseRes.success ? "YES" : "NO"}`);

      // Count synthetic pseudo nodes
      function flatten(node) {
        return [node, ...(node.children || []).flatMap(flatten)];
      }
      const allNodes = flatten(doc.root);
      const pseudoNodes = allNodes.filter((n) =>
        n.sourceTag === "::before" ||
        n.sourceTag === "::after" ||
        n.id.includes("::before") ||
        n.id.includes("::after")
      );

      const pseudoTexts = pseudoNodes.filter((n) => n.type === "text");
      const pseudoRects = pseudoNodes.filter((n) => n.type === "rectangle");
      const pseudoFrames = pseudoNodes.filter((n) => n.type === "frame");

      console.log(`  Total design nodes: ${allNodes.length}`);
      console.log(`  Synthesized pseudo nodes: ${pseudoNodes.length} (texts: ${pseudoTexts.length}, rects: ${pseudoRects.length}, frames: ${pseudoFrames.length})`);

      // 4. Render through FakeFigmaHost
      const host = new FakeFigmaHost();
      const renderRes = await renderDesignDocument(doc, host);
      const renderSuccess = Boolean(renderRes.rootNodeId && host.roots.length > 0);
      console.log(`  Renderer success: ${renderSuccess ? "YES" : "NO"} (created nodes: ${renderRes.createdNodeCount})`);

      // 5. Compare with W2D-010 baseline
      let w2d010Baseline = null;
      try {
        const baselineJson = JSON.parse(await fs.readFile(path.resolve(target.w2d010File), "utf8"));
        w2d010Baseline = baselineJson;
      } catch {
        /* no baseline file */
      }

      const baselineNodes = w2d010Baseline?.metrics?.totalNodes ?? 0;
      const nodeDelta = allNodes.length - baselineNodes;
      console.log(`  W2D-010 node count: ${baselineNodes} -> W2D-011 node count: ${allNodes.length} (delta: ${nodeDelta > 0 ? "+" : ""}${nodeDelta})`);

      const pseudoWarnings = doc.warnings.filter((w) =>
        w.code.startsWith("PSEUDO_")
      );
      console.log(`  Pseudo warnings count: ${pseudoWarnings.length}`);

      results.push({
        siteId: target.id,
        url: target.url,
        title: target.title,
        domObservedPseudos: observed.totalObserved,
        meaningfulPseudos: observed.meaningful,
        synthesizedPseudoNodes: pseudoNodes.length,
        breakdown: {
          text: pseudoTexts.length,
          rectangle: pseudoRects.length,
          frame: pseudoFrames.length,
        },
        schemaValid: parseRes.success,
        rendererSuccess: renderSuccess,
        w2d010Nodes: baselineNodes,
        w2d011Nodes: allNodes.length,
        nodeDelta,
        pseudoWarnings: pseudoWarnings.map((w) => ({ code: w.code, message: w.message })),
      });
    }

    console.log("\n======================================================");
    console.log(" Spot Check Summary Table:");
    console.log("======================================================");
    console.table(
      results.map((r) => ({
        Site: r.siteId,
        "DOM Observed": r.domObservedPseudos,
        "Meaningful": r.meaningfulPseudos,
        "Synthesized Nodes": r.synthesizedPseudoNodes,
        "W2D-010 Nodes": r.w2d010Nodes,
        "W2D-011 Nodes": r.w2d011Nodes,
        "Delta": `${r.nodeDelta >= 0 ? "+" : ""}${r.nodeDelta}`,
        "Schema Valid": r.schemaValid ? "YES" : "NO",
        "Rend OK": r.rendererSuccess ? "YES" : "NO",
      }))
    );

    const outPath = path.resolve("docs/evidence/w2d-011-spot-check.json");
    await fs.writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
    console.log(`\nSpot check details saved to: ${outPath}`);
  } finally {
    socket.close();
    chromeProcess.kill();
  }
}

runSpotCheck().catch((err) => {
  console.error("Spot check error:", err);
  process.exit(1);
});
