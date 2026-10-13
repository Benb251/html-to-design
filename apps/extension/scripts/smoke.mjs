// Local rendered-fixture smoke via Chrome DevTools Protocol. No Playwright, crawler, remote fetch or extension-install claim.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { safeParseDesignDocument } from "@web2design/design-schema";
import { countNodes } from "@web2design/capture-engine";
const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
let executable;
for (const candidate of candidates) { try { await fs.access(candidate); executable = candidate; break; } catch { /* Try next configured path. */ } }
if (!executable) throw new Error("Chrome was not found. Set CHROME_PATH. Manual extension loading is a separate check.");
const names = ["landing", "fidelity-geometry", "fidelity-text", "fidelity-styles", "fidelity-limits", "fidelity-assets", "fidelity-pseudo"];
const fixtures = new Map(await Promise.all(names.map(async name => ["/" + name + ".html", await fs.readFile(new URL("../fixtures/" + name + ".html", import.meta.url))])));
const dotPng = await fs.readFile(new URL("../fixtures/dot.png", import.meta.url));
const content = await fs.readFile(new URL("../dist/content.js", import.meta.url), "utf8");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "web2design-rendered-smoke-"));
const server = http.createServer((request, response) => {
  if (request.url === "/dot.png") {
    response.writeHead(200, { "content-type": "image/png" }).end(dotPng);
    return;
  }
  const fixture = fixtures.get(request.url === "/" ? "/landing.html" : request.url);
  if (!fixture) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(fixture);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
let child, socket;
const pending = new Map();
let sequence = 0;
const rejectPending = error => {
  for (const task of pending.values()) task.reject(error);
  pending.clear();
};
const timeout = setTimeout(() => {
  rejectPending(new Error("Rendered-fixture smoke timed out."));
  child?.kill();
  socket?.close();
  server.close();
  process.exitCode = 1;
}, 60000);
try {
  child = spawn(executable, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + directory, "about:blank"], { stdio: "ignore", windowsHide: true });
  child.on("error", error => { console.error(error.message); });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = Number((await fs.readFile(path.join(directory, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!port) throw new Error("Chrome DevTools did not start.");
  const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json(), target = targets.find(item => item.type === "page");
  if (!target) throw new Error("Chrome page target missing.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener("close", () => rejectPending(new Error("Chrome DevTools disconnected.")));
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) { const task = pending.get(message.id); if (task) { pending.delete(message.id); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); } }
  });
  async function command(method, params = {}) {
    const id = ++sequence;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params })); return result;
  }
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: origin });
  let loaded = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const ready = await command("Runtime.evaluate", { expression: 'document.readyState === "complete" && document.title === "Web2Design capture fixture"', returnByValue: true });
    if (ready.result.value) { loaded = true; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(loaded, "Local fixture must finish loading before capture");
  const tree = await command("Page.getFrameTree");
  let isolated = await command("Page.createIsolatedWorld", { frameId: tree.frameTree.frame.id, worldName: "web2design-smoke" });
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", { expression, contextId: isolated.executionContextId, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + (result.exceptionDetails.exception?.description ?? ""));
    return result.result.value;
  }
  // Stub only Chrome message transport. Execute the actual shipped bundle in an isolated world on real layout.
  await evaluate('globalThis.chrome = { runtime: { id: "smoke-extension", onMessage: { addListener(fn) { globalThis.smokeHandler = fn; globalThis.smokeListeners = (globalThis.smokeListeners || 0) + 1; } } } };');
  await evaluate(content); await evaluate(content);
  assert.equal(await evaluate("globalThis.smokeListeners"), 1, "Repeated injection must not duplicate listeners");
  const capture = () => evaluate('new Promise(resolve => globalThis.smokeHandler({type:"web2design.capture.v1"},{id:"smoke-extension"},resolve))');
  const first = await capture(); assert.equal(first.ok, true); assert.equal(safeParseDesignDocument(first.document).success, true);
  await evaluate("window.scrollTo(0, 350)");
  const second = await capture(); assert.equal(second.ok, true); assert.equal(safeParseDesignDocument(second.document).success, true);
  assert.ok(second.document.viewport.scrollY > 0);
  const flatten = node => [node, ...node.children.flatMap(flatten)];
  const geometry = document => flatten(document.root).map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  assert.deepEqual(geometry(first.document), geometry(second.document), "Rendered normal-flow geometry must be scroll-stable");
  const texts = flatten(first.document.root).filter(node => node.type === "text");
  assert.ok(texts.some(node => node.characters.includes("Capture a rendered landing page")));
  assert.ok(texts.some(node => node.characters.includes("Try capture")));
  assert.ok(texts.every(node => node.width > 0 && node.height > 0));
  assert.ok(!JSON.stringify(first.document).includes("Do not capture me"));
  assert.ok(flatten(first.document.root).some(node => node.style?.border?.width === 2));
  assert.ok(flatten(first.document.root).some(node => node.style?.cornerRadius === 16));
  const faded = flatten(first.document.root).find(node => node.opacity === 0.5);
  assert.ok(faded && faded.children.every(node => node.opacity === 1));
  const evidence = new URL("../.smoke/", import.meta.url);
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(new URL("capture.json", evidence), JSON.stringify(first.document, null, 2));
  const checks = [];
  const check = (name, fn) => { fn(); checks.push(name); };
  const near = (actual, expected, label, tolerance = .04) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
  const color = (actual, expected) => { assert.ok(actual); for (const key of ["r", "g", "b", "a"]) near(actual[key], expected[key], "color." + key, 1e-6); };
  // Independent browser measurements, indexed by DOM path, inspect the actual bundle's output.
  const measure = () => evaluate(`(() => {
    const elements = {}, texts = {};
    const box = rect => ({ x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height });
    function visit(node, path) {
      const suffix = path.length ? path.join('-') : 'body';
      if (node.nodeType === 1 && node.id) elements[node.id] = { id: 'w2d-element-' + suffix, box: box(node.getBoundingClientRect()), textIds: Array.from(node.childNodes).map((child, index) => child.nodeType === 3 ? 'w2d-text-' + [...path, index].join('-') : null).filter(Boolean) };
      if (node.nodeType === 3) { const range = document.createRange(); range.selectNodeContents(node); texts['w2d-text-' + suffix] = { box: box(range.getBoundingClientRect()), fragments: range.getClientRects().length }; }
      Array.from(node.childNodes).forEach((child, index) => visit(child, [...path, index]));
    }
    visit(document.body, []); return { elements, texts };
  })()`);
  for (const name of names.slice(1)) {
    await command("Page.navigate", { url: origin + "/" + name + ".html" });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await command("Runtime.evaluate", { expression: `document.readyState === 'complete' && location.pathname === '/${name}.html'`, returnByValue: true });
      if (state.result.value) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, name + " must load");
    const frame = await command("Page.getFrameTree");
    isolated = await command("Page.createIsolatedWorld", { frameId: frame.frameTree.frame.id, worldName: "web2design-smoke" });
    await evaluate("document.fonts.ready");
    await evaluate('globalThis.chrome = { runtime: { id: "smoke-extension", onMessage: { addListener(fn) { globalThis.smokeHandler = fn; globalThis.smokeListeners = (globalThis.smokeListeners || 0) + 1; } } } };');
    await evaluate(content); await evaluate(content);
    assert.equal(await evaluate("globalThis.smokeListeners"), 1);
    const response = await capture(); assert.equal(response.ok, true, name);
    const doc = response.document, all = flatten(doc.root), byId = new Map(all.map(node => [node.id, node])), oracle = await measure();
    const element = id => byId.get(oracle.elements[id].id);
    const text = id => oracle.elements[id].textIds.map(id => byId.get(id)).filter(Boolean);
    const boxesMatch = (actual, expected) => { for (const key of ["x", "y", "width", "height"]) near(actual[key], expected[key], actual.id + "." + key); };
    check(name + ": schema and deterministic capture", () => { assert.ok(safeParseDesignDocument(doc).success); assert.equal(new Set(all.map(node => node.id)).size, all.length); });
    const repeated = (await capture()).document;
    check(name + ": repeated values and warnings", () => { assert.deepEqual(repeated.root, doc.root); assert.deepEqual(repeated.warnings, doc.warnings); });
    if (name === "fidelity-geometry") {
      check("content-box padding/border/margin", () => { const box = element("content-box"); boxesMatch(box, oracle.elements["content-box"].box); near(box.x, 47.25, "content x"); near(box.y, 47.25, "content y"); near(box.width, 144.5, "content width"); near(box.height, 57.25, "content height"); });
      check("border-box sizing", () => { near(element("border-box").width, 120.5, "border-box width"); near(element("border-box").height, 57.25, "border-box height"); });
      check("nested fractional absolute boxes", () => { const box = element("inner"); near(box.x, 316.25, "inner x"); near(box.y, 236, "inner y"); near(box.width, 33.3333, "inner width"); near(box.height, 18.75, "inner height"); });
      check("negative and offscreen long document geometry", () => { near(element("negative").x, -18.75, "negative x"); near(element("long").y, 2400.25, "long y"); for (const id of ["negative", "nested", "inner", "long"]) boxesMatch(element(id), oracle.elements[id].box); });
      await evaluate("scrollTo(300, 1500); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const scrolled = (await capture()).document;
      check("non-zero horizontal/vertical scroll stability", () => { assert.ok(scrolled.viewport.scrollX > 0 && scrolled.viewport.scrollY > 0); assert.deepEqual(geometry(scrolled), geometry(doc)); assert.deepEqual(scrolled.warnings, doc.warnings); });
    }
    if (name === "fidelity-text") {
      check("text range excludes parent padding", () => { const run = text("padded")[0], parent = element("padded"); boxesMatch(run, oracle.texts[run.id].box); near(run.x - parent.x, 20.75, "padding text x"); assert.ok(run.width < parent.width - 41.5); assert.ok(run.height < parent.height); });
      check("all text geometry agrees with browser Ranges", () => { for (const node of all.filter(node => node.type === "text")) boxesMatch(node, oracle.texts[node.id].box); });
      check("multiline editable union geometry", () => { const run = text("multiline")[0]; assert.ok(oracle.texts[run.id].fragments > 1); assert.ok(run.height > 24); assert.ok(doc.warnings.some(w => w.code === "TEXT_RANGE_APPROXIMATED" && w.nodeId === run.id)); });
      check("multiple direct text nodes remain distinct", () => { assert.deepEqual(text("direct").map(node => node.characters), ["First", " Second"]); assert.ok(text("direct")[1].x > text("direct")[0].x); });
      check("visible standalone collapsed space is retained", () => { assert.equal(text("inline-space")[0].characters, " "); assert.ok(text("inline-space")[0].width > 0); });
      check("pre-line leading line breaks remain meaningful", () => assert.equal(text("pre-line-leading")[0].characters, "\none\ntwo"));
      check("normal/pre/pre-wrap/nowrap/pre-line whitespace", () => { assert.equal(text("normal")[0].characters, "one two three"); assert.equal(text("pre")[0].characters, "one  two\n three"); assert.equal(text("pre-wrap")[0].characters, "one  two\n three"); assert.equal(text("nowrap")[0].characters, "one two three"); assert.equal(text("pre-line")[0].characters, "one two\nthree"); });
      check("line breaks and meaningful space-only text", () => { assert.deepEqual(text("breaks").map(node => node.characters), ["First line", "Second line"]); assert.ok(text("breaks")[1].y > text("breaks")[0].y); assert.equal(text("space-only")[0].characters, "   "); assert.equal(text("nbsp")[0].characters, "\u00a0"); });
      check("computed typography", () => { const style = text("typography")[0].textStyle; assert.equal(style.fontFamily, "Arial"); assert.deepEqual(style.fontFallbacks, ["sans-serif"]); assert.equal(style.fontSize, 18.75); assert.equal(style.fontWeight, 700); assert.equal(style.fontStyle, "italic"); assert.equal(style.lineHeight, 28.5); assert.equal(style.letterSpacing, .5); assert.equal(style.textAlign, "center"); color(style.color, { r: 18 / 255, g: 52 / 255, b: 86 / 255, a: .5 }); });
      check("normal line-height approximation is explicit", () => { assert.equal(text("normal-height")[0].textStyle.lineHeight, 19.2); assert.ok(doc.warnings.some(w => w.code === "LINE_HEIGHT_APPROXIMATED")); });
    }
    if (name === "fidelity-styles") {
      check("body canvas fill propagates once across margins", () => { color(doc.root.style.fills[0].color, { r: 200 / 255, g: 220 / 255, b: 240 / 255, a: .25 }); assert.equal(byId.get("w2d-element-body").style.fills, undefined); });
      check("solid fill alpha separate from node opacity", () => { color(element("solid").style.fills[0].color, { r: 18 / 255, g: 52 / 255, b: 86 / 255, a: .25 }); assert.equal(element("solid").opacity, .5); assert.equal(element("transparent").style.fills, undefined); });
      check("uniform border width style color", () => { const border = element("border").style.border; assert.equal(border.width, 2); assert.equal(border.style, "solid"); color(border.color, { r: 18 / 255, g: 52 / 255, b: 86 / 255, a: .5 }); for (const style of ["dashed", "dotted", "double"]) assert.equal(element(style).style.border.style, style); });
      check("uniform and per-corner radius", () => { assert.equal(element("radius").style.cornerRadius, 12.5); assert.deepEqual(element("corners").style.cornerRadius, { topLeft: 1.25, topRight: 2.5, bottomRight: 3.75, bottomLeft: 5 }); near(element("clamped").style.cornerRadius, 20.125, "used overlapping radius"); });
      check("single outer shadow and shadow-only grouping", () => { const shadow = element("shadow"); assert.equal(shadow.type, "frame"); assert.ok(shadow.children.some(node => node.type === "text")); assert.deepEqual(shadow.style.boxShadows[0], { offsetX: 0, offsetY: 4, blurRadius: 12, spreadRadius: 2.5, color: { r: 0, g: 0, b: 0, a: .15 }, inset: false }); });
      check("nested local opacity semantics", () => { assert.equal(element("outer").opacity, .5); assert.equal(element("inner").opacity, .5); assert.equal(element("inner").children[0].opacity, 1); });
      check("modern computed srgb fill", () => color(element("srgb").style.fills[0].color, { r: .2, g: .4, b: .6, a: .5 }));
    }
    if (name === "fidelity-limits") {
      check("unsupported features omitted with bounded deterministic warnings", () => { for (const code of ["SHADOW_UNSUPPORTED", "BACKGROUND_IMAGE_UNSUPPORTED", "BORDER_UNSUPPORTED", "RADIUS_UNSUPPORTED", "TRANSFORM_APPROXIMATED", "PAINT_ORDER_UNSUPPORTED", "POSITION_CONTEXT_UNSUPPORTED"]) assert.equal(doc.warnings.filter(w => w.code === code).length, 1, code); for (const id of ["multiple", "inset"]) assert.equal(element(id).style.boxShadows, undefined); assert.equal(element("complex-border").style.border, undefined); assert.equal(element("ellipse").style.cornerRadius, undefined); assert.equal(element("gradient").style.fills[0].color.a, 1); });
      check("transform browser box and DOM order", () => { boxesMatch(element("transform"), oracle.elements["transform"].box); const strings = all.filter(node => node.type === "text").map(node => node.characters); assert.ok(strings.indexOf("Transformed") < strings.indexOf("Stacked")); });
      check("hidden subtrees and fixed/sticky excluded", () => { for (const id of ["hidden", "zero", "invisible", "fixed", "sticky"]) assert.equal(element(id), undefined); assert.ok(!JSON.stringify(doc).includes("Hidden omitted")); assert.ok(all.some(node => node.type === "text" && node.characters === "Visible override")); });
      check("safe wrapper pruning", () => { assert.equal(element("contents"), undefined); assert.equal(element("pruned"), undefined); assert.ok(all.some(node => node.type === "text" && node.characters === "Display contents")); assert.ok(all.some(node => node.type === "text" && node.characters === "Plain wrapper")); });
    }
    if (name === "fidelity-assets") {
      check("image and svg node counts match fixture", () => {
        const images = all.filter(node => node.type === "image");
        const svgs = all.filter(node => node.type === "svg");
        assert.equal(images.length, 5, "expected 5 image nodes");
        assert.equal(svgs.length, 3, "expected 3 svg nodes");
      });
      check("image rendered geometry matches independent browser measurement", () => {
        for (const id of ["png-img", "relative-img", "duplicate-img", "data-img", "srcset-img"]) {
          boxesMatch(element(id), oracle.elements[id].box);
        }
      });
      check("asset registry references and duplicate deduplication", () => {
        const pngNode = element("png-img");
        const relNode = element("relative-img");
        const dupNode = element("duplicate-img");
        const srcNode = element("srcset-img");
        const dataNode = element("data-img");
        assert.equal(pngNode.assetId, relNode.assetId);
        assert.equal(pngNode.assetId, dupNode.assetId);
        assert.equal(pngNode.assetId, srcNode.assetId);
        assert.notEqual(pngNode.assetId, dataNode.assetId);
        const imgAssets = doc.assets.filter(a => a.kind === "image");
        assert.equal(imgAssets.length, 2, "expected exactly 2 image assets due to deduplication");
        const sharedAsset = doc.assets.find(a => a.id === pngNode.assetId);
        assert.equal(sharedAsset.source.type, "url");
        assert.equal(sharedAsset.source.url, origin + "/dot.png");
        assert.equal(sharedAsset.mimeType, "image/png");
        assert.deepEqual(sharedAsset.intrinsicDimensions, { width: 1, height: 1 });
      });
      check("object-fit cover captured on image node", () => {
        assert.equal(element("png-img").fit, "cover");
      });
      check("svg rendered geometry and serialized markup", () => {
        for (const id of ["inline-svg", "css-styled-svg", "defs-svg"]) {
          boxesMatch(element(id), oracle.elements[id].box);
          assert.ok(element(id).inlineSvg.length > 0);
          assert.ok(doc.assets.some(a => a.id === element(id).assetId && a.kind === "svg"));
        }
      });
      check("css styled svg inlines fill and stroke properties", () => {
        const svg = element("css-styled-svg");
        assert.ok(svg.inlineSvg.includes('fill="rgb(255, 64, 0)"') || svg.inlineSvg.includes('fill="color(srgb 1 0.25 0)"'));
        assert.ok(svg.inlineSvg.includes('stroke="rgb(0, 0, 0)"') || svg.inlineSvg.includes('stroke="color(srgb 0 0 0)"'));
        assert.ok(svg.inlineSvg.includes('stroke-width="2px"'));
      });
      check("svg defs and linearGradient preserved", () => {
        const svg = element("defs-svg");
        assert.ok(svg.inlineSvg.includes("linearGradient"));
        assert.ok(svg.inlineSvg.includes('id="grad1"'));
        assert.ok(svg.inlineSvg.includes('fill="url(#grad1)"'));
      });
      check("broken image produces rectangle box with IMAGE_UNAVAILABLE warning", () => {
        const broken = element("broken-img");
        assert.equal(broken.type, "rectangle");
        assert.equal(broken.sourceTag, "img");
        assert.ok(doc.warnings.some(w => w.code === "IMAGE_UNAVAILABLE" && w.nodeId === broken.id));
      });
      check("unsupported canvas and video produce explicit warnings", () => {
        const canvas = element("unsupported-canvas");
        const video = element("unsupported-video");
        assert.equal(canvas.type, "rectangle");
        assert.equal(video.type, "rectangle");
        assert.ok(doc.warnings.some(w => w.code === "CANVAS_UNSUPPORTED" && w.nodeId === canvas.id));
        assert.ok(doc.warnings.some(w => w.code === "MEDIA_UNSUPPORTED" && w.nodeId === video.id));
      });
    }
    if (name === "fidelity-pseudo") {
      const pseudo = (parentId, kind) => byId.get(oracle.elements[parentId].id + kind);
      check("plain text ::before and ::after capture", () => {
        const beforeNode = pseudo("before-text", "::before");
        assert.ok(beforeNode, "::before text node must exist");
        assert.equal(beforeNode.type, "text");
        assert.equal(beforeNode.sourceTag, "::before");
        assert.equal(beforeNode.characters, "Start: ");
        assert.equal(beforeNode.textStyle.fontWeight, 700);

        const afterNode = pseudo("after-text", "::after");
        assert.ok(afterNode, "::after text node must exist");
        assert.equal(afterNode.type, "text");
        assert.equal(afterNode.sourceTag, "::after");
        assert.equal(afterNode.characters, " :End");
        assert.equal(afterNode.textStyle.fontWeight, 700);
      });
      check("unicode glyph generated content", () => {
        const iconNode = pseudo("unicode-glyph", "::before");
        assert.ok(iconNode);
        assert.equal(iconNode.type, "text");
        assert.equal(iconNode.characters, "★");
        color(iconNode.textStyle.color, { r: 245 / 255, g: 158 / 255, b: 11 / 255, a: 1 });
      });
      check("decorative empty-content visual rectangle", () => {
        const box = pseudo("decorative-box", "::before");
        assert.ok(box);
        assert.equal(box.type, "rectangle");
        assert.equal(box.sourceTag, "::before");
        near(box.width, 16, "decorative width");
        near(box.height, 16, "decorative height");
        color(box.style.fills[0].color, { r: 16 / 255, g: 185 / 255, b: 129 / 255, a: 1 });
      });
      check("circular badge with border-radius", () => {
        const badge = pseudo("circular-badge", "::after");
        assert.ok(badge);
        assert.equal(badge.type, "rectangle");
        near(badge.width, 12, "badge width");
        near(badge.height, 12, "badge height");
        near(badge.style.cornerRadius, 6, "badge radius");
        color(badge.style.fills[0].color, { r: 239 / 255, g: 68 / 255, b: 68 / 255, a: 1 });
      });
      check("box with border and radius", () => {
        const box = pseudo("box-border-radius", "::before");
        assert.ok(box);
        assert.equal(box.type, "rectangle");
        near(box.width, 24, "box width");
        near(box.height, 24, "box height");
        assert.equal(box.style.cornerRadius, 4);
        assert.equal(box.style.border.width, 2);
        assert.equal(box.style.border.style, "solid");
      });
      check("pseudo with text and background decomposed into frame and child text", () => {
        const frame = pseudo("text-and-background", "::before");
        assert.ok(frame);
        assert.equal(frame.type, "frame");
        assert.equal(frame.sourceTag, "::before");
        near(frame.width, 44, "frame width");
        near(frame.height, 20, "frame height");
        color(frame.style.fills[0].color, { r: 239 / 255, g: 68 / 255, b: 68 / 255, a: 1 });
        assert.equal(frame.children.length, 1);
        const childText = frame.children[0];
        assert.equal(childText.id, frame.id + ":text");
        assert.equal(childText.type, "text");
        assert.equal(childText.characters, "NEW");
        color(childText.textStyle.color, { r: 1, g: 1, b: 1, a: 1 });
      });
      check("deterministic child order: ::before, real content, ::after", () => {
        const parent = element("both-before-after");
        assert.ok(parent);
        const children = parent.children;
        assert.ok(children.length >= 3, "expected at least 3 children in both-before-after container");
        assert.ok(children[0].id.endsWith("::before"));
        assert.ok(children[children.length - 1].id.endsWith("::after"));
      });
      check("nested element pseudo and local opacity", () => {
        const nested = pseudo("nested-child", "::before");
        assert.ok(nested);
        assert.equal(nested.characters, "• ");

        const ghost = pseudo("local-opacity", "::before");
        assert.ok(ghost);
        assert.equal(ghost.opacity, 0.5);
      });
      check("hidden and none pseudo-elements are omitted", () => {
        assert.equal(pseudo("hidden-pseudo", "::before"), undefined);
        assert.equal(pseudo("none-content", "::before"), undefined);
      });
      check("unsupported content, gradient, and transform warnings", () => {
        assert.equal(pseudo("unsupported-content", "::before"), undefined);
        assert.ok(doc.warnings.some(w => w.code === "PSEUDO_CONTENT_UNSUPPORTED"));
        assert.ok(doc.warnings.some(w => w.code === "BACKGROUND_IMAGE_UNSUPPORTED"));
        assert.ok(doc.warnings.some(w => w.code === "TRANSFORM_APPROXIMATED" && w.nodeId?.includes(oracle.elements["transformed-pseudo"].id)));
      });
    }
    await fs.writeFile(new URL(name + ".json", evidence), JSON.stringify(doc, null, 2));
  }
  await fs.writeFile(new URL("fidelity-results.json", evidence), JSON.stringify({ status: "PASS", checks: checks.length, scenarios: checks, extensionInstallManuallyVerified: false }, null, 2));
  console.info(JSON.stringify({ automatedRenderedChromeSmoke: "PASS", extensionInstallManuallyVerified: false,
    nodes: countNodes(first.document.root), textNodes: texts.length, warnings: first.document.warnings.map(warning => warning.code), scrollStable: true,
    schemaValid: true, idempotentContentInjection: true, renderedFidelityChecks: checks.length, fixturePages: names.length, evidence: evidence.href }, null, 2));
} finally {
  clearTimeout(timeout); socket?.close();
  for (const task of pending.values()) task.reject(new Error("Chrome smoke stopped"));
  if (child && child.exitCode === null) await new Promise(resolve => { child.once("exit", resolve); child.kill(); });
  await new Promise(resolve => server.close(resolve));
}
