// scripts/spot-check-gradients.mjs
// Spot-checks real-site gradient fill capture for W2D-012 on representative pages.
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
  },
  {
    id: "complex-css-01-tailwind",
    url: "https://tailwindcss.com",
    title: "Tailwind CSS",
    w2d010File: "docs/evidence/w2d-010/complex-css-01-tailwind.json",
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
  console.log(" Web2Design Real-Site Gradient Spot Check (W2D-012)");
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

  const summaryResults = [];

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
      await new Promise((r) => setTimeout(r, 3000));

      // 2. Count observed gradient elements in DOM
      const domStats = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          let linearCount = 0, radialCount = 0, conicCount = 0, repeatingCount = 0;
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const bg = window.getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none') {
              if (bg.includes('linear-gradient(') && !bg.includes('repeating-linear-gradient(')) linearCount++;
              if (bg.includes('radial-gradient(') && !bg.includes('repeating-radial-gradient(')) radialCount++;
              if (bg.includes('conic-gradient(')) conicCount++;
              if (bg.includes('repeating-')) repeatingCount++;
            }
          }
          return { linearCount, radialCount, conicCount, repeatingCount, totalObserved: linearCount + radialCount + conicCount + repeatingCount };
        })()`,
        returnByValue: true,
      });

      const observed = domStats.result.value || { linearCount: 0, radialCount: 0, conicCount: 0, repeatingCount: 0, totalObserved: 0 };
      console.log(`  DOM observed gradient elements: ${observed.totalObserved} (linear: ${observed.linearCount}, radial: ${observed.radialCount}, conic: ${observed.conicCount}, repeating: ${observed.repeatingCount})`);

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

      const capStart = Date.now();
      const captureRes = await sendCommand("Runtime.evaluate", {
        expression: `new Promise(resolve => globalThis.smokeHandler({ type: "web2design.capture.v1" }, { id: "spotcheck-ext" }, resolve))`,
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
      console.log(`  Schema valid: ${parseRes.success ? "YES (V0.2)" : "NO"} | Wire version: ${doc.schemaVersion}`);

      function flatten(node) {
        return [node, ...(node.children || []).flatMap(flatten)];
      }
      const allNodes = flatten(doc.root);

      let linearFills = 0;
      let radialFills = 0;
      let elementsWithGradients = 0;

      for (const n of allNodes) {
        const fills = n.style?.fills || [];
        let hasGrad = false;
        for (const f of fills) {
          if (f.type === "linear-gradient") {
            linearFills++;
            hasGrad = true;
          } else if (f.type === "radial-gradient") {
            radialFills++;
            hasGrad = true;
          }
        }
        if (hasGrad) elementsWithGradients++;
      }

      console.log(`  Total design nodes: ${allNodes.length}`);
      console.log(`  Captured gradient elements: ${elementsWithGradients} (linear fills: ${linearFills}, radial fills: ${radialFills})`);

      // Read W2D-010 baseline
      let w2d010Data = null;
      try {
        const raw = await fs.readFile(path.resolve(target.w2d010File), "utf8");
        w2d010Data = JSON.parse(raw);
      } catch {
        /* optional baseline */
      }

      const w2d010BgWarnings = w2d010Data?.diagnostics?.features?.find((f) => f.feature.includes("Gradient"))?.elementsCount ?? "N/A";
      const w2d010Nodes = w2d010Data?.metrics?.totalNodes ?? "N/A";
      const currentBgWarnings = doc.warnings?.filter((w) => w.code === "BACKGROUND_IMAGE_UNSUPPORTED").length ?? 0;
      const currentGradTypeWarnings = doc.warnings?.filter((w) => w.code === "GRADIENT_TYPE_UNSUPPORTED").length ?? 0;
      const currentGradHintWarnings = doc.warnings?.filter((w) => w.code === "GRADIENT_COLOR_HINT_APPROXIMATED").length ?? 0;

      console.log(`  Warnings: BACKGROUND_IMAGE_UNSUPPORTED: ${currentBgWarnings} (W2D-010: ${w2d010BgWarnings})`);
      console.log(`            GRADIENT_TYPE_UNSUPPORTED: ${currentGradTypeWarnings}`);
      console.log(`            GRADIENT_COLOR_HINT_APPROXIMATED: ${currentGradHintWarnings}`);

      // 4. Render through FakeFigmaHost
      const host = new FakeFigmaHost();
      const renderRes = await renderDesignDocument(doc, host);
      console.log(`  Renderer success: ${renderRes.createdNodeCount > 0 ? "PASS" : "FAIL"} (${renderRes.createdNodeCount} created nodes, ${renderRes.skippedNodeCount} skipped)`);

      function countFigmaGradients(node) {
        let linear = 0, radial = 0;
        if (node.fills && Array.isArray(node.fills)) {
          for (const fill of node.fills) {
            if (fill.type === "GRADIENT_LINEAR") linear++;
            if (fill.type === "GRADIENT_RADIAL") radial++;
          }
        }
        for (const child of node.children || []) {
          const c = countFigmaGradients(child);
          linear += c.linear;
          radial += c.radial;
        }
        return { linear, radial };
      }

      const figmaGradStats = countFigmaGradients(host.roots[0]);
      console.log(`  Native Figma gradient paints rendered: ${figmaGradStats.linear + figmaGradStats.radial} (GRADIENT_LINEAR: ${figmaGradStats.linear}, GRADIENT_RADIAL: ${figmaGradStats.radial})`);
      console.log(`  Capture duration: ${captureDurationMs}ms`);

      summaryResults.push({
        id: target.id,
        title: target.title,
        observedGradients: observed.totalObserved,
        observedLinear: observed.linearCount,
        observedRadial: observed.radialCount,
        observedConic: observed.conicCount,
        observedRepeating: observed.repeatingCount,
        capturedGradientElements: elementsWithGradients,
        linearFills,
        radialFills,
        nativeFigmaGradients: figmaGradStats.linear + figmaGradStats.radial,
        schemaVersion: doc.schemaVersion,
        schemaValid: parseRes.success,
        nodes: allNodes.length,
        w2d010Nodes,
        captureDurationMs,
        w2d010BgWarnings,
        currentBgWarnings,
        currentGradTypeWarnings,
        currentGradHintWarnings,
      });
    }

    console.log("\n======================================================");
    console.log(" W2D-012 Real-Site Gradient Summary");
    console.log("======================================================");
    console.log(JSON.stringify(summaryResults, null, 2));
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
  console.error("Spot check error:", err);
  process.exit(1);
});
