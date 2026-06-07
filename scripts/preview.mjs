// Preview: a tiny production-like server that emulates nginx.conf on node:http.
//
//   npm run preview
//
// What it does:
//   1. npm run build (tsc)
//   2. node scripts/bake.mjs   (generates SEO HTML when bake pages exist)
//   3. node scripts/bundle.mjs (esbuild splitting + .gz/.br)
//   4. Starts a static server on :4173 with:
//        - immutable cache for hashed bundles;
//        - SPA fallback to index.html;
//        - baked HTML priority over index.html;
//        - precompressed .gz / .br serving via Accept-Encoding.
//
// Goal: see production-like output locally without Docker/nginx.

import { createServer } from "node:http";
import { readFile, stat, access } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const OUT = resolve(process.env.OUT_DIR ?? "out");
const PORT = Number(process.env.PORT ?? 4173);
const SKIP_BUILD = process.env.SKIP_BUILD === "1";

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

// ---------- 1-3) Full build ----------

if (!SKIP_BUILD) {
  console.log("[preview] step 1/3 — tsc");
  run("npx", ["tsc"]);

  // bake is optional (only when there are pages with bake config)
  console.log("[preview] step 2/3 — bake (optional)");
  run("node", ["scripts/bake.mjs"], { allowFail: true });

  console.log("[preview] step 3/3 — bundle");
  run("node", ["scripts/bundle.mjs"]);
}

if (!(await exists(OUT))) {
  console.error(`[preview] missing ${OUT}/ — check the steps above`);
  process.exit(1);
}

// ---------- 4) Server ----------

const isImmutable = (filename) =>
  /^(main|chunk|asset)-[A-Z0-9]+\.js$/i.test(filename);

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

server.listen(PORT, () => {
  console.log(`\n[preview] http://localhost:${PORT}/  (Ctrl-C — stop)\n`);
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

  // 1) Exact match
  if (await exists(candidate)) {
    const s = await stat(candidate);
    if (s.isDirectory()) {
      // Baked priority: /product/foo/ → /product/foo/index.html
      const idx = join(candidate, "index.html");
      if (await exists(idx)) return idx;
    } else {
      return candidate;
    }
  }

  // 2) /foo → /foo/index.html (for baked pages without trailing slash)
  if (!extname(pathname)) {
    const asDir = join(OUT, pathname, "index.html");
    if (await exists(asDir)) return asDir;
  }

  // 3) SPA-fallback
  const spa = join(OUT, "index.html");
  if (await exists(spa)) return spa;

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
