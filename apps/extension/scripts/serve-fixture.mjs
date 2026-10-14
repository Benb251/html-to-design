import http from "node:http";
import { readFile } from "node:fs/promises";
const names = ["landing", "fidelity-geometry", "fidelity-text", "fidelity-styles", "fidelity-limits", "fidelity-assets", "fidelity-pseudo", "fidelity-gradients", "fidelity-borders-shadows", "fidelity-clipping", "fidelity-transforms"];
const fixtures = new Map(await Promise.all(names.map(async name => ["/" + name + ".html", await readFile(new URL("../fixtures/" + name + ".html", import.meta.url))])));
const dotPng = await readFile(new URL("../fixtures/dot.png", import.meta.url));
const server = http.createServer((request, response) => {
  if (request.url === "/dot.png") {
    response.writeHead(200, { "content-type": "image/png" });
    response.end(dotPng);
    return;
  }
  const html = fixtures.get(request.url === "/" ? "/landing.html" : request.url);
  if (!html) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html);
});
server.listen(4173, "127.0.0.1", () => console.info("Manual fixture: http://127.0.0.1:4173/ — Ctrl+C to stop."));
