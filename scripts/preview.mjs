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
//        - SPA fallback to index.html;
//        - exact `out/` route files before SPA fallback;
//        - precompressed .gz / .br serving via Accept-Encoding.
//
// Goal: see production-like output locally without Docker/nginx, identical to
// what a static host (nginx / Cloudflare Pages / S3) would serve.

import { createServer } from "node:http";
import { readFile, stat, access } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

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

const PREVIEW_FLAGS = parsePreviewArgs(process.argv.slice(2));

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, process.env.OUT_DIR ?? "out");
const PORT = Number(PREVIEW_FLAGS.port ?? process.env.PORT ?? 4173);
const HOST = String(PREVIEW_FLAGS.host ?? process.env.HOST ?? "localhost");
const AUTOBUILD = process.env.PREVIEW_AUTOBUILD === "1";
const SKIP_BUILD = process.env.SKIP_BUILD === "1" || !AUTOBUILD;

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
  console.log("[preview] PREVIEW_AUTOBUILD=1 — running mado release");
  run("node", ["scripts/cli.mjs", "release"]);
}

if (!(await exists(OUT))) {
  console.error(
    `[preview] missing ${OUT}/ — run \`mado release\` first.`,
  );
  process.exit(1);
}

const spaShell = join(OUT, "index.html");
if (!(await exists(spaShell))) {
  console.error(
    `[preview] missing ${spaShell} — \`mado release\` did not produce an HTML entry.\n` +
      `[preview] Without it any non-baked route will 404 instead of falling back to the SPA.`,
  );
  process.exit(1);
}

// ---------- 4) Server ----------

const isImmutable = (filename) =>
  /\.[A-Za-z0-9_-]{6,}\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/i.test(filename);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
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
    console.error("[preview] error:", err);
    res.writeHead(500).end(String(err));
  }
});

server.on("error", (err) => {
  if (err.code === "EPERM" || err.code === "EACCES") {
    console.error(
      `[preview] failed to bind ${HOST}:${PORT}: ${err.message}\n` +
        `[preview] tip: this sandbox may disallow binding "${HOST}".\n` +
        `[preview] try:  mado preview --host 127.0.0.1`,
    );
  } else {
    console.error(
      `[preview] failed to listen on ${HOST}:${PORT}: ${err.message}`,
    );
  }
  process.exit(1);
});

server.listen(PORT, HOST, async () => {
  const urlHost = HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST;
  console.log("");
  console.log("Mado preview (production-like)");
  console.log(`  url:    http://${urlHost}:${PORT}/`);
  console.log(`  out:    ${OUT}`);
  console.log("  (Ctrl-C to stop)");
  console.log("");
});

// ---------- helpers ----------

function run(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0 && !allowFail) {
    console.error(`[preview] command "${cmd} ${args.join(" ")}" exited with ${r.status}`);
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
    const spa = join(OUT, "index.html");
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
