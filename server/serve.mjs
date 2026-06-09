// Tiny static server on node:http with dev features (ETag + HMR through SSE).
// No dependencies.
//
//   PORT=5173 node server/serve.mjs
//   NO_HMR=1 node server/serve.mjs                # disable HMR
//   node server/serve.mjs basic                   # mount examples/basic/ at /
//   EXAMPLE=showcase node server/serve.mjs        # mount examples/showcase/ at /
//
// Without EXAMPLE, / serves examples/index.html when running inside the Mado
// repository, or ./index.html when running inside a generated app.
// With EXAMPLE, all extensionless and /index.html requests fall back to
// examples/<EXAMPLE>/index.html so the client router works from root, just
// like a production SPA deploy.

import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFile, readdir, readFile as readFileAsync, stat } from "node:fs/promises";
import { watch, existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

const ROOT = resolve(process.cwd());

// Optional mado.config.json — used for dev.proxy and dev.port. Read with a
// hand-rolled JSON parse to avoid a circular dep with scripts/_config.mjs
// (this server is launched from cli.mjs and runs in its own Node process).
const CONFIG = (() => {
  try {
    const file = join(ROOT, "mado.config.json");
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, "utf8")) ?? {};
  } catch {
    return {};
  }
})();
const PROXY_RULES = Object.entries(CONFIG.dev?.proxy ?? {}); // [["/api", "http://localhost:3000"], ...]

const PORT = Number(process.env.PORT ?? CONFIG.dev?.port ?? 5173);
const HMR = process.env.NO_HMR !== "1";

const EXAMPLE = process.argv[2] ?? process.env.MADO_EXAMPLE ?? process.env.EXAMPLE ?? "";
const EXAMPLE_DIR = EXAMPLE
  ? resolve(join(ROOT, "examples", EXAMPLE))
  : "";
const EXAMPLE_INDEX = EXAMPLE ? join(EXAMPLE_DIR, "index.html") : "";
const EXAMPLES_INDEX = join(ROOT, "examples", "index.html");
const APP_INDEX = join(ROOT, "index.html");
const DEFAULT_INDEX = existsSync(EXAMPLES_INDEX) ? EXAMPLES_INDEX : APP_INDEX;

