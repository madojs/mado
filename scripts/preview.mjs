// Preview: a tiny production-like server that serves exactly out/ on node:http.
//
//   mado preview
//
// What it does:
//   1. Serves OUT_DIR or `out/`.
//   2. If `out/` is missing AND we are in a project root, refuses to run and
//      points the user at `mado release`. Auto-build is opt-in via
//      PREVIEW_AUTOBUILD=1.
//   3. Starts a static server with:
//        - immutable cache for hashed bundles;
//        - SPA fallback to _mado/spa.html when present, else index.html;
//        - exact `out/` route files before SPA fallback;
//        - precompressed .gz / .br serving via Accept-Encoding.
//
// Goal: see production-like output locally without Docker/nginx, identical to
// what a static host (nginx / Cloudflare Pages / S3) would serve.

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat, access } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import { configureLogger, logger } from "./logger.mjs";

// Tiny argv parser. Supports --flag, --flag=value, --flag value.
function parsePreviewArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const name = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    }
  }
  return flags;
}

const PREVIEW_FLAGS = parsePreviewArgs(configureLogger(process.argv.slice(2)));

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, process.env.OUT_DIR ?? "out");
const PORT = Number(PREVIEW_FLAGS.port ?? process.env.PORT ?? 4173);
const HOST = String(PREVIEW_FLAGS.host ?? process.env.HOST ?? "localhost");
const AUTOBUILD = process.env.PREVIEW_AUTOBUILD === "1";
const SKIP_BUILD = process.env.SKIP_BUILD === "1" || !AUTOBUILD;

// Active Vite base. We try the internal build bridge first (the
// `@madojs/mado/vite` plugin writes `_mado/build.json` during `vite
// build`); if `mado static` has already dropped that file before
// shipping the production artifact, we fall back to parsing the asset
// prefix out of `out/index.html`. Both paths converge on the same
// canonical "/" or "/prefix/" form so the preview server replays the
// real deployment URL shape regardless of pipeline stage.
const BASE = detectDeployedBase(OUT);

function detectDeployedBase(out) {
  const fromBridge = readBridgeBase(out);
  if (fromBridge != null) return fromBridge;
  const fromHtml = readHtmlBase(out);
  if (fromHtml != null) return fromHtml;
  return "/";
}

function readBridgeBase(out) {
  try {
    const meta = JSON.parse(
      readFileSync(join(out, "_mado/build.json"), "utf8"),
    );
    return meta?.base ? normalizeBase(meta.base) : null;
  } catch {
    return null;
  }
}

function readHtmlBase(out) {
  try {
    const html = readFileSync(join(out, "index.html"), "utf8");
    // Look at the first hashed asset; Vite always prefixes it with
    // the deployed base.
    const match = /(?:href|src)="(\/[^"]*?\/)assets\//.exec(html);
    if (match && match[1]) return normalizeBase(match[1]);
    // No prefix means root-deployed.
    if (/(?:href|src)="\/assets\//.test(html)) return "/";
    return null;
  } catch {
    return null;
  }
}

function normalizeBase(raw) {
  if (!raw) return "/";
  let s = String(raw).trim();
  if (!s || s === "/") return "/";
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s = s + "/";
  return s.replace(/\/+/g, "/");
}

