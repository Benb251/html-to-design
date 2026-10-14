// scripts/diagnose-flex-accounting.mjs
// Analyzes DOM flex containers across the 4 representative sites to reconcile:
// DOM flex -> design nodes -> frame candidates -> eligible inference candidates -> inferred vs rejected vs pruned

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const TARGETS = [
  { id: "react", url: "https://react.dev", title: "React Documentation" },
  { id: "vite", url: "https://vite.dev", title: "Vite Official Portal" },
  { id: "tailwind", url: "https://tailwindcss.com", title: "Tailwind CSS" },
  { id: "wikipedia", url: "https://en.wikipedia.org/wiki/Responsive_web_design", title: "Wikipedia" },
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
  console.error("Chrome not found.");
  process.exit(1);
}

async function run() {
  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2d-flex-diag-"));
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

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === "page");
  const WebSocket = (await import("ws")).default;
  const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve) => (socket.onopen = resolve));

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
  await sendCommand("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const summary = [];

  try {
    for (const target of TARGETS) {
      console.log(`Analyzing: ${target.title} (${target.url})...`);
      await sendCommand("Page.navigate", { url: target.url });
      await new Promise((r) => setTimeout(r, 6000));

      const res = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          let totalDomFlex = 0;
          let fixedOrSticky = 0;
          let hiddenOrZeroSize = 0;
          let collapsedInlineText = 0;
          let leafOrEmpty = 0; // 0 child elements
          let frameCandidates = 0; // has at least 1 element child
          
          let wrapRejected = 0;
          let reverseRejected = 0;
          let marginRejected = 0;
          let orderRejected = 0;
          let baselineRejected = 0;
          let growRejected = 0;
          let offsetRejected = 0;
          let eligibleCandidates = 0;

          const elements = Array.from(document.querySelectorAll('*'));
          for (const el of elements) {
            const cs = window.getComputedStyle(el);
            if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
            totalDomFlex++;

            if (cs.position === 'fixed' || cs.position === 'sticky') {
              fixedOrSticky++;
              continue;
            }

            const rect = el.getBoundingClientRect();
            if (cs.display === 'none' || cs.visibility === 'hidden' || (rect.width === 0 && rect.height === 0)) {
              hiddenOrZeroSize++;
              continue;
            }

            // Check if element has element children
            const childElements = Array.from(el.children).filter(c => {
              const ccs = window.getComputedStyle(c);
              return ccs.display !== 'none';
            });

            if (childElements.length === 0) {
              leafOrEmpty++;
              continue;
            }

            // Check if it would be treated as an inline rich text flow
            // (e.g. only contains text formatting / inline text)
            let isInlineTextFlow = false;
            // Count as container candidate
            frameCandidates++;

            // Now check flex properties
            const isWrap = cs.flexWrap === 'wrap' || cs.flexWrap === 'wrap-reverse';
            if (isWrap) {
              wrapRejected++;
              continue;
            }

            const dir = cs.flexDirection;
            if (dir === 'row-reverse' || dir === 'column-reverse') {
              reverseRejected++;
              continue;
            }

            if (cs.alignItems === 'baseline') {
              baselineRejected++;
              continue;
            }

            let hasMargin = false;
            let hasOrder = false;
            let hasBaseline = false;
            let hasGrow = false;
            let hasOffset = false;

            for (const child of childElements) {
              const ccs = window.getComputedStyle(child);
              if (ccs.position === 'absolute') continue;
              const mt = parseFloat(ccs.marginTop) || 0;
              const mr = parseFloat(ccs.marginRight) || 0;
              const mb = parseFloat(ccs.marginBottom) || 0;
              const ml = parseFloat(ccs.marginLeft) || 0;
              if (mt > 0 || mr > 0 || mb > 0 || ml > 0) hasMargin = true;
              if (ccs.order && ccs.order !== '0') hasOrder = true;
              if (ccs.alignSelf === 'baseline') hasBaseline = true;
              const fg = parseFloat(ccs.flexGrow) || 0;
              if (fg > 1) hasGrow = true;
              if (ccs.position === 'relative') {
                const top = parseFloat(ccs.top) || 0;
                const left = parseFloat(ccs.left) || 0;
                if (top !== 0 || left !== 0) hasOffset = true;
              }
            }

            if (hasMargin) {
              marginRejected++;
              continue;
            }
            if (hasOrder) {
              orderRejected++;
              continue;
            }
            if (hasBaseline) {
              baselineRejected++;
              continue;
            }
            if (hasGrow) {
              growRejected++;
              continue;
            }
            if (hasOffset) {
              offsetRejected++;
              continue;
            }

            eligibleCandidates++;
          }

          return {
            totalDomFlex,
            fixedOrSticky,
            hiddenOrZeroSize,
            leafOrEmpty,
            frameCandidates,
            wrapRejected,
            reverseRejected,
            marginRejected,
            orderRejected,
            baselineRejected,
            growRejected,
            offsetRejected,
            eligibleCandidates,
          };
        })()`,
        returnByValue: true,
      });

      console.log(`Results for ${target.id}:`, res.result?.value);
      summary.push({ id: target.id, ...res.result?.value });
    }

    console.log("\nComplete Accounting Summary:");
    console.table(summary);
  } finally {
    socket.close();
    chromeProcess.kill();
    try {
      await fs.rm(tempProfileDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup error */
    }
  }
}

run().catch(console.error);
