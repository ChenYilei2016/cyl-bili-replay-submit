import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const port = Number(process.env.PORT || 5817);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      response.writeHead(302, { Location: "/tests/demo.html" });
      response.end();
      return;
    }
    const isPanelDemo = url.pathname.startsWith("/tests/panel/");
    const relative = isPanelDemo ? "/extension/" + url.pathname.slice("/tests/panel/".length)
      : ["/video/BV1DEMO11111/", "/1790439/upload/video"].includes(url.pathname) ? "/tests/download-demo.html" : decodeURIComponent(url.pathname);
    const file = path.resolve(root, "." + relative);
    if (!file.startsWith(root + path.sep) || !mime[path.extname(file)]) {
      response.writeHead(404); response.end("Not found"); return;
    }
    let data = await readFile(file);
    if (isPanelDemo && path.extname(file) === ".html") {
      data = Buffer.from(data.toString().replace('<script type="module"', '<script src="/tests/download-demo.js"></script><script type="module"'));
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)], "Cache-Control": "no-store" });
    response.end(data);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`交互演示（不会真实投稿）：http://127.0.0.1:${port}`));
