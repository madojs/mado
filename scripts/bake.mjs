// Smart Static: bake HTML for pages whose `page({ bake })` is set.
//
// Usage:
//   mado bake
//   mado bake --entry src/routes.ts --template index.html --out out
//   mado bake --base-url https://example.com
//
// Defaults:
//   entry:    src/app.routes.ts, then src/routes.ts
//   template: index.html
//   out:      out/
//
// What it does:
//   1. Loads `entry` (routes module) through Vite SSR/module loading.
//   2. For every route whose page has `bake`:
//      a) gets params via `bake.paths()`,
//      b) gets data per params via `bake.data(params)`,
//      c) renders the TemplateResult to an HTML string (no browser),
//      d) materializes head() into <meta>/<link>/<script type=json-ld>,
//      e) inlines baked data in <script id="bake" type="application/json">,
//      f) writes <out>/<path>/index.html.
//   3. Generates <out>/sitemap.xml.
//
// Context awareness:
//   - In app-mode (default outside the framework repository) the bundler
//     resolves `@madojs/mado` from node_modules normally.
//   - In repo-mode (the framework repository itself) it aliases
//     `@madojs/mado` → ./src/index.ts so the framework can dogfood itself.
//
// Required dev deps: linkedom, vite. We print a clear error if missing.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, writeSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

import { detectContext, parseFlags, resolveProjectPath } from "./_config.mjs";

// ---------- Resolve options from config + flags + env ----------

const { flags } = parseFlags(process.argv.slice(2));
const PROJECT_ROOT = resolve(process.cwd());
const CONTEXT = detectContext(PROJECT_ROOT);
const ENTRY = resolveProjectPath(
  PROJECT_ROOT,
  typeof flags.entry === "string" ? flags.entry : pickDefaultEntry(PROJECT_ROOT),
);
const TEMPLATE = resolveProjectPath(
  PROJECT_ROOT,
  typeof flags.template === "string" ? flags.template : "index.html",
);
const BASE_URL = typeof flags["base-url"] === "string" ? flags["base-url"] : "https://example.com";
const OUT_DIR = resolveProjectPath(
  PROJECT_ROOT,
  typeof flags.out === "string" ? flags.out : "out",
);

/** Write message to stderr and exit. Sync write keeps CI/execFile output reliable. */
function fatal(...msgs) {
  writeSync(2, msgs.join("\n") + "\n");
  process.exit(1);
}

function error(...msgs) {
  writeSync(2, msgs.join(" ") + "\n");
}

if (!existsSync(ENTRY)) {
  fatal(
    `[bake] entry not found: ${ENTRY}`,
    `[bake] expected src/app.routes.ts or src/routes.ts; pass --entry <file> to override`,
  );
}
if (!existsSync(TEMPLATE)) {
  fatal(
    `[bake] template not found: ${TEMPLATE}`,
    `[bake] expected index.html; pass --template <file> to override`,
  );
}

// ---------- Optional dependencies ----------

let parseHTML;
try {
  ({ parseHTML } = await import("linkedom"));
} catch {
  fatal(
    "[bake] package 'linkedom' is required.",
    "[bake] Install it as a dev dependency in this project:",
    "[bake]   npm i -D linkedom vite",
    "[bake] (vite is also required, see next check).",
    "[bake] These are not bundled into @madojs/mado on purpose: bake is an",
    "[bake] optional build step and we don't want to add transitive deps to",
    "[bake] every Mado install.",
  );
}

let createViteServer;
try {
  ({ createServer: createViteServer } = await import("vite"));
} catch {
  fatal(
    "[bake] package 'vite' is required.",
    "[bake] Install it as a dev dependency in this project:",
    "[bake]   npm i -D vite linkedom",
  );
}

// ---------- DOM polyfills for Node ----------
//
// router.ts / component.ts / css.ts touch window/document/location/customElements
// at module top-level. Node has none, so install linkedom stubs before importing
// the app graph.

const baseHtml = await readFile(TEMPLATE, "utf8");
const { window: linkedomWindow } = parseHTML(baseHtml);

globalThis.window = linkedomWindow;
globalThis.document = linkedomWindow.document;
globalThis.location = new URL("http://localhost/");
globalThis.history = { pushState: () => { }, replaceState: () => { } };
globalThis.customElements = {
  define: () => { },
  get: () => undefined,
  whenDefined: () => Promise.resolve(),
};
globalThis.HTMLElement = linkedomWindow.HTMLElement ?? class { };
globalThis.CSSStyleSheet = globalThis.CSSStyleSheet ?? class {
  cssRules = [];
  replaceSync() { }
};
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener: () => { },
  removeEventListener: () => { },
});
if (!globalThis.queueMicrotask) {
  globalThis.queueMicrotask = (fn) => Promise.resolve().then(fn);
}

