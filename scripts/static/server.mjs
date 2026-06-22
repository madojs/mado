import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

import { injectSnapshotMode } from "./serialize.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export async function createStaticCaptureServer({ outDir, shellHtml, records }) {
  const routeRecords = new Map(records.map((record) => [record.pathname, record]));

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const pathname = normalizePathname(url.pathname);

      const record = routeRecords.get(pathname);
      if (record) {
        sendHtml(res, injectSnapshotMode(shellHtml, record));
        return;
      }

      const file = await resolveStaticFile(outDir, pathname);
      if (file) {
        const data = await readFile(file);
        res.writeHead(200, {
          "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end(data);
        return;
      }

      if (!extname(pathname)) {
        sendHtml(res, injectSnapshotMode(shellHtml, { pathname, params: {} }));
        return;
      }

      res.writeHead(404, { "cache-control": "no-store" });
      res.end("not found");
    } catch (err) {
      res.writeHead(500, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(String(err?.stack ?? err));
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("[mado:static] failed to bind internal capture server.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}

async function resolveStaticFile(outDir, pathname) {
  const raw = pathname === "/" ? "/index.html" : pathname;
  const candidate = resolve(join(outDir, decodeURIComponent(raw)));
  if (!candidate.startsWith(resolve(outDir) + sep) && candidate !== resolve(outDir)) {
    return null;
  }
  try {
    const s = await stat(candidate);
    if (s.isFile()) return candidate;
    if (s.isDirectory()) {
      const index = join(candidate, "index.html");
      if ((await stat(index)).isFile()) return index;
    }
  } catch {
    /* not found */
  }
  return null;
}

function normalizePathname(pathname) {
  if (!pathname.startsWith("/")) return `/${pathname}`;
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}
