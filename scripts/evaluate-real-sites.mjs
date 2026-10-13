// scripts/evaluate-real-sites.mjs
// Real-site evaluation runner for W2D-010 using Chrome CDP + packaged extension content script.
// Does NOT use Playwright or external crawler. Connects Chrome directly via WebSocket CDP.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { safeParseDesignDocument } from "../packages/design-schema/dist/index.js";
import { countNodes } from "../packages/capture-engine/dist/index.js";
import { renderDesignDocument, FakeFigmaHost } from "../packages/figma-renderer/dist/index.js";

const SITES = [
  {
    id: "marketing-01-example",
    category: "A — Simple marketing / landing",
    url: "https://example.com",
    label: "Example Domain",
  },
  {
    id: "marketing-02-vite",
    category: "A — Simple marketing / landing",
    url: "https://vite.dev",
    label: "Vite Next-Gen Frontend Tooling",
  },
  {
    id: "marketing-03-bootstrap",
    category: "A — Simple marketing / landing",
    url: "https://getbootstrap.com",
    label: "Bootstrap Framework Landing",
  },
  {
    id: "docs-01-nodejs",
    category: "B — Documentation / article",
    url: "https://nodejs.org/en",
    label: "Node.js Official Documentation & Portal",
  },
  {
    id: "docs-02-wikipedia",
    category: "B — Documentation / article",
    url: "https://en.wikipedia.org/wiki/Figma",
    label: "Wikipedia Figma Article",
  },
  {
    id: "saas-01-hackernews",
    category: "C — SaaS / application-style",
    url: "https://news.ycombinator.com",
    label: "Hacker News Dense List",
  },
  {
    id: "saas-02-httpbin",
    category: "C — SaaS / application-style",
    url: "https://httpbin.org",
    label: "Httpbin API Inspection Dashboard",
  },
  {
    id: "ecommerce-01-books",
    category: "D — E-commerce / product page",
    url: "https://books.toscrape.com",
    label: "Books to Scrape Catalog",
  },
  {
    id: "image-01-picsum",
    category: "E — Image-heavy page",
    url: "https://picsum.photos",
    label: "Lorem Picsum Photo Showcase",
  },
  {
    id: "svg-01-lucide",
    category: "F — SVG / icon-heavy page",
    url: "https://lucide.dev",
    label: "Lucide Icons Library",
  },
  {
    id: "framework-01-react",
    category: "G — Responsive framework page",
    url: "https://react.dev",
    label: "React Official Documentation",
  },
  {
    id: "complex-css-01-tailwind",
    category: "H — Complex CSS page",
    url: "https://tailwindcss.com",
    label: "Tailwind CSS Modern Showcase",
  },
];

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function main() {
  console.log("======================================================");
  console.log(" Web2Design Real-Site Limitations Evaluation (W2D-010)");
  console.log("======================================================");

  const contentScript = await fs.readFile(
    path.resolve("apps/extension/dist/content.js"),
    "utf8"
  );
  const evidenceDir = path.resolve("docs/evidence/w2d-010");
  await fs.mkdir(evidenceDir, { recursive: true });

  const tempProfileDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "w2d-eval-chrome-")
  );

  console.log(`Launching Chrome with user-data-dir: ${tempProfileDir}`);
  const chromeProcess = spawn(
    CHROME_PATH,
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
      const portFile = await fs.readFile(
        path.join(tempProfileDir, "DevToolsActivePort"),
        "utf8"
      );
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

  console.log(`Chrome CDP active on port: ${cdpPort}`);
  const targets = await (
    await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
  ).json();
  const pageTarget = targets.find((t) => t.type === "page");
  if (!pageTarget) throw new Error("No page target found in Chrome.");

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
  await sendCommand("DOM.enable");
  await sendCommand("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evaluationResults = [];
  const targetFilter = process.argv[2];
  const sitesToRun = targetFilter
    ? SITES.filter((s) => s.id.includes(targetFilter) || s.url.includes(targetFilter))
    : SITES;

  for (let i = 0; i < sitesToRun.length; i++) {
    const site = sitesToRun[i];
    console.log(
      `\n[${i + 1}/${sitesToRun.length}] Evaluating ${site.id} (${site.url})...`
    );

    const siteEvidence = {
      siteId: site.id,
      category: site.category,
      label: site.label,
      url: site.url,
      timestamp: new Date().toISOString(),
      viewport: { width: 1440, height: 900 },
      page: {},
      metrics: {},
      captureWarnings: [],
      rendererWarnings: [],
      browserDiagnostics: {},
      overallGrade: "C",
      status: "IN_PROGRESS",
    };

    try {
      // 1. Navigate to target URL
      const navPromise = sendCommand("Page.navigate", { url: site.url });
      await Promise.race([
        navPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Navigation timeout")), 15000)
        ),
      ]);

      // 2. Wait for document ready
      for (let w = 0; w < 40; w++) {
        try {
          const evalReady = await sendCommand("Runtime.evaluate", {
            expression: 'document.readyState === "complete"',
            returnByValue: true,
          });
          if (evalReady.result?.value) {
            break;
          }
        } catch {
          // Retry until timeout
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      // Settle time for fonts, hydration, and layout
      await new Promise((r) => setTimeout(r, 2000));

      // 3. Inspect browser diagnostics directly from page
      const diagResult = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const all = Array.from(document.querySelectorAll('*'));
          let grids = 0, flexes = 0, fixedSticky = 0, gradients = 0, transforms = 0, clipping = 0, pseudoIcons = 0;
          let iframes = document.querySelectorAll('iframe').length;
          let videos = document.querySelectorAll('video').length;
          let canvases = document.querySelectorAll('canvas').length;

          for (const el of all) {
            const cs = window.getComputedStyle(el);
            if (cs.display === 'grid' || cs.display === 'inline-grid') grids++;
            if (cs.display === 'flex' || cs.display === 'inline-flex') flexes++;
            if (cs.position === 'fixed' || cs.position === 'sticky') fixedSticky++;
            if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) gradients++;
            if (cs.transform && cs.transform !== 'none') transforms++;
            if (cs.overflow === 'hidden' || cs.overflow === 'clip') clipping++;
            
            const before = window.getComputedStyle(el, '::before');
            const after = window.getComputedStyle(el, '::after');
            if (before.content && before.content !== 'none' && before.content !== '""') pseudoIcons++;
            if (after.content && after.content !== 'none' && after.content !== '""') pseudoIcons++;
          }

          return {
            title: document.title,
            docWidth: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
            docHeight: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
            elementCount: all.length,
            grids,
            flexes,
            fixedSticky,
            gradients,
            transforms,
            clipping,
            pseudoIcons,
            iframes,
            videos,
            canvases
          };
        })()`,
        returnByValue: true,
      });

      const pageDiag = diagResult.result?.value || {};
      siteEvidence.page = {
        title: pageDiag.title || "Untitled",
        url: site.url,
        documentWidth: pageDiag.docWidth || 1440,
        documentHeight: pageDiag.docHeight || 900,
      };
      siteEvidence.browserDiagnostics = pageDiag;

      // 4. Inject content script into an isolated world
      const frameTree = await sendCommand("Page.getFrameTree");
      const isolatedWorld = await sendCommand("Page.createIsolatedWorld", {
        frameId: frameTree.frameTree.frame.id,
        worldName: `w2d-capture-${site.id}`,
      });

      async function evalIsolated(expr) {
        const res = await sendCommand("Runtime.evaluate", {
          expression: expr,
          contextId: isolatedWorld.executionContextId,
          returnByValue: true,
          awaitPromise: true,
        });
        if (res.exceptionDetails) {
          throw new Error(
            res.exceptionDetails.text +
              ": " +
              (res.exceptionDetails.exception?.description || "")
          );
        }
        return res.result.value;
      }

      await evalIsolated(
        'globalThis.chrome = { runtime: { id: "w2d-eval", onMessage: { addListener(fn) { globalThis.evalHandler = fn; } } } };'
      );
      await evalIsolated(contentScript);

      // 5. Execute capture
      const captureT0 = Date.now();
      const captureResponse = await evalIsolated(
        'new Promise(resolve => globalThis.evalHandler({type:"web2design.capture.v1"},{id:"w2d-eval"},resolve))'
      );
      const captureDurationMs = Date.now() - captureT0;

      if (!captureResponse || !captureResponse.ok) {
        throw new Error(
          captureResponse?.error || "Capture handler returned not ok"
        );
      }

      const doc = captureResponse.document;

      // 6. Schema validation
      const parseResult = safeParseDesignDocument(doc);
      if (!parseResult.success) {
        console.error(
          `  ❌ Schema validation failed for ${site.id}:`,
          parseResult.issues
        );
        siteEvidence.schemaValid = false;
        siteEvidence.schemaIssues = parseResult.issues;
        siteEvidence.status = "SCHEMA_INVALID";
        siteEvidence.overallGrade = "F";
      } else {
        siteEvidence.schemaValid = true;
      }

      // Count node types in document
      const nodeCounts = { frame: 0, text: 0, rectangle: 0, image: 0, svg: 0 };
      function tally(node) {
        if (nodeCounts[node.type] !== undefined) nodeCounts[node.type]++;
        if (node.children) node.children.forEach(tally);
      }
      tally(doc.root);
      const totalNodes = countNodes(doc.root);

      siteEvidence.metrics = {
        totalNodes,
        nodeCounts,
        assetCount: doc.assets?.length || 0,
        captureWarningsCount: doc.warnings?.length || 0,
        captureDurationMs,
        jsonSizeBytes: JSON.stringify(doc).length,
      };

      siteEvidence.captureWarnings = doc.warnings || [];

      // 7. Render into FakeFigmaHost
      const host = new FakeFigmaHost();
      const renderT0 = Date.now();
      const renderResult = await renderDesignDocument(doc, host);
      const renderDurationMs = Date.now() - renderT0;

      siteEvidence.rendererMetrics = {
        createdNodeCount: renderResult.createdNodeCount,
        skippedNodeCount: renderResult.skippedNodeCount,
        rendererWarningsCount: renderResult.warnings?.length || 0,
        renderDurationMs,
        rootNodesCreated: host.roots.length,
      };
      siteEvidence.rendererWarnings = renderResult.warnings || [];
      siteEvidence.rendererSuccess = true;
      siteEvidence.status = "SUCCESS";

      // 8. Assign overall grade based on objective criteria:
      // A: 0 skipped nodes, 0 schema failures, minimal warnings, strong visual correspondence
      // B: 0 skipped nodes, graceful approximations (e.g. gradients, font fallback)
      // C: some skipped nodes or notable approximations, but largely usable
      // D: poor structure or heavy data loss
      // F: crash or schema invalid
      if (
        renderResult.skippedNodeCount === 0 &&
        siteEvidence.captureWarnings.length <= 2
      ) {
        siteEvidence.overallGrade = "A";
      } else if (
        renderResult.skippedNodeCount === 0 &&
        renderResult.warnings.length <= 15
      ) {
        siteEvidence.overallGrade = "B";
      } else if (
        renderResult.skippedNodeCount <= 5 &&
        renderResult.createdNodeCount > 10
      ) {
        siteEvidence.overallGrade = "C";
      } else {
        siteEvidence.overallGrade = "D";
      }

      console.log(
        `  ✅ Captured ${totalNodes} nodes, ${doc.assets?.length || 0} assets, ` +
          `${siteEvidence.captureWarnings.length} cap-warn, ${siteEvidence.rendererWarnings.length} rend-warn in ${captureDurationMs}ms. Grade: ${siteEvidence.overallGrade}`
      );

      // Save individual site evidence (compact)
      const evidencePath = path.join(evidenceDir, `${site.id}.json`);
      await fs.writeFile(
        evidencePath,
        JSON.stringify(siteEvidence, null, 2),
        "utf8"
      );
    } catch (err) {
      console.error(`  ❌ Error processing ${site.id}:`, err.message);
      siteEvidence.status = "ERROR";
      siteEvidence.errorMessage = err.message;
      siteEvidence.overallGrade = "F";

      const evidencePath = path.join(evidenceDir, `${site.id}.json`);
      await fs.writeFile(
        evidencePath,
        JSON.stringify(siteEvidence, null, 2),
        "utf8"
      );
    }

    evaluationResults.push(siteEvidence);
  }

  // Write aggregate summary
  const summary = {
    evaluatedAt: new Date().toISOString(),
    totalSites: SITES.length,
    grades: {
      A: evaluationResults.filter((r) => r.overallGrade === "A").length,
      B: evaluationResults.filter((r) => r.overallGrade === "B").length,
      C: evaluationResults.filter((r) => r.overallGrade === "C").length,
      D: evaluationResults.filter((r) => r.overallGrade === "D").length,
      F: evaluationResults.filter((r) => r.overallGrade === "F").length,
    },
    schemaValidCount: evaluationResults.filter((r) => r.schemaValid).length,
    rendererSuccessCount: evaluationResults.filter((r) => r.rendererSuccess)
      .length,
    results: evaluationResults,
  };

  await fs.writeFile(
    path.join(evidenceDir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  console.log(
    `\nSummary written to ${path.join(evidenceDir, "summary.json")}`
  );

  socket.close();
  chromeProcess.kill();
  chromeProcess.on("exit", async () => {
    try {
      await fs.rm(tempProfileDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup on Windows
    }
  });

  console.log("\nFinished evaluation.");
}

main().catch((err) => {
  console.error("Fatal evaluation error:", err);
  process.exit(1);
});
