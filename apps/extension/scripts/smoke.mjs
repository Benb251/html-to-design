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
const names = ["landing", "fidelity-geometry", "fidelity-text", "fidelity-styles", "fidelity-limits", "fidelity-assets", "fidelity-pseudo", "fidelity-gradients", "fidelity-borders-shadows", "fidelity-clipping", "fidelity-transforms", "fidelity-rich-text", "fidelity-auto-layout"];
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
  assert.ok(flatten(first.document.root).some(node => node.style?.border?.top?.width === 2));
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
      check("uniform border width style color", () => { const border = element("border").style.border; assert.equal(border.top.width, 2); assert.equal(border.top.style, "solid"); color(border.top.color, { r: 18 / 255, g: 52 / 255, b: 86 / 255, a: .5 }); for (const style of ["dashed", "dotted", "double"]) assert.equal(element(style).style.border.top.style, style); });
      check("uniform and per-corner radius", () => { assert.equal(element("radius").style.cornerRadius, 12.5); assert.deepEqual(element("corners").style.cornerRadius, { topLeft: 1.25, topRight: 2.5, bottomRight: 3.75, bottomLeft: 5 }); near(element("clamped").style.cornerRadius, 20.125, "used overlapping radius"); });
      check("single outer shadow and shadow-only grouping", () => { const shadow = element("shadow"); assert.equal(shadow.type, "frame"); assert.ok(shadow.children.some(node => node.type === "text")); assert.deepEqual(shadow.style.boxShadows[0], { offsetX: 0, offsetY: 4, blurRadius: 12, spreadRadius: 2.5, color: { r: 0, g: 0, b: 0, a: .15 }, inset: false }); });
      check("nested local opacity semantics", () => { assert.equal(element("outer").opacity, .5); assert.equal(element("inner").opacity, .5); assert.equal(element("inner").children[0].opacity, 1); });
      check("modern computed srgb fill", () => color(element("srgb").style.fills[0].color, { r: .2, g: .4, b: .6, a: .5 }));
    }
    if (name === "fidelity-limits") {
      check("unsupported features omitted with bounded deterministic warnings", () => { for (const code of ["BACKGROUND_IMAGE_UNSUPPORTED", "RADIUS_UNSUPPORTED", "PAINT_ORDER_UNSUPPORTED", "POSITION_CONTEXT_UNSUPPORTED"]) assert.equal(doc.warnings.filter(w => w.code === code).length, 1, code); assert.ok(element("transform").transform, "transform must be captured"); assert.equal(element("multiple").style.boxShadows.length, 2); assert.equal(element("inset").style.boxShadows.length, 1); assert.equal(element("complex-border").style.border.top.width, 2); assert.equal(element("complex-border").style.border.left.width, 4); assert.equal(element("ellipse").style.cornerRadius, undefined); assert.equal(element("bg-image").style.fills[0].color.a, 1); });
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
        assert.equal(box.style.border.top.width, 2);
        assert.equal(box.style.border.top.style, "solid");
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
      check("pseudo-element gradient captures native linear-gradient fill", () => {
        const gradPseudo = pseudo("gradient-pseudo", "::before");
        assert.ok(gradPseudo, "::before gradient node must exist");
        assert.equal(gradPseudo.type, "rectangle");
        assert.equal(gradPseudo.style?.fills?.[0]?.type, "linear-gradient");
        assert.equal(gradPseudo.style?.fills?.[0]?.angle, 135);
      });
      check("unsupported pseudo content and transform support", () => {
        assert.equal(pseudo("unsupported-content", "::before"), undefined);
        assert.ok(doc.warnings.some(w => w.code === "PSEUDO_CONTENT_UNSUPPORTED"));
        const transformedPseudo = pseudo("transformed-pseudo", "::before");
        assert.ok(transformedPseudo);
        assert.ok(transformedPseudo.transform, "pseudo must capture transform");
      });
    }
    if (name === "fidelity-gradients") {
      check("fidelity-gradients document valid V0.7 schema", () => {
        assert.equal(doc.schemaVersion, "0.7");
        assert.equal(safeParseDesignDocument(doc).success, true);
      });
      check("linear gradient default direction (to bottom = 180deg)", () => {
        const el = element("linear-default");
        assert.ok(el);
        const fill = el.style?.fills?.[0];
        assert.equal(fill?.type, "linear-gradient");
        assert.equal(fill.angle, 180);
        assert.equal(fill.stops.length, 2);
        color(fill.stops[0].color, { r: 1, g: 0, b: 0, a: 1 });
        color(fill.stops[1].color, { r: 0, g: 0, b: 1, a: 1 });
      });
      check("linear gradient keyword directions: to right, to bottom right", () => {
        const toRight = element("linear-to-right");
        assert.equal(toRight.style?.fills?.[0]?.angle, 90);

        const toBottomRight = element("linear-to-bottom-right");
        assert.ok(toBottomRight.style?.fills?.[0]?.angle !== undefined);
        near(toBottomRight.style.fills[0].angle, 120.96, "diagonal angle on 100x60");
      });
      check("linear gradient explicit angles: 45deg and -45deg", () => {
        const d45 = element("linear-45deg");
        assert.equal(d45.style?.fills?.[0]?.angle, 45);

        const dNeg45 = element("linear-neg-45deg");
        assert.equal(dNeg45.style?.fills?.[0]?.angle, 315);
      });
      check("multi-stop and implicit stop positions", () => {
        const three = element("linear-three-stop");
        assert.equal(three.style?.fills?.[0]?.stops.length, 3);
        near(three.style.fills[0].stops[0].position, 0, "stop 0");
        near(three.style.fills[0].stops[1].position, 0.5, "stop 1");
        near(three.style.fills[0].stops[2].position, 1, "stop 2");

        const implicit = element("linear-implicit-stops");
        assert.equal(implicit.style?.fills?.[0]?.stops.length, 3);
        near(implicit.style.fills[0].stops[1].position, 0.5, "implicit middle stop");
      });
      check("alpha gradient preserves stop alpha independently", () => {
        const alpha = element("linear-alpha");
        const fill = alpha.style?.fills?.[0];
        assert.equal(fill?.type, "linear-gradient");
        near(fill.stops[0].color.a, 0.5, "stop 0 alpha");
        near(fill.stops[1].color.a, 0.25, "stop 1 alpha");
      });
      check("hard stop duplicate positions preserved without deduplication", () => {
        const hard = element("linear-hard-stop");
        const fill = hard.style?.fills?.[0];
        assert.equal(fill?.stops.length, 4);
        near(fill.stops[1].position, 0.5, "hard stop 1");
        near(fill.stops[2].position, 0.5, "hard stop 2");
      });
      check("radial gradient baseline: default, circle, ellipse, and offset center", () => {
        const def = element("radial-default");
        assert.equal(def.style?.fills?.[0]?.type, "radial-gradient");
        near(def.style.fills[0].center.x, 0.5, "default center x");
        near(def.style.fills[0].center.y, 0.5, "default center y");

        const circle = element("radial-circle");
        assert.equal(circle.style?.fills?.[0]?.type, "radial-gradient");

        const ellipse = element("radial-ellipse");
        assert.equal(ellipse.style?.fills?.[0]?.type, "radial-gradient");

        const offset = element("radial-offset-center");
        assert.equal(offset.style?.fills?.[0]?.type, "radial-gradient");
        near(offset.style.fills[0].center.x, 0.25, "offset center x");
        near(offset.style.fills[0].center.y, 0.75, "offset center y");
      });
      check("ordered fill layers: gradient over solid background color", () => {
        const el = element("gradient-over-solid");
        assert.equal(el.style?.fills?.length, 2);
        assert.equal(el.style.fills[0].type, "linear-gradient");
        assert.equal(el.style.fills[1].type, "solid");
        color(el.style.fills[1].color, { r: 34 / 255, g: 34 / 255, b: 34 / 255, a: 1 });
      });
      check("synthetic pseudo-element captures gradient fill natively", () => {
        const pseudoNode = byId.get(oracle.elements["pseudo-gradient"].id + "::before");
        assert.ok(pseudoNode, "::before gradient node must exist");
        assert.equal(pseudoNode.type, "rectangle");
        assert.equal(pseudoNode.style?.fills?.[0]?.type, "linear-gradient");
        assert.equal(pseudoNode.style?.fills?.[0]?.angle, 90);
      });
      check("rectangular 45deg gradient geometry on 300x100 box", () => {
        const el = element("rectangular-45deg");
        assert.equal(el.width, 300);
        assert.equal(el.height, 100);
        assert.equal(el.style?.fills?.[0]?.type, "linear-gradient");
        assert.equal(el.style?.fills?.[0]?.angle, 45);
      });
      check("unsupported repeating, conic, hint, and url background warnings", () => {
        assert.ok(doc.warnings.some(w => w.code === "GRADIENT_TYPE_UNSUPPORTED"));
        assert.ok(doc.warnings.some(w => w.code === "GRADIENT_COLOR_HINT_APPROXIMATED"));
        assert.ok(doc.warnings.some(w => w.code === "BACKGROUND_IMAGE_UNSUPPORTED"));
      });
    }
    if (name === "fidelity-borders-shadows") {
      check("fidelity-borders-shadows document valid V0.7 schema", () => {
        assert.equal(doc.schemaVersion, "0.7");
        assert.equal(safeParseDesignDocument(doc).success, true);
      });
      check("1. uniform solid border regression", () => {
        const b = element("uniform-solid").style.border;
        assert.equal(b.top.width, 2);
        assert.equal(b.right.width, 2);
        assert.equal(b.bottom.width, 2);
        assert.equal(b.left.width, 2);
        assert.equal(b.top.style, "solid");
        color(b.top.color, { r: 37 / 255, g: 99 / 255, b: 235 / 255, a: 1 });
      });
      check("2. top-only border", () => {
        const b = element("top-only").style.border;
        assert.equal(b.top.width, 3);
        assert.equal(b.right.width, 0);
        assert.equal(b.bottom.width, 0);
        assert.equal(b.left.width, 0);
        assert.equal(b.top.style, "solid");
      });
      check("3. bottom-only border", () => {
        const b = element("bottom-only").style.border;
        assert.equal(b.top.width, 0);
        assert.equal(b.bottom.width, 4);
        assert.equal(b.bottom.style, "solid");
      });
      check("4. four different widths same color", () => {
        const b = element("four-widths").style.border;
        assert.equal(b.top.width, 1);
        assert.equal(b.right.width, 2);
        assert.equal(b.bottom.width, 3);
        assert.equal(b.left.width, 4);
      });
      check("5. same color different widths", () => {
        const b = element("same-color-diff-widths").style.border;
        assert.equal(b.top.width, 2);
        assert.equal(b.right.width, 4);
        assert.equal(b.bottom.width, 6);
        assert.equal(b.left.width, 8);
      });
      check("6. different side colors", () => {
        const b = element("diff-colors").style.border;
        assert.equal(b.top.width, 2);
        assert.equal(b.right.width, 3);
        assert.equal(b.bottom.width, 4);
        assert.equal(b.left.width, 5);
        color(b.top.color, { r: 239 / 255, g: 68 / 255, b: 68 / 255, a: 1 });
        color(b.right.color, { r: 59 / 255, g: 130 / 255, b: 246 / 255, a: 1 });
        color(b.bottom.color, { r: 16 / 255, g: 185 / 255, b: 129 / 255, a: 1 });
        color(b.left.color, { r: 245 / 255, g: 158 / 255, b: 11 / 255, a: 1 });
      });
      check("7. dashed border", () => {
        const b = element("dashed-border").style.border;
        assert.equal(b.top.style, "dashed");
        assert.equal(b.top.width, 2);
      });
      check("8. dotted border", () => {
        const b = element("dotted-border").style.border;
        assert.equal(b.top.style, "dotted");
        assert.equal(b.top.width, 2);
      });
      check("9. double border captured in schema", () => {
        const b = element("double-border").style.border;
        assert.equal(b.top.style, "double");
        assert.equal(b.top.width, 3);
      });
      check("10. rounded non-uniform border preserves radius and widths", () => {
        const el = element("rounded-non-uniform");
        assert.equal(el.style.cornerRadius, 8);
        assert.equal(el.style.border.top.width, 1);
        assert.equal(el.style.border.right.width, 3);
        assert.equal(el.style.border.bottom.width, 2);
        assert.equal(el.style.border.left.width, 4);
      });
      check("11. single drop-shadow regression", () => {
        const shadows = element("single-shadow").style.boxShadows;
        assert.equal(shadows.length, 1);
        assert.equal(shadows[0].inset, false);
        assert.equal(shadows[0].offsetX, 0);
        assert.equal(shadows[0].offsetY, 4);
        assert.equal(shadows[0].blurRadius, 6);
        assert.equal(shadows[0].spreadRadius, -1);
      });
      check("12. two drop shadows in order", () => {
        const shadows = element("two-shadows").style.boxShadows;
        assert.equal(shadows.length, 2);
        assert.equal(shadows[0].blurRadius, 6);
        assert.equal(shadows[1].blurRadius, 4);
      });
      check("13. three drop shadows in order", () => {
        const shadows = element("three-shadows").style.boxShadows;
        assert.equal(shadows.length, 3);
        assert.equal(shadows[0].blurRadius, 15);
        assert.equal(shadows[1].blurRadius, 6);
        assert.equal(shadows[2].blurRadius, 2);
      });
      check("14. inset shadow", () => {
        const shadows = element("inset-shadow").style.boxShadows;
        assert.equal(shadows.length, 1);
        assert.equal(shadows[0].inset, true);
        assert.equal(shadows[0].offsetY, 2);
        assert.equal(shadows[0].blurRadius, 4);
      });
      check("15. drop + inset combination", () => {
        const shadows = element("drop-inset-combo").style.boxShadows;
        assert.equal(shadows.length, 2);
        assert.equal(shadows[0].inset, false);
        assert.equal(shadows[1].inset, true);
      });
      check("16. positive spread", () => {
        const shadows = element("positive-spread").style.boxShadows;
        assert.equal(shadows[0].spreadRadius, 3);
      });
      check("17. negative spread", () => {
        const shadows = element("negative-spread").style.boxShadows;
        assert.equal(shadows[0].spreadRadius, -3);
      });
      check("18. alpha shadow", () => {
        const shadows = element("alpha-shadow").style.boxShadows;
        near(shadows[0].color.a, 0.25, "shadow alpha");
      });
      check("19. fractional shadow values", () => {
        const shadows = element("fractional-shadow").style.boxShadows;
        near(shadows[0].offsetX, 0.5, "shadow offsetX");
        near(shadows[0].offsetY, 1.5, "shadow offsetY");
        near(shadows[0].blurRadius, 3.5, "shadow blurRadius");
        near(shadows[0].spreadRadius, 0.5, "shadow spreadRadius");
      });
      check("20. pseudo-element non-uniform border", () => {
        const pseudoNode = byId.get(oracle.elements["pseudo-non-uniform"].id + "::before");
        assert.ok(pseudoNode, "pseudo-element ::before must exist");
        assert.equal(pseudoNode.style.border.top.width, 2);
        assert.equal(pseudoNode.style.border.bottom.width, 4);
      });
      check("21. pseudo-element inset shadow", () => {
        const pseudoNode = byId.get(oracle.elements["pseudo-inset"].id + "::after");
        assert.ok(pseudoNode, "pseudo-element ::after must exist");
        assert.equal(pseudoNode.style.boxShadows[0].inset, true);
      });
      check("22. gradient + border + multi-shadow combined", () => {
        const el = element("gradient-border-multi-shadow");
        assert.equal(el.style.fills[0].type, "linear-gradient");
        assert.equal(el.style.border.top.width, 1);
        assert.equal(el.style.border.left.width, 4);
        assert.equal(el.style.boxShadows.length, 2);
        assert.equal(el.style.boxShadows[0].inset, false);
        assert.equal(el.style.boxShadows[1].inset, true);
      });
    }
    if (name === "fidelity-clipping") {
      check("fidelity-clipping document valid V0.7 schema", () => {
        assert.equal(doc.schemaVersion, "0.7");
        assert.equal(safeParseDesignDocument(doc).success, true);
      });
      check("1. overflow:hidden both axes", () => {
        const el = element("clip-hidden-both");
        assert.deepEqual(el.clip, { x: true, y: true });
        assert.equal(el.children.length, 1);
      });
      check("2. overflow:clip both axes", () => {
        const el = element("clip-clip-both");
        assert.deepEqual(el.clip, { x: true, y: true });
      });
      check("3. no clipping / overflow:visible", () => {
        const el = element("clip-visible");
        assert.equal(el.clip, undefined);
      });
      check("4. child partly outside right edge preserves uncropped geometry", () => {
        const parent = element("child-partly-right");
        assert.deepEqual(parent.clip, { x: true, y: true });
        const child = parent.children[0];
        assert.equal(child.width, 70);
        near(child.x, parent.x + 111, "child x preserved");
      });
      check("5. child partly outside bottom edge preserves uncropped geometry", () => {
        const parent = element("child-partly-bottom");
        assert.deepEqual(parent.clip, { x: true, y: true });
        const child = parent.children[0];
        assert.equal(child.height, 60);
        near(child.y, parent.y + 46, "child y preserved");
      });
      check("6. child completely outside parent preserved in schema", () => {
        const parent = element("child-completely-outside");
        assert.deepEqual(parent.clip, { x: true, y: true });
        assert.equal(parent.children.length, 1);
        const child = parent.children[0];
        assert.equal(child.width, 60);
        assert.equal(child.height, 40);
        near(child.x, parent.x + 161, "completely outside child x");
        near(child.y, parent.y + 101, "completely outside child y");
      });
      check("7. negative child x/y preserved", () => {
        const parent = element("child-negative-xy");
        assert.deepEqual(parent.clip, { x: true, y: true });
        const child = parent.children[0];
        near(child.x, parent.x - 19, "negative child x");
        near(child.y, parent.y - 19, "negative child y");
      });
      check("8. nested clipping containers preserved independently", () => {
        const outer = element("nested-outer");
        assert.deepEqual(outer.clip, { x: true, y: true });
        const inner = element("nested-inner");
        assert.deepEqual(inner.clip, { x: true, y: true });
        assert.equal(inner.children.length, 1);
        const nestedChild = inner.children[0];
        assert.equal(nestedChild.width, 60);
      });
      check("9. rounded overflow-hidden card retains cornerRadius and clip", () => {
        const card = element("rounded-card");
        assert.deepEqual(card.clip, { x: true, y: true });
        assert.equal(card.style?.cornerRadius, 20);
      });
      check("10. image clipped by rounded frame", () => {
        const imgFrame = element("image-clipped-frame");
        assert.deepEqual(imgFrame.clip, { x: true, y: true });
        assert.equal(imgFrame.style?.cornerRadius, 16);
        assert.equal(imgFrame.children[0].type, "image");
        assert.equal(imgFrame.children[0].width, 160);
        assert.equal(imgFrame.children[0].height, 90);
      });
      check("11. gradient fill + clipping regression", () => {
        const el = element("gradient-clipping");
        assert.deepEqual(el.clip, { x: true, y: true });
        assert.equal(el.style?.cornerRadius, 12);
        assert.equal(el.style?.fills?.[0]?.type, "linear-gradient");
      });
      check("12. non-uniform border + clipping regression", () => {
        const el = element("border-clipping");
        assert.deepEqual(el.clip, { x: true, y: true });
        assert.equal(el.style?.cornerRadius, 12);
        assert.equal(el.style?.border?.top?.width, 2);
        assert.equal(el.style?.border?.right?.width, 4);
        assert.equal(el.style?.border?.bottom?.width, 6);
        assert.equal(el.style?.border?.left?.width, 8);
      });
      check("13. outer shadow + clipping regression", () => {
        const el = element("shadow-clipping");
        assert.deepEqual(el.clip, { x: true, y: true });
        assert.equal(el.style?.boxShadows?.length, 1);
        assert.equal(el.style?.boxShadows?.[0]?.inset, false);
      });
      check("14. pseudo ::before overflowing owner", () => {
        const pseudoBefore = byId.get(oracle.elements["pseudo-before-overflow"].id + "::before");
        assert.ok(pseudoBefore, "::before must exist");
        const owner = element("pseudo-before-overflow");
        assert.deepEqual(owner.clip, { x: true, y: true });
        assert.equal(pseudoBefore.width, 80);
        near(pseudoBefore.x, owner.x + 101, "pseudo-before x preserved");
      });
      check("15. pseudo ::after overflowing owner", () => {
        const pseudoAfter = byId.get(oracle.elements["pseudo-after-overflow"].id + "::after");
        assert.ok(pseudoAfter, "::after must exist");
        const owner = element("pseudo-after-overflow");
        assert.deepEqual(owner.clip, { x: true, y: true });
        assert.equal(pseudoAfter.width, 80);
        near(pseudoAfter.x, owner.x + 101, "pseudo-after x preserved");
      });
      check("16. absolute positioned child bounds preserved", () => {
        const parent = element("absolute-child-container");
        assert.deepEqual(parent.clip, { x: true, y: true });
        const child = parent.children[0];
        assert.equal(child.width, 90);
        near(child.x, parent.x - 29, "absolute child x preserved");
      });
      check("17. x-only clipping", () => {
        const el = element("clip-x-only");
        assert.deepEqual(el.clip, { x: true, y: false });
      });
      check("18. y-only clipping", () => {
        const el = element("clip-y-only");
        assert.deepEqual(el.clip, { x: false, y: true });
      });
      check("19. overflow:auto warning", () => {
        const el = element("clip-auto");
        assert.ok(doc.warnings.some(w => w.code === "SCROLL_CONTAINER_CLIPPING_DEFERRED" && w.nodeId === el.id));
      });
      check("20. overflow:scroll warning", () => {
        const el = element("clip-scroll");
        assert.ok(el);
        assert.ok(doc.warnings.some(w => w.code === "SCROLL_CONTAINER_CLIPPING_DEFERRED"));
      });
      check("21. overflow-clip-margin warning", () => {
        const el = element("clip-with-margin");
        assert.ok(doc.warnings.some(w => w.code === "OVERFLOW_CLIP_MARGIN_UNSUPPORTED" && w.nodeId === el.id));
      });
      check("22. transformed overflowing child retains transform", () => {
        const el = element("transformed-child-container");
        assert.deepEqual(el.clip, { x: true, y: true });
        const child = el.children[0];
        assert.ok(child.transform, "child must have transform captured");
        assert.ok(Math.abs(child.transform.matrix.b) > 0, "child matrix must capture rotation");
      });
    }
    if (name === "fidelity-transforms") {
      function computeTransformedAABB(baseBounds, matrix, origin) {
        const corners = [
          { x: baseBounds.x, y: baseBounds.y },
          { x: baseBounds.x + baseBounds.width, y: baseBounds.y },
          { x: baseBounds.x + baseBounds.width, y: baseBounds.y + baseBounds.height },
          { x: baseBounds.x, y: baseBounds.y + baseBounds.height },
        ];
        const ox = baseBounds.x + origin.x;
        const oy = baseBounds.y + origin.y;
        const transformed = corners.map(p => {
          const rx = p.x - ox;
          const ry = p.y - oy;
          return {
            x: ox + matrix.a * rx + matrix.c * ry + matrix.e,
            y: oy + matrix.b * rx + matrix.d * ry + matrix.f,
          };
        });
        const xs = transformed.map(p => p.x);
        const ys = transformed.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }

      function assertTransformedGeometry(nodeId, expectedAngleDeg, tolerance = 2) {
        const node = byId.get(nodeId) || element(nodeId);
        assert.ok(node.transform, `Node '${nodeId}' must have transform`);
        const { baseBounds, matrix, origin } = node.transform;
        const calc = computeTransformedAABB(baseBounds, matrix, origin);
        assert.ok(Math.abs(calc.x - node.x) <= tolerance, `Calculated x (${calc.x}) must match visual x (${node.x}) for ${nodeId}`);
        assert.ok(Math.abs(calc.y - node.y) <= tolerance, `Calculated y (${calc.y}) must match visual y (${node.y}) for ${nodeId}`);
        assert.ok(Math.abs(calc.width - node.width) <= tolerance, `Calculated width (${calc.width}) must match visual width (${node.width}) for ${nodeId}`);
        assert.ok(Math.abs(calc.height - node.height) <= tolerance, `Calculated height (${calc.height}) must match visual height (${node.height}) for ${nodeId}`);
        if (expectedAngleDeg !== undefined) {
          const rad = (expectedAngleDeg * Math.PI) / 180;
          const expectedA = Math.cos(rad);
          const expectedB = Math.sin(rad);
          assert.ok(Math.abs(matrix.a - expectedA) < 0.05, `matrix.a (${matrix.a}) must match expected cos (${expectedA}) for ${nodeId}`);
          assert.ok(Math.abs(matrix.b - expectedB) < 0.05, `matrix.b (${matrix.b}) must match expected sin (${expectedB}) for ${nodeId}`);
        }
      }

      check("1. schemaVersion is 0.7", () => {
        assert.equal(doc.schemaVersion, "0.7");
      });
      check("2. rotate 15deg exact matrix and AABB geometry", () => {
        assertTransformedGeometry("test-rotate-15", 15);
      });
      check("3. rotate -30deg exact matrix and AABB geometry", () => {
        assertTransformedGeometry("test-rotate-neg30", -30);
      });
      check("4. rotate 90deg exact matrix and AABB geometry", () => {
        assertTransformedGeometry("test-rotate-90", 90);
      });
      check("5. center origin resolution (50% 50%)", () => {
        const node = element("test-origin-center");
        assert.ok(node.transform);
        near(node.transform.origin.x, 50, "center origin x");
        near(node.transform.origin.y, 50, "center origin y");
        assertTransformedGeometry("test-origin-center", 45);
      });
      check("6. top-left origin resolution (0 0)", () => {
        const node = element("test-origin-top-left");
        assert.ok(node.transform);
        near(node.transform.origin.x, 0, "top-left origin x");
        near(node.transform.origin.y, 0, "top-left origin y");
        assertTransformedGeometry("test-origin-top-left", 45);
      });
      check("7. custom percentage origin resolution (25% 75%)", () => {
        const node = element("test-origin-custom");
        assert.ok(node.transform);
        near(node.transform.origin.x, 25, "custom origin x 25%");
        near(node.transform.origin.y, 75, "custom origin y 75%");
        assertTransformedGeometry("test-origin-custom", 45);
      });
      check("8. translateX captures translation matrix", () => {
        const node = element("test-translate-x");
        assert.ok(node.transform);
        near(node.transform.matrix.e, 30, "matrix.e translation x");
        near(node.transform.matrix.f, 0, "matrix.f translation y");
        assertTransformedGeometry("test-translate-x", 0);
      });
      check("9. translateY captures translation matrix", () => {
        const node = element("test-translate-y");
        assert.ok(node.transform);
        near(node.transform.matrix.e, 0, "matrix.e translation x");
        near(node.transform.matrix.f, 20, "matrix.f translation y");
        assertTransformedGeometry("test-translate-y", 0);
      });
      check("10. translate(x,y) captures dual translation", () => {
        const node = element("test-translate-xy");
        assert.ok(node.transform);
        near(node.transform.matrix.e, 40, "matrix.e translation x");
        near(node.transform.matrix.f, 25, "matrix.f translation y");
        assertTransformedGeometry("test-translate-xy", 0);
      });
      check("11. rotate + translate combined transform", () => {
        const node = element("test-rotate-translate");
        assert.ok(node.transform);
        assertTransformedGeometry("test-rotate-translate");
      });
      check("12. uniform scale transform", () => {
        const node = element("test-scale-uniform");
        assert.ok(node.transform);
        near(node.transform.matrix.a, 1.5, "scale uniform x");
        near(node.transform.matrix.d, 1.5, "scale uniform y");
        assertTransformedGeometry("test-scale-uniform");
      });
      check("13. scale down (< 1) transform", () => {
        const node = element("test-scale-down");
        assert.ok(node.transform);
        near(node.transform.matrix.a, 0.6, "scale down x");
        near(node.transform.matrix.d, 0.6, "scale down y");
        assertTransformedGeometry("test-scale-down");
      });
      check("14. non-uniform scale emits TRANSFORM_SCALE_APPROXIMATED", () => {
        const node = element("test-scale-nonuniform");
        assert.ok(node.transform);
        near(node.transform.matrix.a, 1.5, "scale x");
        near(node.transform.matrix.d, 0.8, "scale y");
        assert.ok(doc.warnings.some(w => w.code === "TRANSFORM_SCALE_APPROXIMATED" && w.nodeId === node.id));
      });
      check("15. reflection scaleX(-1) emits TRANSFORM_REFLECTION_UNSUPPORTED", () => {
        const node = element("test-reflection");
        assert.ok(node.transform);
        assert.ok(node.transform.matrix.a < 0, "matrix.a negative for reflection");
        assert.ok(doc.warnings.some(w => w.code === "TRANSFORM_REFLECTION_UNSUPPORTED" && w.nodeId === node.id));
      });
      check("16. skewX captures skew matrix and warning", () => {
        const node = element("test-skew-x");
        assert.ok(node.transform);
        assert.ok(Math.abs(node.transform.matrix.c) > 0.2, "matrix.c for skewX");
        assert.ok(doc.warnings.some(w => w.code === "TRANSFORM_SKEW_APPROXIMATED" && w.nodeId === node.id));
      });
      check("17. skewY captures skew matrix and warning", () => {
        const node = element("test-skew-y");
        assert.ok(node.transform);
        assert.ok(Math.abs(node.transform.matrix.b) > 0.2, "matrix.b for skewY");
        assert.ok(doc.warnings.some(w => w.code === "TRANSFORM_SKEW_APPROXIMATED"));
      });
      check("18. matrix(...) 2D affine normalized", () => {
        const node = element("test-matrix-2d");
        assert.ok(node.transform);
        near(node.transform.matrix.a, 1, "matrix a");
        near(node.transform.matrix.b, 0.2, "matrix b");
        near(node.transform.matrix.e, 10, "matrix e");
        near(node.transform.matrix.f, 20, "matrix f");
      });
      check("19. reducible 2D matrix3d collapsed to 2D", () => {
        const node = element("test-matrix3d-reducible");
        assert.ok(node.transform);
        near(node.transform.matrix.e, 15, "matrix e");
        near(node.transform.matrix.f, 25, "matrix f");
      });
      check("20. true 3D transform unsupported warning", () => {
        const node = element("test-true-3d");
        assert.ok(doc.warnings.some(w => w.code === "TRANSFORM_3D_UNSUPPORTED" && w.nodeId === node.id));
      });
      check("21. rotated text remains editable TextNode", () => {
        const node = element("test-rotated-text");
        assert.equal(node.type, "text");
        assert.equal(node.characters, "Rotated Editable Heading");
        assert.ok(node.transform);
        assertTransformedGeometry("test-rotated-text", 10);
      });
      check("22. rotated image remains ImageNode with transform", () => {
        const node = element("test-rotated-image");
        assert.equal(node.type, "image");
        assert.ok(node.transform);
        assertTransformedGeometry("test-rotated-image", 20);
      });
      check("23. rotated SVG logical node", () => {
        const node = element("test-rotated-svg");
        assert.equal(node.type, "svg");
        assert.ok(node.transform);
        assertTransformedGeometry("test-rotated-svg", -15);
      });
      check("24. rotated frame with preserved children", () => {
        const node = element("test-rotated-frame");
        assert.equal(node.type, "frame");
        assert.ok(node.transform);
        assert.equal(node.children.length, 1);
        assert.equal(node.children[0].type, "frame");
      });
      check("25. nested rotated parent + child hierarchy", () => {
        const parent = element("test-nested-parent");
        assert.equal(parent.type, "frame");
        assert.ok(parent.transform);
        const child = element("test-nested-child");
        assert.ok(child.transform);
      });
      check("26. clipping container with rotated child", () => {
        const clipFrame = element("test-clip-rotated");
        assert.deepEqual(clipFrame.clip, { x: true, y: true });
        const child = element("test-clip-rotated-child");
        assert.ok(child.transform);
        assertTransformedGeometry("test-clip-rotated-child", 45);
      });
      check("27. gradient fill + rotation regression", () => {
        const node = element("test-gradient-rotation");
        assert.equal(node.style?.fills?.[0]?.type, "linear-gradient");
        assert.ok(node.transform);
        assertTransformedGeometry("test-gradient-rotation", 25);
      });
      check("28. border + rotation regression", () => {
        const node = element("test-border-rotation");
        assert.equal(node.style?.border?.top?.width, 2);
        assert.equal(node.style?.border?.right?.width, 4);
        assert.equal(node.style?.border?.bottom?.width, 6);
        assert.equal(node.style?.border?.left?.width, 8);
        assert.ok(node.transform);
        assertTransformedGeometry("test-border-rotation", -20);
      });
      check("29. multi-shadow + rotation regression", () => {
        const node = element("test-shadow-rotation");
        assert.equal(node.style?.boxShadows?.length, 2);
        assert.ok(node.transform);
        assertTransformedGeometry("test-shadow-rotation", 15);
      });
      check("30. pseudo-element rotation captured", () => {
        const pseudo = byId.get(oracle.elements["test-pseudo-rotation"].id + "::before");
        assert.ok(pseudo, "::before must exist");
        assert.ok(pseudo.transform, "pseudo must have transform");
        assertTransformedGeometry(pseudo.id, 30);
      });
      check("31. fractional geometry preserved", () => {
        const node = element("test-fractional-geom");
        assert.ok(node.transform);
        near(node.transform.baseBounds.width, 100.5, "fractional width");
        near(node.transform.baseBounds.height, 60.25, "fractional height");
      });
    }
    if (name === "fidelity-rich-text") {
      check("fidelity-rich-text document valid V0.7 schema", () => {
        assert.equal(doc.schemaVersion, "0.7");
        assert.equal(safeParseDesignDocument(doc).success, true);
      });
      check("1. plain text regression remains single TextNode without runs", () => {
        const el = all.find(n => n.characters === "Plain simple paragraph text without any inline styling.");
        assert.ok(el, "plain text node must exist");
        assert.equal(el.type, "text");
        assert.equal(el.runs, undefined);
      });
      check("2. strong produces single TextNode with bold run", () => {
        const el = element("test-strong");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "Prefix bold text suffix.");
        assert.ok(el.runs && el.runs.length >= 3);
        const boldRun = el.runs.find(r => r.style.fontWeight >= 700);
        assert.ok(boldRun);
        assert.equal(el.characters.slice(boldRun.start, boldRun.end), "bold text");
      });
      check("3. em produces single TextNode with italic run", () => {
        const el = element("test-em");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "Prefix italic text suffix.");
        assert.ok(el.runs && el.runs.length >= 3);
        const italicRun = el.runs.find(r => r.style.fontStyle === "italic");
        assert.ok(italicRun);
        assert.equal(el.characters.slice(italicRun.start, italicRun.end), "italic text");
      });
      check("4. strong + em nested inherits both bold and italic", () => {
        const el = element("test-strong-em");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "normal bold bold-italic normal.");
        assert.ok(el.runs && el.runs.length >= 4);
        const boldItalicRun = el.runs.find(r => r.style.fontWeight >= 700 && r.style.fontStyle === "italic");
        assert.ok(boldItalicRun);
        assert.equal(el.characters.slice(boldItalicRun.start, boldItalicRun.end), "bold-italic");
      });
      check("5. colored span produces color run", () => {
        const el = element("test-color");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "black red text black.");
        assert.ok(el.runs && el.runs.length >= 3);
        const redRun = el.runs.find(r => r.style.color && r.style.color.r > 0.8 && r.style.color.g < 0.4);
        assert.ok(redRun);
        assert.equal(el.characters.slice(redRun.start, redRun.end), "red text");
      });
      check("6. mixed font sizes in single TextNode", () => {
        const el = element("test-mixed-size");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "normal large text normal.");
        assert.ok(el.runs && el.runs.length >= 3);
        const largeRun = el.runs.find(r => r.style.fontSize === 24);
        assert.ok(largeRun);
        assert.equal(el.characters.slice(largeRun.start, largeRun.end), "large text");
      });
      check("7. mixed font families in single TextNode", () => {
        const el = element("test-mixed-family");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "normal roboto text normal.");
        assert.ok(el.runs && el.runs.length >= 3);
        const robotoRun = el.runs.find(r => r.style.fontFamily === "Roboto");
        assert.ok(robotoRun);
        assert.equal(el.characters.slice(robotoRun.start, robotoRun.end), "roboto text");
      });
      check("8. unavailable font fallback", () => {
        const el = element("test-font-fallback");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "normal fallback text normal.");
        assert.ok(el.runs && el.runs.length >= 3);
        const fbRun = el.runs.find(r => r.style.fontFamily === "NonExistentFontXYZ");
        assert.ok(fbRun);
      });
      check("9. letter spacing run preserved", () => {
        const el = element("test-letter-spacing");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "normal spaced text normal.");
        assert.ok(el.runs && el.runs.length >= 3);
        const lsRun = el.runs.find(r => r.style.letterSpacing === 2);
        assert.ok(lsRun);
      });
      check("10. line-height difference preserved", () => {
        const el = element("test-line-height");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "normal tall line text normal.");
        assert.ok(el.runs && el.runs.length >= 3);
        const lhRun = el.runs.find(r => r.style.lineHeight === 32);
        assert.ok(lhRun);
      });
      check("11. underline text decoration preserved", () => {
        const el = element("test-underline");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "normal underlined text normal.");
        assert.ok(el.runs && el.runs.length >= 3);
        const uRun = el.runs.find(r => r.style.textDecoration === "underline");
        assert.ok(uRun);
        assert.equal(el.characters.slice(uRun.start, uRun.end), "underlined text");
      });
      check("12. line-through text decoration preserved", () => {
        const el = element("test-linethrough");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "normal strike text normal.");
        assert.ok(el.runs && el.runs.length >= 3);
        const sRun = el.runs.find(r => r.style.textDecoration === "line-through");
        assert.ok(sRun);
        assert.equal(el.characters.slice(sRun.start, sRun.end), "strike text");
      });
      check("13. anchor hyperlink captured as run metadata", () => {
        const el = element("test-link");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "Visit example link now.");
        assert.ok(el.runs && el.runs.length >= 3);
        const linkRun = el.runs.find(r => r.hyperlink === "https://example.com/single");
        assert.ok(linkRun);
        assert.equal(el.characters.slice(linkRun.start, linkRun.end), "example link");
      });
      check("14. multiple distinct hyperlinks preserved", () => {
        const el = element("test-multi-link");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "Link first and second link.");
        assert.ok(el.runs);
        const link1 = el.runs.find(r => r.hyperlink === "https://example.com/one");
        const link2 = el.runs.find(r => r.hyperlink === "https://example.com/two");
        assert.ok(link1 && link2);
        assert.equal(el.characters.slice(link1.start, link1.end), "first");
        assert.equal(el.characters.slice(link2.start, link2.end), "second");
      });
      check("15. nested styled spans properly resolved", () => {
        const el = element("test-nested-spans");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "outer mid inner blue mid outer.");
        assert.ok(el.runs);
        const innerBlue = el.runs.find(r => r.style.fontSize === 20 && r.style.color && r.style.color.b > 0.8);
        assert.ok(innerBlue);
        assert.equal(el.characters.slice(innerBlue.start, innerBlue.end), "inner blue");
      });
      check("16. <br> becomes newline with preserved offsets", () => {
        const el = element("test-br");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "first line\nsecond bold line.");
        assert.ok(el.runs);
        const boldRun = el.runs.find(r => r.style.fontWeight >= 700);
        assert.ok(boldRun);
        assert.equal(el.characters.slice(boldRun.start, boldRun.end), "second bold line");
      });
      check("17. whitespace properly normalized across inline elements", () => {
        const el = element("test-whitespace");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "word1 word2 word3");
        assert.ok(el.runs && el.runs.length === 2);
        assert.equal(el.characters.slice(el.runs[0].start, el.runs[0].end), "word1 word2 ");
        assert.equal(el.characters.slice(el.runs[1].start, el.runs[1].end), "word3");
      });
      check("18. emoji around styled ranges accurately indexed", () => {
        const el = element("test-emoji");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "Hello 👋 bold 🌍 world.");
        assert.ok(el.runs);
        const boldRun = el.runs.find(r => r.style.fontWeight >= 700);
        assert.ok(boldRun);
        assert.equal(el.characters.slice(boldRun.start, boldRun.end), "bold 🌍");
      });
      check("19. code tag preserves monospace inline font", () => {
        const el = element("test-code");
        assert.equal(el.type, "text");
        assert.equal(el.characters, "Run npm test command.");
        assert.ok(el.runs);
        const codeRun = el.runs.find(r => r.style.fontFamily?.toLowerCase().includes("mono") || r.style.fontFamily?.toLowerCase().includes("courier"));
        assert.ok(codeRun);
        assert.equal(el.characters.slice(codeRun.start, codeRun.end), "npm test");
      });
      check("20. multiline wrapped paragraph remains single TextNode", () => {
        const el = element("test-multiline");
        assert.equal(el.type, "text");
        assert.ok(el.characters.includes("This is a paragraph that wraps across multiple lines"));
        assert.ok(el.runs);
        const boldRun = el.runs.find(r => r.style.fontWeight >= 700);
        assert.ok(boldRun);
        assert.equal(el.characters.slice(boldRun.start, boldRun.end), "bold text");
      });
      check("21. rich text inside transformed container", () => {
        const container = element("test-transformed-container");
        assert.ok(container.transform);
        const textChild = container.children[0];
        assert.equal(textChild.type, "text");
        assert.ok(textChild.runs);
      });
      check("22. rich TextNode itself rotated preserves transform and runs", () => {
        const el = element("test-rotated-text");
        assert.equal(el.type, "text");
        assert.ok(el.transform, "rotated text must have transform");
        assert.ok(el.runs);
      });
      check("23. clipping parent around rich text", () => {
        const clipFrame = element("test-clipped-parent");
        assert.deepEqual(clipFrame.clip, { x: true, y: true });
        const textChild = clipFrame.children[0];
        assert.equal(textChild.type, "text");
        assert.ok(textChild.runs);
      });
      check("24. inline background preserved as independent node", () => {
        const p = element("test-inline-bg");
        assert.ok(p.children.some(c => c.style?.fills?.length > 0), "highlight span must retain independent fill box");
      });
      check("25. inline border and padding prevents unsafe collapse", () => {
        const p = element("test-inline-border-padding");
        assert.ok(p.children.some(c => c.style?.border), "boxed span must retain border box");
      });
      check("26. inline-block child remains independent layout box", () => {
        const p = element("test-inline-block");
        assert.ok(p.children.length > 1, "inline-block badge must not collapse into text runs");
      });
      check("27. image embedded splits text flow and emits warning", () => {
        const p = element("test-embedded-img");
        assert.ok(p.children.some(c => c.type === "image"), "image node preserved");
        assert.ok(doc.warnings.some(w => w.code === "RICH_TEXT_EMBEDDED_NODE_SPLIT"));
      });
      check("28. pseudo-generated text preserved", () => {
        const pseudo = byId.get(oracle.elements["test-pseudo"].id + "::before");
        assert.ok(pseudo, "pseudo element must exist");
        assert.equal(pseudo.type, "text");
      });
      check("29. text-transform retains warning", () => {
        assert.ok(element("test-text-transform"));
        assert.ok(doc.warnings.some(w => w.code === "TEXT_TRANSFORM_UNSUPPORTED"));
      });
      check("30. gradient text unsupported warning", () => {
        assert.ok(element("test-gradient-text"));
        assert.ok(doc.warnings.some(w => w.code === "TEXT_GRADIENT_UNSUPPORTED"));
      });
    }
    if (name === "fidelity-auto-layout") {
      check("1. simple horizontal row", () => {
        const row = element("test-row-simple");
        assert.ok(row.layout);
        assert.equal(row.layout.direction, "horizontal");
        assert.equal(row.layout.gap, 0);
        assert.equal(row.layout.confidence, "high");
      });
      check("2. simple vertical column", () => {
        const col = element("test-col-simple");
        assert.ok(col.layout);
        assert.equal(col.layout.direction, "vertical");
      });
      check("3. horizontal gap", () => {
        const row = element("test-gap-row");
        assert.ok(row.layout);
        assert.equal(row.layout.direction, "horizontal");
        assert.equal(row.layout.gap, 16);
      });
      check("4. vertical gap", () => {
        const col = element("test-gap-col");
        assert.ok(col.layout);
        assert.equal(col.layout.direction, "vertical");
        assert.equal(col.layout.gap, 12);
      });
      check("5. asymmetric padding", () => {
        const row = element("test-padding-asym");
        assert.ok(row.layout);
        assert.deepEqual(row.layout.padding, { top: 10, right: 20, bottom: 15, left: 30 });
      });
      check("6. justify start", () => {
        const row = element("test-justify-start");
        assert.ok(row.layout);
        assert.equal(row.layout.primaryAlign, "start");
      });
      check("7. justify center", () => {
        const row = element("test-justify-center");
        assert.ok(row.layout);
        assert.equal(row.layout.primaryAlign, "center");
      });
      check("8. justify end", () => {
        const row = element("test-justify-end");
        assert.ok(row.layout);
        assert.equal(row.layout.primaryAlign, "end");
      });
      check("9. space-between", () => {
        const row = element("test-justify-space-between");
        assert.ok(row.layout);
        assert.equal(row.layout.primaryAlign, "space-between");
      });
      check("10. align start", () => {
        const row = element("test-align-start");
        assert.ok(row.layout);
        assert.equal(row.layout.crossAlign, "start");
      });
      check("11. align center", () => {
        const row = element("test-align-center");
        assert.ok(row.layout);
        assert.equal(row.layout.crossAlign, "center");
      });
      check("12. align end", () => {
        const row = element("test-align-end");
        assert.ok(row.layout);
        assert.equal(row.layout.crossAlign, "end");
      });
      check("13. stretch", () => {
        const row = element("test-align-stretch");
        assert.ok(row.layout);
        assert.equal(row.layout.crossAlign, "stretch");
      });
      check("14. nested row inside column", () => {
        const col = element("test-nested-row-in-col");
        const innerRow = element("test-inner-row");
        assert.ok(col.layout);
        assert.equal(col.layout.direction, "vertical");
        assert.ok(innerRow.layout);
        assert.equal(innerRow.layout.direction, "horizontal");
      });
      check("15. nested column inside row", () => {
        const row = element("test-nested-col-in-row");
        const innerCol = element("test-inner-col");
        assert.ok(row.layout);
        assert.equal(row.layout.direction, "horizontal");
        assert.ok(innerCol.layout);
        assert.equal(innerCol.layout.direction, "vertical");
      });
      check("16. flex-grow:1 child", () => {
        const row = element("test-grow-child");
        assert.ok(row.layout);
        assert.ok(row.children.every(c => c.layoutChild?.grow));
      });
      check("17. fixed siblings + grow child", () => {
        const row = element("test-fixed-and-grow");
        assert.ok(row.layout);
        assert.equal(row.children[0].layoutChild?.grow, undefined);
        assert.equal(row.children[1].layoutChild?.grow, true);
      });
      check("18. absolute positioned overlay child", () => {
        const row = element("test-abs-child");
        assert.ok(row.layout);
        const absChild = row.children.find(c => c.layoutChild?.positioning === "absolute");
        assert.ok(absChild, "absolute badge must have layoutChild.positioning = absolute");
      });
      check("19. rich text as flex child", () => {
        const row = element("test-rich-text-child");
        assert.ok(row.layout);
        const textChild = row.children.find(c => c.type === "text");
        assert.ok(textChild, "text child must exist in flex row");
        assert.ok(textChild.runs, "rich text runs must be preserved");
      });
      check("20. image as flex child", () => {
        const row = element("test-image-child");
        assert.ok(row.layout);
        assert.ok(row.children.some(c => c.type === "image"));
      });
      check("21. SVG as flex child", () => {
        const row = element("test-svg-child");
        assert.ok(row.layout);
        assert.ok(row.children.some(c => c.type === "svg"));
      });
      check("22. clipping Auto Layout frame", () => {
        const row = element("test-clipping-autolayout");
        assert.ok(row.layout);
        assert.deepEqual(row.clip, { x: true, y: true });
      });
      check("23. gradient Auto Layout frame", () => {
        const row = element("test-gradient-autolayout");
        assert.ok(row.layout);
        assert.ok(row.style?.fills?.some(f => f.type === "linear-gradient"));
      });
      check("24. border/shadow Auto Layout frame", () => {
        const row = element("test-border-shadow-autolayout");
        assert.ok(row.layout);
        assert.ok(row.style?.border);
        assert.ok(row.style?.boxShadows?.length > 0);
      });
      check("25. transformed child using baseBounds", () => {
        const row = element("test-transformed-child");
        assert.ok(row.layout);
        const rotatedChild = row.children.find(c => c.transform);
        assert.ok(rotatedChild, "transformed child must retain transform");
        assert.ok(rotatedChild.transform.baseBounds);
      });
      check("26. transformed Auto Layout frame", () => {
        const row = element("test-transformed-autolayout");
        assert.ok(row.layout);
        assert.ok(row.transform, "transformed frame must retain transform");
      });
      check("27. pseudo child interaction", () => {
        const row = element("test-pseudo-child");
        assert.ok(row.layout);
        assert.ok(row.children.length >= 2, "pseudo element must be a child of flex row");
      });
      check("28. flex-wrap rejected", () => {
        const row = element("test-flex-wrap-rejected");
        assert.equal(row.layout, undefined);
        assert.ok(doc.warnings.some(w => w.code === "AUTO_LAYOUT_WRAP_DEFERRED"));
      });
      check("29. row-reverse rejected", () => {
        const row = element("test-reverse-rejected");
        assert.equal(row.layout, undefined);
        assert.ok(doc.warnings.some(w => w.code === "AUTO_LAYOUT_REVERSE_DEFERRED"));
      });
      check("30. non-zero child margins rejected", () => {
        const row = element("test-margins-rejected");
        assert.equal(row.layout, undefined);
        assert.ok(doc.warnings.some(w => w.code === "AUTO_LAYOUT_MARGIN_DEFERRED"));
      });
      check("31. order property rejected", () => {
        const row = element("test-order-rejected");
        assert.equal(row.layout, undefined);
        assert.ok(doc.warnings.some(w => w.code === "AUTO_LAYOUT_ORDER_DEFERRED"));
      });
      check("32. baseline alignment rejected", () => {
        const row = element("test-baseline-rejected");
        assert.equal(row.layout, undefined);
        assert.ok(doc.warnings.some(w => w.code === "AUTO_LAYOUT_BASELINE_DEFERRED"));
      });
      check("33. complex grow ratios rejected", () => {
        const row = element("test-complex-grow-rejected");
        assert.equal(row.layout, undefined);
        assert.ok(doc.warnings.some(w => w.code === "AUTO_LAYOUT_GROW_RATIO_DEFERRED"));
      });
      check("34. grid container deferred", () => {
        const grid = element("test-grid-deferred");
        assert.equal(grid.layout, undefined);
        assert.ok(doc.warnings.some(w => w.code === "GRID_LAYOUT_SEMANTICS_DEFERRED"));
      });
      check("35. plain non-flex absolute regression", () => {
        const plain = element("test-plain-non-flex");
        assert.equal(plain.layout, undefined);
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