// ---------- Load the routes module through Vite ----------
//
// In repo-mode the framework dogfoods its own source; alias `@madojs/mado`
// to ./src/index.ts. In app-mode the package is resolved from node_modules.

const aliases = CONTEXT === "repo"
  ? { "@madojs/mado": resolve(PROJECT_ROOT, "src/index.ts") }
  : {};

const viteServer = await createViteServer({
  root: PROJECT_ROOT,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
  resolve: { alias: aliases },
});

let routesModule;
try {
  routesModule = await viteServer.ssrLoadModule(toViteId(ENTRY));
} catch (err) {
  await closeAndFatal(`[bake] failed to load ${ENTRY}: ${err.message}`);
}
const routeApi = routesModule.default;

if (!routeApi) {
  await closeAndFatal(`[bake] ${ENTRY} must default-export routes({...})`);
}

// Bake needs the source manifest (not the runtime RouterApi).
// routes.ts must therefore also `export const manifest = {...}`.
const manifest = routesModule.manifest;
if (!manifest) {
  await closeAndFatal(
    `[bake] ${ENTRY} must also \`export const manifest = {...}\` ` +
    "(the same object passed to routes()).",
  );
}

// ---------- Main loop ----------

await mkdir(OUT_DIR, { recursive: true });

// Re-read template (already loaded for DOM polyfills, but we want a fresh copy
// per generated page so meta/link tags don't accumulate across iterations).
const TEMPLATE_HTML = baseHtml;

const sitemapEntries = [];
let total = 0;
let bakedErrors = 0;
let bakeablePages = 0;
const skippedNoBake = [];

for (const [pattern, entry] of Object.entries(manifest)) {
  if (pattern === "*") continue;

  const pg = await resolvePage(entry);
  if (!pg) continue;
  if (!pg.bake) {
    skippedNoBake.push(pattern);
    continue;
  }
  bakeablePages++;

  console.log(`[bake] ${pattern}`);

  let allParams;
  try {
    allParams = await pg.bake.paths();
  } catch (err) {
    error(`[bake] ${pattern}: bake.paths() failed:`, err.message);
    bakedErrors++;
    continue;
  }

  for (const params of allParams) {
    const pathname = applyParams(pattern, params);
    let data;
    try {
      data = await pg.bake.data(params);
    } catch (err) {
      error(`[bake] ${pathname}: bake.data() failed:`, err.message);
      bakedErrors++;
      continue;
    }
    const headMeta = pg.head ? pg.head(params, data) : {};

    // Ensure <title> is always set in baked HTML. page.title is the primary
    // source (string or function of params); head().title overrides it.
    if (!headMeta.title && pg.title) {
      headMeta.title = typeof pg.title === "function" ? pg.title(params) : pg.title;
    }

    const tpl = pg.view({
      params,
      data,
      path: () => pathname,
      child: null,
    });

    let bodyHtml;
    try {
      bodyHtml = renderTemplate(tpl, { route: pattern });
    } catch (err) {
      error(`[bake] ${pathname}: render failed:`, err.message);
      bakedErrors++;
      continue;
    }

    const finalHtml = buildHtml({
      template: TEMPLATE_HTML,
      bodyHtml,
      head: headMeta,
      bakedData: data,
      revalidate: pg.bake.revalidate,
      canonical: headMeta.canonical ?? `${BASE_URL}${pathname}`,
    });

    const file = join(
      OUT_DIR,
      pathname === "/" ? "/index.html" : `${pathname}/index.html`,
    );
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, finalHtml);
    total++;
    sitemapEntries.push({ loc: `${BASE_URL}${pathname}`, changefreq: "weekly" });
  }
}

// ---------- Sitemap ----------

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries
    .map(
      (e) =>
        `  <url><loc>${escapeXml(e.loc)}</loc><changefreq>${e.changefreq}</changefreq></url>`,
    )
    .join("\n")}