if (EXAMPLE) {
  if (!existsSync(EXAMPLE_INDEX)) {
    console.error(
      `[serve] EXAMPLE=${EXAMPLE}: file not found: ${EXAMPLE_INDEX}`,
    );
    process.exit(1);
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

// ---------- HMR through Server-Sent Events ----------
//
// Open SSE connections live in a Set. Any file change broadcasts "reload".
// The client reloads the page. This is deliberately full reload rather than
// true HMR: we do not need preserved state, and the behavior stays simple.

const sseClients = new Set();

function broadcast(event, data) {
  for (const res of sseClients) {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  }
}

if (HMR) {
  // Debounce reload: tsc -w often changes several files in a row.
  let timer = null;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[hmr] reload ${sseClients.size} client(s)`);
      broadcast("reload", Date.now());
    }, 80);
  };

  for (const dir of ["dist", "examples"]) {
    try {
      watch(join(ROOT, dir), { recursive: true }, trigger);
    } catch {
      /* dir may not exist on startup */
    }
  }
}

const HMR_CLIENT = `
// Mado HMR client (auto-injected by serve.mjs)
(() => {
  if (window.__madoHmr) return;
  window.__madoHmr = true;
  const es = new EventSource('/__hmr');
  es.addEventListener('reload', () => location.reload());
  es.addEventListener('error', () => {
    // The server may be gone; try reconnecting after 1s.
    setTimeout(() => location.reload(), 1000);
  });
})();
`.trim();

// ---------- Server ----------

const server = createServer(async (req, res) => {
  const started = Date.now();
  let pathname = "/";
  let reason = "";
  res.on("finish", () => {
    const ms = Date.now() - started;
    const type = res.getHeader("content-type") ?? "-";
    const suffix = reason ? ` ${reason}` : "";
    console.log(
      `[serve] ${req.method ?? "GET"} ${pathname} ${res.statusCode} ${ms}ms ${type}${suffix}`,
    );
  });

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    pathname = decodeURIComponent(url.pathname);

    // Dev proxy: forward matching prefixes to an upstream backend, so the
    // browser can reach the SPA and the API on a single origin without CORS.
    const proxyRule = PROXY_RULES.find(([prefix]) => pathname.startsWith(prefix));
    if (proxyRule) {
      const [prefix, upstream] = proxyRule;
      await proxyForward({ req, res, prefix, upstream, pathname, search: url.search });
      reason = `proxy → ${upstream}`;
      return;
    }

    // SSE endpoint for HMR.
    if (pathname === "/__hmr") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      sseClients.add(res);
      console.log(`[hmr] client connected (${sseClients.size})`);
      req.on("close", () => {
        sseClients.delete(res);
        console.log(`[hmr] client disconnected (${sseClients.size})`);
      });
      return;
    }

    // A mounted example owns root and SPA fallback. Otherwise serve the
    // examples index page.
    const fallbackIndex = EXAMPLE ? EXAMPLE_INDEX : DEFAULT_INDEX;

    if (pathname === "/") {
      // Resolved through fallback below.
    }

    const filePath =
      pathname === "/" ? fallbackIndex : resolve(join(ROOT, pathname));

    if (filePath !== fallbackIndex) {
      if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
        reason = "forbidden path";
        res.writeHead(403).end("forbidden");
        return;
      }
    }

    let target = filePath;
    try {
      const s = await stat(target);
      if (s.isDirectory()) target = join(target, "index.html");
    } catch {
      if (!extname(pathname)) {
        target = fallbackIndex;
      } else {
        reason = "file not found";
        res.writeHead(404).end("not found");
        return;
      }
    }

    let data = await readFile(target);

    // ETag: content hash. If-None-Match → 304.
    const etag = `"${createHash("sha1").update(data).digest("base64url")}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { etag });
      res.end();
      return;
    }

    // HMR injector: add the client script before </body>.
    const type =
      MIME[extname(target).toLowerCase()] ?? "application/octet-stream";

    if (type.startsWith("text/html")) {
      let text = data.toString("utf8");
      // modulepreload hints: tell the browser to fetch the framework core and
      // the mounted example's pages while HTML is still being parsed.
      const preload = await buildPreloadHints();
      if (preload) {
        text = text.replace(/<\/head>/i, `${preload}\n  </head>`);
      }
      if (HMR) {
        text = text.replace(
          /<\/body>/i,
          `<script>${HMR_CLIENT}</script>\n  </body>`,
        );
      }
      data = Buffer.from(text);
    }

    res.writeHead(200, {
      "content-type": type,
      etag,
      "cache-control": "no-cache",
    });
    res.end(data);
  } catch (err) {
    reason = "unhandled error";
    console.error("[serve] error:", err);
    res.writeHead(500).end(String(err));
  }
});

// ---------- modulepreload hints ----------
//
// Simple heuristic, no AST parsing:
//   1. /dist/src/index.js — framework core, always needed
//   2. /dist/examples/<EXAMPLE>/main.js — app entry
//   3. /dist/examples/<EXAMPLE>/routes.js — route manifest
//   4. /dist/examples/<EXAMPLE>/pages/*.js — all pages
//      (without them the first router click waterfalls)
//
// Disable with PRELOAD=0. Limit to the core with PRELOAD=core.
// Default is full (all pages).

const PRELOAD = process.env.PRELOAD ?? "full";

let cachedPreloadHints = null;
let cachedPreloadAt = 0;
const PRELOAD_CACHE_MS = HMR ? 1000 : 60_000;

