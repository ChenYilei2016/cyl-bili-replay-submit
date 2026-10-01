import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const port = Number(process.env.PORT || 5817);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      response.writeHead(302, { Location: "/tests/demo.html" });
      response.end();
      return;
    }
    const relative = decodeURIComponent(url.pathname);
    const file = path.resolve(root, "." + relative);
    if (!file.startsWith(root) || !mime[path.extname(file)]) {
      response.writeHead(404); response.end("Not found"); return;
    }
    const data = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[path.extname(file)], "Cache-Control": "no-store" });
    response.end(data);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`交互演示（不会真实投稿）：http://127.0.0.1:${port}`));