</urlset>
`;
await writeFile(join(OUT_DIR, "sitemap.xml"), sitemap);

console.log(`[bake] done: ${total} pages + sitemap.xml → ${OUT_DIR}`);
if (bakedErrors > 0) {
  await closeAndFatal(`[bake] ${bakedErrors} route(s) failed; see errors above.`);
}
// Loud diagnostic when the manifest exists but no page declares `bake`.
// Previously bake silently produced 0 pages + an empty sitemap and exited
// 0, which made `mado release` look successful while shipping no static
// HTML for crawlers. Fail loudly so the user notices.
if (bakeablePages === 0) {
  error("");
  error(
    `[bake] WARNING: no page in ${ENTRY} declares \`bake: { paths, data }\`.`,
  );
  error(
    `[bake] ${skippedNoBake.length} route(s) skipped: ${skippedNoBake
      .slice(0, 6)
      .join(", ")}${skippedNoBake.length > 6 ? ", …" : ""}`,
  );
  error("[bake] Add `bake` to at least one page (e.g. your landing route):");
  error("[bake]   export default page({");
  error("[bake]     view: …,");
  error("[bake]     bake: { paths: () => [{}], data: () => ({}) },");
  error("[bake]   });");
  error(
    "[bake] Without bake the build ships only the SPA shell — search engines",
  );
  error("[bake] and link previews see an empty <body>.");
  // Exit non-zero so `mado release` halts and the user is forced to address
  // it. If you intentionally have an SPA-only deploy, drop `mado bake` from
  // the release pipeline (or set MADO_BAKE_ALLOW_EMPTY=1).
  if (process.env.MADO_BAKE_ALLOW_EMPTY !== "1") {
    await viteServer.close();
    process.exit(1);
  }
}

await viteServer.close();

// ---------- Helpers ----------

async function resolvePage(entry) {
  if (entry && entry._page === true) return entry;
  if (typeof entry === "function") {
    try {
      const mod = await entry();
      return mod?.default;
    } catch (e) {
      console.warn("[bake] failed to load route:", e.message);
      return null;
    }
  }
  return null;
}

function toViteId(path) {
  return path.split("\\").join("/");
}

function pickDefaultEntry(projectRoot) {
  const appRoutes = "src/app.routes.ts";
  if (existsSync(resolve(projectRoot, appRoutes))) return appRoutes;
  return "src/routes.ts";
}

async function closeAndFatal(...msgs) {
  await viteServer.close().catch(() => { });
  fatal(...msgs);
}

function applyParams(pattern, params) {
  return pattern.replace(/:([\w]+)/g, (_, k) => {
    const v = params[k];
    if (v == null) throw new Error(`[bake] missing param :${k} for ${pattern}`);
    return encodeURIComponent(String(v));
  });
}

// ---------- Render TemplateResult → HTML string ----------
//
// Tiny SSR for TemplateResult. Supports the same shapes as html.ts but
// without events (@click is stripped) and without live signals (function
// values are called once).

function renderTemplate(tpl, ctx) {
  if (tpl == null || tpl === false || tpl === true) return "";
  if (typeof tpl === "string") return escapeHtml(tpl);
  if (typeof tpl === "number") return String(tpl);
  if (Array.isArray(tpl)) return tpl.map((x) => renderTemplate(x, ctx)).join("");
  if (typeof tpl === "object") {
    if (tpl._mado === true) return renderMadoTemplate(tpl, ctx);

    // Unknown shapes (e.g. each() directive results) must NOT silently render
    // as "[object Object]". Either each() unwraps to an array here, or we
    // throw with a meaningful location.
    throw new Error(
      `bake cannot render value of type "${tpl._type ?? tpl.constructor?.name ?? "object"}" ` +
      `in route ${ctx?.route ?? "?"}. ` +
      "Hint: each() and other directives are not yet supported in bake. " +
      "Use a plain array (items.map(render)) in baked views, or render this " +
      "section only on the client.",
    );
  }
  return "";
}

function renderMadoTemplate(tpl, ctx) {
  const { strings, values } = tpl;
  let html = "";
  for (let i = 0; i < strings.length; i++) {
    html += strings[i];
    if (i < strings.length - 1) {
      html += renderValue(values[i], inAttributeContext(html), ctx);
    }
  }
  // Strip event markers and normalize property / boolean-attribute forms
  // (mirrors the runtime bindings in src/html/bindings.ts).
  return html
    .replace(/\s+@[\w-]+="[^"]*"/g, "")
    .replace(/\s+\.([\w-]+)="([^"]*)"/g, ' $1="$2"')
    .replace(/\s+\?([\w-]+)="(true|on|1)"/g, ' $1=""')
    .replace(/\s+\?[\w-]+="(false|off|0|)"/g, "");
}

function inAttributeContext(html) {
  const lastOpen = html.lastIndexOf("<");
  const lastClose = html.lastIndexOf(">");
  return lastOpen > lastClose;
}