async function buildPreloadHints() {
  if (PRELOAD === "0" || PRELOAD === "off" || PRELOAD === "false") return "";
  const now = Date.now();
  if (cachedPreloadHints !== null && now - cachedPreloadAt < PRELOAD_CACHE_MS) {
    return cachedPreloadHints;
  }
  const hrefs = [];
  // core
  if (existsSync(join(ROOT, "dist/src/index.js"))) {
    hrefs.push("/dist/src/index.js");
  }
  if (EXAMPLE) {
    const exampleDist = join(ROOT, "dist", "examples", EXAMPLE);
    for (const f of ["main.js", "routes.js"]) {
      if (existsSync(join(exampleDist, f))) {
        hrefs.push(`/dist/examples/${EXAMPLE}/${f}`);
      }
    }
    if (PRELOAD === "full") {
      const pagesDir = join(exampleDist, "pages");
      if (existsSync(pagesDir)) {
        try {
          for (const file of await readdir(pagesDir)) {
            if (file.endsWith(".js")) {
              hrefs.push(`/dist/examples/${EXAMPLE}/pages/${file}`);
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
  } else if (!existsSync(EXAMPLES_INDEX)) {
    if (existsSync(join(ROOT, "dist/main.js"))) {
      hrefs.push("/dist/main.js");
    }
  }
  cachedPreloadHints = hrefs
    .map((h) => `  <link rel="modulepreload" href="${h}">`)
    .join("\n");
  cachedPreloadAt = now;
  return cachedPreloadHints;
}

server.on("error", (err) => {
  console.error(`[serve] failed to listen on port ${PORT}: ${err.message}`);
  process.exit(1);
});

async function proxyForward({ req, res, prefix, upstream, pathname, search }) {
  // Strip the prefix only if the upstream URL itself ends with `/`; otherwise
  // forward the full pathname so the backend sees /api/...
  let upstreamUrl;
  try {
    upstreamUrl = new URL(upstream);
  } catch {
    res.writeHead(502).end(`bad upstream: ${upstream}`);
    return;
  }
  const target = new URL(upstream);
  // Compose path: <upstream.pathname rstrip "/"> + <pathname> + <search>
  const tail = pathname; // keep the original /api/... so backends route normally
  target.pathname = (target.pathname.replace(/\/$/, "")) + tail;
  target.search = search;

  const lib = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstreamReq = lib(
    target,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
      },
    },
    (upstreamRes) => {
      // Forward status and headers, then pipe the body.
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstreamReq.on("error", (err) => {
    console.error(`[serve] proxy error for ${pathname} → ${target.href}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`proxy upstream unavailable: ${target.host}\n${err.message}`);
    } else {
      res.end();
    }
  });
  req.pipe(upstreamReq);
  // Reference unused arg so lint is happy.
  void prefix;
}

server.listen(PORT, () => {
  const distReady = existsSync(join(ROOT, "dist/src/index.js"))
    || existsSync(join(ROOT, "dist/main.js"));
  const mount = EXAMPLE
    ? `examples/${EXAMPLE}/ -> /`
    : existsSync(EXAMPLES_INDEX)
      ? "examples/index.html landing"
      : "index.html app";
  console.log("");
  console.log("Mado dev server");
  console.log(`  url:      http://localhost:${PORT}/`);
  console.log(`  root:     ${ROOT}`);
  console.log(`  mount:    ${mount}`);
  console.log(`  hmr:      ${HMR ? "on" : "off"}`);
  console.log(`  preload:  ${PRELOAD}`);
  console.log(`  dist:     ${distReady ? "ready" : "missing (run mado build)"}`);
  if (PROXY_RULES.length > 0) {
    console.log("  proxy:");
    for (const [prefix, upstream] of PROXY_RULES) {
      console.log(`            ${prefix.padEnd(10)} → ${upstream}`);
    }
  }
  if (!EXAMPLE && existsSync(EXAMPLES_INDEX)) {
    console.log("  try:      mado serve basic");
    console.log("            mado serve showcase");
    console.log("            mado serve tickets");
  }
  console.log("");
});
