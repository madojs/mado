import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

import { injectSnapshotMode } from "./serialize.mjs";

/**
 * Normalise a Vite-style base into the canonical Mado form: `"/"` for the
 * root, otherwise `"/prefix/"` (leading and trailing slash, no doubles).
 * Mirrors src/router/base.ts.normalizeBase so the capture pipeline never
 * disagrees with the runtime router.
 */
function normalizeBase(raw) {
  if (!raw) return "/";
  let s = String(raw).trim();
  if (!s || s === "/") return "/";
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s = s + "/";
  return s.replace(/\/+/g, "/");
}

/**
 * Strip the active base prefix off a request pathname so the capture
 * server can look it up against route records (which are always
 * registered without a base).
 */
function stripBase(pathname, base) {
  const b = normalizeBase(base);
  if (!pathname) return "/";
  if (b === "/") return pathname.startsWith("/") ? pathname : "/" + pathname;
  if (pathname === b || pathname === b.slice(0, -1)) return "/";
  if (pathname.startsWith(b)) {
    const rest = pathname.slice(b.length - 1);
    return rest || "/";
  }
  return pathname;
}

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

/**
 * Internal HTTP server that hosts the Vite build output during snapshot
 * capture. It speaks the real deployment URL shape (the active Vite
 * `base` is honoured for both static routes and asset lookups), so the
 * runtime router sees the same `location.pathname` as production.
 */
export async function createStaticCaptureServer({ outDir, shellHtml, records, base = "/" }) {
  const normalizedBase = normalizeBase(base);
  const routeRecords = new Map(records.map((record) => [record.pathname, record]));

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const browserPath = normalizePathname(url.pathname);
      // The router uses BASE-FREE route pathnames, but assets in
      // `out/assets/...` are served from the same base-relative URLs the
      // production CDN exposes. Strip the active base before any record
      // lookup or file resolution so both halves use one consistent
      // pathname space.
      const routePath = stripBase(browserPath, normalizedBase);

      const record = routeRecords.get(routePath);
      if (record) {
        sendHtml(res, injectSnapshotMode(shellHtml, record));
        return;
      }

      const file = await resolveStaticFile(outDir, routePath);
      if (file) {
        const data = await readFile(file);
        res.writeHead(200, {
          "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end(data);
        return;
      }

      // SPA fallback: any non-asset path falls back to the snapshot shell
      // so client-side routing handles it. We use the original browser
      // pathname (not the stripped one) inside `injectSnapshotMode` so
      // that the runtime `location.pathname` matches production.
      if (!extname(routePath)) {
        sendHtml(
          res,
          injectSnapshotMode(shellHtml, { pathname: routePath, params: {} }),
        );
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