function renderValue(v, inAttr, ctx) {
  if (v == null || v === false) return "";
  if (v === true) return "";
  if (typeof v === "function") {
    try {
      return renderValue(v(), inAttr, ctx);
    } catch {
      return "";
    }
  }
  if (Array.isArray(v)) return v.map((x) => renderValue(x, inAttr, ctx)).join("");
  if (v && v._mado === true) return renderMadoTemplate(v, ctx);
  if (v && typeof v === "object" && typeof v._madoDirective === "string") {
    return renderDirective(v, inAttr, ctx);
  }
  if (v && typeof v === "object") {
    // Same defense as renderTemplate(): never silently coerce to "[object Object]".
    throw new Error(
      `bake cannot serialize value of type "${v?._type ?? v?.constructor?.name ?? "object"}" ` +
      `in route ${ctx?.route ?? "?"}. ` +
      "Hint: each() is not yet supported in bake. Use a plain array in baked views.",
    );
  }
  if (inAttr) return escapeAttr(String(v));
  return escapeHtml(String(v));
}

function renderDirective(v, inAttr, ctx) {
  switch (v._madoDirective) {
    case "unsafeHTML": {
      if (inAttr) {
        throw new Error(
          `bake cannot render unsafeHTML() inside an attribute in route ${ctx?.route ?? "?"}.`,
        );
      }
      return String(v.value ?? "");
    }
    case "classMap": {
      const value = Object.entries(v.value ?? {})
        .filter(([, enabled]) => !!enabled)
        .map(([className]) => className)
        .join(" ");
      return inAttr ? escapeAttr(value) : escapeHtml(value);
    }
    case "styleMap": {
      const value = Object.entries(v.value ?? {})
        .filter(([, raw]) => raw != null && raw !== false)
        .map(([name, raw]) => `${toCssPropertyName(name)}:${String(raw)}`)
        .join(";");
      return inAttr ? escapeAttr(value) : escapeHtml(value);
    }
    case "ref":
      return "";
    default:
      throw new Error(
        `bake cannot render directive "${v._madoDirective}" in route ${ctx?.route ?? "?"}.`,
      );
  }
}

function toCssPropertyName(name) {
  if (name.startsWith("--")) return name;
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Final HTML with head + baked data ----------

function buildHtml({ template, bodyHtml, head, bakedData, revalidate, canonical }) {
  const { document } = parseHTML(template);

  if (head.title) document.title = head.title;
  if (head.description) {
    setMeta(document, { name: "description", content: head.description });
  }
  if (canonical) {
    setLink(document, { rel: "canonical", href: canonical });
  }
  if (head.og) {
    for (const [k, v] of Object.entries(head.og)) {
      if (!v) continue;
      setMeta(document, { property: `og:${k}`, content: String(v) });
    }
  }
  if (head.twitter || head.og) {
    const tw = head.twitter ?? {};
    const og = head.og ?? {};
    setMeta(document, { name: "twitter:card", content: tw.card ?? "summary" });
    if (tw.title ?? og.title)
      setMeta(document, { name: "twitter:title", content: tw.title ?? og.title });
    if (tw.description ?? og.description)
      setMeta(document, { name: "twitter:description", content: tw.description ?? og.description });
    if (tw.image ?? og.image)
      setMeta(document, { name: "twitter:image", content: tw.image ?? og.image });
  }
  for (const m of head.meta ?? []) setMeta(document, m);
  for (const l of head.link ?? []) setLink(document, l);

  if (head.jsonLd != null) {
    const s = document.createElement("script");
    s.setAttribute("type", "application/ld+json");
    s.setAttribute("data-mado-head", "baked");
    s.textContent = JSON.stringify(head.jsonLd);
    document.head.appendChild(s);
  }

  if (revalidate) {
    setMeta(document, { name: "bake-revalidate", content: String(revalidate) });
  }

  if (bakedData !== undefined) {
    const s = document.createElement("script");
    s.setAttribute("type", "application/json");
    s.id = "bake";
    s.textContent = JSON.stringify(bakedData);
    document.body.appendChild(s);
  }

  const app = document.getElementById("app");
  if (app) {
    app.setAttribute("data-mado-baked", "");
    app.innerHTML = bodyHtml;
  }

  return "<!doctype html>\n" + document.documentElement.outerHTML;
}

function setMeta(doc, attrs) {
  const m = doc.createElement("meta");
  if (attrs.name) m.setAttribute("name", attrs.name);
  if (attrs.property) m.setAttribute("property", attrs.property);
  m.setAttribute("content", attrs.content);
  m.setAttribute("data-mado-head", "baked");
  doc.head.appendChild(m);
}
function setLink(doc, attrs) {
  const l = doc.createElement("link");
  l.setAttribute("rel", attrs.rel);
  l.setAttribute("href", attrs.href);
  if (attrs.hreflang) l.setAttribute("hreflang", attrs.hreflang);
  l.setAttribute("data-mado-head", "baked");
  doc.head.appendChild(l);
}
