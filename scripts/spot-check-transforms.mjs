// scripts/spot-check-transforms.mjs
// Spot-checks real-site CSS transform capture and rendering for W2D-015 on representative pages.
// Compares against W2D-010 recorded baselines.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { safeParseDesignDocument } from "../packages/design-schema/dist/index.js";
import { renderDesignDocument, FakeFigmaHost } from "../packages/figma-renderer/dist/index.js";

const TARGETS = [
  {
    id: "complex-css-01-tailwind",
    url: "https://tailwindcss.com",
    title: "Tailwind CSS",
    w2d010File: "docs/evidence/w2d-010/complex-css-01-tailwind.json",
    w2d010TransformCount: 34,
  },
  {
    id: "svg-01-lucide",
    url: "https://lucide.dev",
    title: "Lucide Icons",
    w2d010File: "docs/evidence/w2d-010/svg-01-lucide.json",
    w2d010TransformCount: 26,
  },
  {
    id: "framework-01-react",
    url: "https://react.dev",
    title: "React Documentation",
    w2d010File: "docs/evidence/w2d-010/framework-01-react.json",
    w2d010TransformCount: 18,
  },
  {
    id: "docs-01-nodejs",
    url: "https://nodejs.org/en",
    title: "Node.js Official Documentation & Portal",
    w2d010File: "docs/evidence/w2d-010/docs-01-nodejs.json",
    w2d010TransformCount: 12,
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
  console.log(" Web2Design Real-Site CSS Transforms Spot Check (W2D-015)");
  console.log("======================================================");

  const contentScript = await fs.readFile(path.resolve("apps/extension/dist/content.js"), "utf8");
  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2d-spotcheck-transforms-"));

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
        await sendCommand("Page.navigate", { url: target.url });
      } catch (err) {
        console.warn(`  [WARN] Failed to navigate to ${target.url}: ${err.message}`);
        continue;
      }

      // Settle wait
      await new Promise((r) => setTimeout(r, 4000));

      // 2. In-Page Computed Style Transform Diagnostic
      const diagResult = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const allElements = Array.from(document.querySelectorAll('*'));
          let transformedCount = 0;
          let rotationCount = 0;
          let translationCount = 0;
          let uniformScaleCount = 0;
          let nonUniformScaleCount = 0;
          let skewCount = 0;
          let transform3dCount = 0;
          let nestedTransformCount = 0;

          for (const el of allElements) {
            const style = window.getComputedStyle(el);
            const t = style.transform;
            const hasIndividual = (style.translate && style.translate !== 'none') ||
                                  (style.rotate && style.rotate !== 'none') ||
                                  (style.scale && style.scale !== 'none');
            if ((t && t !== 'none') || hasIndividual) {
              transformedCount++;
              const is3d = t && t.startsWith('matrix3d');
              if (is3d) transform3dCount++;

              // Check nested
              let parent = el.parentElement;
              while (parent) {
                const ps = window.getComputedStyle(parent);
                if (ps.transform && ps.transform !== 'none') {
                  nestedTransformCount++;
                  break;
                }
                parent = parent.parentElement;
              }

              // Decompose matrix
              try {
                const m = new DOMMatrixReadOnly(t);
                const isRot = Math.abs(m.b) > 1e-3 || Math.abs(m.c) > 1e-3;
                const isTrans = Math.abs(m.e) > 1e-3 || Math.abs(m.f) > 1e-3;
                const sx = Math.hypot(m.a, m.b);
                const sy = Math.hypot(m.c, m.d);
                const dot = m.a * m.c + m.b * m.d;
                const isSkew = Math.abs(dot) > 1e-3;
                const isScale = Math.abs(sx - 1) > 1e-3 || Math.abs(sy - 1) > 1e-3;
                const isUniform = isScale && Math.abs(sx - sy) < 1e-3;
                const isNonUniform = isScale && Math.abs(sx - sy) >= 1e-3;

                if (isRot) rotationCount++;
                if (isTrans && !isRot) translationCount++;
                if (isUniform) uniformScaleCount++;
                if (isNonUniform) nonUniformScaleCount++;
                if (isSkew) skewCount++;
              } catch {}
            }
          }

          return {
            totalElements: allElements.length,
            transformedCount,
            rotationCount,
            translationCount,
            uniformScaleCount,
            nonUniformScaleCount,
            skewCount,
            transform3dCount,
            nestedTransformCount,
          };
        })()`,
        returnByValue: true,
      });

      const browserDiag = diagResult.result?.value ?? {
        totalElements: 0,
        transformedCount: 0,
        rotationCount: 0,
        translationCount: 0,
        uniformScaleCount: 0,
        nonUniformScaleCount: 0,
        skewCount: 0,
        transform3dCount: 0,
        nestedTransformCount: 0,
      };

      // 3. Inject Extension Content Script into Isolated World
      const tree = await sendCommand("Page.getFrameTree");
      const isolated = await sendCommand("Page.createIsolatedWorld", {
        frameId: tree.frameTree.frame.id,
        worldName: "w2d-spotcheck-transforms-world",
      });

      await sendCommand("Runtime.evaluate", {
        expression: `globalThis.chrome = { runtime: { id: "spotcheck-transforms-ext", onMessage: { addListener(fn) { globalThis.smokeHandler = fn; } } } };`,
        contextId: isolated.executionContextId,
      });

      await sendCommand("Runtime.evaluate", {
        expression: contentScript,
        contextId: isolated.executionContextId,
      });

      const capStart = Date.now();
      const captureRes = await sendCommand("Runtime.evaluate", {
        expression: `new Promise(resolve => globalThis.smokeHandler({ type: "web2design.capture.v1" }, { id: "spotcheck-transforms-ext" }, resolve))`,
        contextId: isolated.executionContextId,
        awaitPromise: true,
        returnByValue: true,
      });
      const captureDuration = Date.now() - capStart;

      const capOutput = captureRes.result?.value;
      if (!capOutput || !capOutput.ok || !capOutput.document) {
        console.warn(`  [WARN] Capture failed or returned empty document for ${target.title}`);
        continue;
      }

      const doc = capOutput.document;

      // 4. Authoritative Schema Validation
      const parseResult = safeParseDesignDocument(doc);
      const isSchemaValid = parseResult.success;

      // 5. Count Schema Transform Nodes
      let schemaTransformNodes = 0;
      let totalNodes = 0;
      function walk(node) {
        totalNodes++;
        if (node.transform) {
          schemaTransformNodes++;
        }
        if (node.children) {
          for (const c of node.children) walk(c);
        }
      }
      walk(doc.root);

      // 6. Figma Renderer Execution
      const host = new FakeFigmaHost();
      const renderRes = await renderDesignDocument(doc, host);

      const blankWarnings = renderRes.warnings.filter((w) =>
        w.code === "TRANSFORM_APPROXIMATED"
      );
      const scaleWarnCount = renderRes.warnings.filter((w) =>
        w.code === "TRANSFORM_SCALE_APPROXIMATED"
      ).length;
      const skewWarnCount = renderRes.warnings.filter((w) =>
        w.code === "TRANSFORM_SKEW_APPROXIMATED"
      ).length;
      const nestWarnCount = renderRes.warnings.filter((w) =>
        w.code === "TRANSFORM_NESTED_APPROXIMATED"
      ).length;
      const reflectWarnCount = renderRes.warnings.filter((w) =>
        w.code === "TRANSFORM_REFLECTION_UNSUPPORTED"
      ).length;
      const transform3dWarnCount = renderRes.warnings.filter((w) =>
        w.code === "TRANSFORM_3D_UNSUPPORTED"
      ).length;

      const exactCases = Math.max(
        0,
        schemaTransformNodes - (scaleWarnCount + skewWarnCount + nestWarnCount + reflectWarnCount + transform3dWarnCount)
      );

      const resultEntry = {
        id: target.id,
        title: target.title,
        url: target.url,
        browserDiag,
        w2d010TransformCount: target.w2d010TransformCount,
        schemaTransformNodes,
        exactCases,
        scaleWarnCount,
        skewWarnCount,
        nestWarnCount,
        transform3dWarnCount,
        reflectWarnCount,
        blanketWarningCount: blankWarnings.length,
        totalNodes,
        figmaNodesCreated: host.roots.length > 0 ? renderRes.createdNodeCount : 0,
        skippedNodes: renderRes.skippedNodeCount,
        schemaValid: isSchemaValid,
        captureDuration,
        rendererSuccess: host.roots.length > 0,
      };

      summaryResults.push(resultEntry);

      console.log(`  DOM Transformed Elements: ${browserDiag.transformedCount} (W2D-010: ~${target.w2d010TransformCount})`);
      console.log(`    - 2D Rotation:          ${browserDiag.rotationCount}`);
      console.log(`    - 2D Translation:       ${browserDiag.translationCount}`);
      console.log(`    - Uniform Scale:        ${browserDiag.uniformScaleCount}`);
      console.log(`    - Non-Uniform Scale:    ${browserDiag.nonUniformScaleCount}`);
      console.log(`    - Skew:                 ${browserDiag.skewCount}`);
      console.log(`    - 3D Transforms:        ${browserDiag.transform3dCount}`);
      console.log(`    - Nested Transforms:    ${browserDiag.nestedTransformCount}`);
      console.log(`  Schema Transform Nodes:   ${schemaTransformNodes}`);
      console.log(`  Figma Renderer:`);
      console.log(`    - Exact Transforms:     ${exactCases}`);
      console.log(`    - Scale Approximated:   ${scaleWarnCount}`);
      console.log(`    - Skew Approximated:    ${skewWarnCount}`);
      console.log(`    - Nested Approximated:  ${nestWarnCount}`);
      console.log(`    - Blanket Warnings:     ${blankWarnings.length} (must be 0)`);
      console.log(`  Nodes Created in Figma:   ${renderRes.createdNodeCount} (skipped: ${renderRes.skippedNodeCount})`);
      console.log(`  Schema Valid:             ${isSchemaValid ? "YES (V0.5)" : "NO"}`);
      console.log(`  Capture Duration:         ${captureDuration}ms`);
      console.log(`  Renderer Success:         ${host.roots.length > 0 ? "YES" : "NO"}`);
    }
  } finally {
    socket.close();
    chromeProcess.kill();
    try {
      await fs.rm(tempProfileDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup error */
    }
  }

  console.log("\n======================================================");
  console.log(" Real-Site Spot Check Summary Table");
  console.log("======================================================");
  console.table(
    summaryResults.map((r) => ({
      Site: r.title,
      "DOM Xforms": r.browserDiag.transformedCount,
      "Schema Nodes": r.schemaTransformNodes,
      "Exact Cases": r.exactCases,
      "Scale Approx": r.scaleWarnCount,
      "Skew Approx": r.skewWarnCount,
      "Nested Approx": r.nestWarnCount,
      "Blanket Warn": r.blanketWarningCount,
      "Schema V0.5": r.schemaValid ? "PASS" : "FAIL",
      "Cap (ms)": r.captureDuration,
    }))
  );

  return summaryResults;
}

runSpotCheck().catch((err) => {
  console.error("Spot check error:", err);
  process.exit(1);
});