function stripBase(pathname) {
  if (BASE === "/") return pathname.startsWith("/") ? pathname : "/" + pathname;
  if (pathname === BASE || pathname === BASE.slice(0, -1)) return "/";
  if (pathname.startsWith(BASE)) {
    const rest = pathname.slice(BASE.length - 1);
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

// ---------- Optional release ----------

if (!SKIP_BUILD) {
  logger.info("preview", "autobuild", "PREVIEW_AUTOBUILD=1 — running mado release");
  run("node", ["scripts/cli.mjs", "release"]);
}

if (!(await exists(OUT))) {
  logger.error("preview", "missing-output", `missing ${OUT}/ — run \`mado release\` first`);
  process.exit(1);
}

const spaShell = existsSync(join(OUT, "_mado", "spa.html"))
  ? join(OUT, "_mado", "spa.html")
  : join(OUT, "index.html");
if (!(await exists(spaShell))) {
  logger.error("preview", "missing-shell", `missing ${spaShell}; mado release did not produce an HTML entry`);
  process.exit(1);
}

// ---------- 4) Server ----------

const isImmutable = (filename) =>
  /\.[A-Za-z0-9_-]{6,}\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/i.test(filename);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const fullPathname = decodeURIComponent(url.pathname);
    // Honour the deployed Vite base: redirect bare `/` to `/${base}/` and
    // strip the prefix before any lookup, so `out/index.html`,
    // `out/assets/...` and `out/docs/index.html` are reachable through
    // the same URL shape the CDN serves.
    if (BASE !== "/") {
      const bareBase = BASE.slice(0, -1);
      if (fullPathname === "/" || fullPathname === bareBase) {
        res.writeHead(302, { location: BASE });
        res.end();
        return;
      }
      if (!fullPathname.startsWith(BASE) && fullPathname !== bareBase) {
        res.writeHead(404).end("not found");
        return;
      }
    }
    const pathname = stripBase(fullPathname);
    const accepts = (req.headers["accept-encoding"] ?? "").toString();

    const target = await resolveTarget(pathname);
    if (!target) {
      res.writeHead(404).end("not found");
      return;
    }

    // Choose encoding: br > gz > raw.
    let { path: filePath, encoding } = await pickEncoding(target, accepts);
    const data = await readFile(filePath);
    const baseExt = extname(target).toLowerCase();
    const type = MIME[baseExt] ?? "application/octet-stream";

    const cache = isImmutable(basenameSafe(target))
      ? "public, max-age=31536000, immutable"
      : baseExt === ".html"
        ? "no-cache, must-revalidate"
        : "public, max-age=86400";

    const headers = {
      "content-type": type,
      "cache-control": cache,
      vary: "Accept-Encoding",
    };
    if (encoding) headers["content-encoding"] = encoding;

    res.writeHead(200, headers);
    res.end(data);
  } catch (err) {
    logger.error("preview", "request", "request failed", err);
    res.writeHead(500).end(String(err));
  }
});

server.on("error", (err) => {
  if (err.code === "EPERM" || err.code === "EACCES") {
    logger.error("preview", "bind", `failed to bind ${HOST}:${PORT}: ${err.message}`);
    logger.info("preview", "bind-hint", "try: mado preview --host 127.0.0.1");
  } else {
    logger.error("preview", "listen", `failed to listen on ${HOST}:${PORT}: ${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, HOST, async () => {
  const urlHost = HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST;
  console.log("");
  console.log("Mado preview (production-like)");
  // Print the URL the server actually serves the app at. When the
  // deployment uses a non-trivial Vite `base`, the bare root just
  // 302-redirects to the base prefix, which surprises users who copy
  // the logged URL into a browser and land on "Not Found".
  console.log(`  url:    http://${urlHost}:${PORT}${BASE}`);
  console.log(`  base:   ${BASE}`);
  console.log(`  out:    ${OUT}`);
  console.log("  (Ctrl-C to stop)");
  console.log("");
});

// ---------- helpers ----------

function run(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0 && !allowFail) {
    logger.error("preview", "child-exit", `command "${cmd} ${args.join(" ")}" exited with ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function basenameSafe(p) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf(sep));
  return i >= 0 ? p.slice(i + 1) : p;
}

async function resolveTarget(pathname) {
  if (pathname === "/") pathname = "/index.html";

  const candidate = resolve(join(OUT, pathname));
  if (!candidate.startsWith(OUT + sep) && candidate !== OUT) return null;

  // 1) Exact match inside out/.
  if (await exists(candidate)) {
    const s = await stat(candidate);
    if (s.isDirectory()) {
      const idx = join(candidate, "index.html");
      if (await exists(idx)) return idx;
    } else {
      return candidate;
    }
  }

  // 2) /foo → /foo/index.html (for sub-folders without trailing slash).
  if (!extname(pathname)) {
    const asDir = join(OUT, pathname, "index.html");
    if (await exists(asDir)) return asDir;
  }

  // 3) SPA-fallback: any non-asset path falls back to the SPA shell so
  //    client-side routing handles it. Asset-looking paths (with an
  //    extension) deliberately 404 instead — otherwise a 200 on
  //    /missing.png would mask real bugs.
  if (!extname(pathname)) {
    const spa = existsSync(join(OUT, "_mado", "spa.html"))
      ? join(OUT, "_mado", "spa.html")
      : join(OUT, "index.html");
    if (await exists(spa)) return spa;
  }

  return null;
}

async function pickEncoding(file, accepts) {
  if (file.endsWith(".js") || file.endsWith(".css") || file.endsWith(".html")) {
    if (accepts.includes("br") && (await exists(`${file}.br`))) {
      return { path: `${file}.br`, encoding: "br" };
    }
    if (accepts.includes("gzip") && (await exists(`${file}.gz`))) {
      return { path: `${file}.gz`, encoding: "gzip" };
    }
  }
  return { path: file, encoding: null };
}
