import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewerHtml = path.join(__dirname, "..", "templates", "map-viewer.html");

const MIME = {
  ".png": "image/png",
  ".json": "application/json",
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

// Serves the map viewer page at "/", and the crawl output directory
// (graph.json, images/*.png) as static files alongside it.
export function startViewer(mapDir, port) {
  const root = path.resolve(mapDir);
  const server = http.createServer((req, res) => {
    const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const filePath = reqPath === "/" || reqPath === "/index.html" ? viewerHtml : path.join(root, reqPath);

    if (filePath !== viewerHtml && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    });
  });
  server.listen(port);
  return server;
}
