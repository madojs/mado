// Smart Static: bake HTML for pages with `bake: { paths, data }`.
//
//   node scripts/bake.mjs              # reads src/routes.ts (or examples/routes.ts)
//   ENTRY=examples/routes.ts node scripts/bake.mjs
//
// What it does:
//   1. Dynamically imports the routes manifest.
//   2. For every route whose page has `bake`:
//      a) gets params through `bake.paths()`,
//      b) gets data for each params object through `bake.data(params)`,
//      c) renders TemplateResult into an HTML string (without a browser),
//      d) bakes head() into <meta>/<link>/<script type=json-ld>,
//      e) embeds baked data in <script id="bake" type="application/json">,
//      f) writes out/<path>/index.html.
//   3. Generates out/sitemap.xml.
//
// Dependency: linkedom (~50KB pure JS DOM in Node). If it is missing, print a
// clear error.
//
// Design: no magic. This file does not call component methods like
// connectedCallback; it only expands TemplateResult structures into HTML.
// Web Components come alive on the client.

import { readFile, writeFile, mkdir, access, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

// ---------- Options ----------

const ENTRY = process.env.ENTRY ?? "examples/routes.ts";
const OUT_DIR = process.env.OUT_DIR ?? "out";
const BASE_URL = process.env.BASE_URL ?? "https://example.com";

// ---------- Optional dependencies ----------

let parseHTML;
try {
  ({ parseHTML } = await import("linkedom"));
} catch {
  console.error("[bake] package 'linkedom' is required:  npm i -D linkedom");
  process.exit(1);
}

let esbuild;
try {
  esbuild = await import("esbuild");
} catch {
  console.error("[bake] package 'esbuild' is required:  npm i -D esbuild");
  process.exit(1);
}

// ---------- DOM polyfills for Node ----------
//
// router.ts/component.ts/css.ts touch window, document, location and
// customElements at module top-level. Node does not have those, so install
// linkedom stubs before importing the app graph.

const baseHtml = await readFile("examples/index.html", "utf8").catch(
  () => "<!doctype html><html><head></head><body></body></html>",
);
const { window: linkedomWindow } = parseHTML(baseHtml);

globalThis.window = linkedomWindow;
globalThis.document = linkedomWindow.document;
globalThis.location = new URL("http://localhost/");
globalThis.history = {
  pushState: () => {},
  replaceState: () => {},
};
globalThis.customElements = {
  define: () => {},
  get: () => undefined,
  whenDefined: () => Promise.resolve(),
};
globalThis.HTMLElement = linkedomWindow.HTMLElement ?? class {};
globalThis.CSSStyleSheet =
  globalThis.CSSStyleSheet ??
  class {
    cssRules = [];
    replaceSync() {}
  };
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
});
if (!globalThis.queueMicrotask) globalThis.queueMicrotask = (fn) => Promise.resolve().then(fn);

// ---------- Manifest import ----------
//
// Bundle routes.ts into a temporary CJS file so Node can import it without
// caring about paths/importmap. Pages, lib and Mado itself are bundled too.

const tmpFile = join(tmpdir(), `mado-bake-${Date.now()}.mjs`);

await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  outfile: tmpFile,
  // tsconfig paths are not read by esbuild here, so aliases are explicit.
  tsconfig: "tsconfig.json",
  // resolve 'madojs' → ./src/index.ts
  alias: {
    madojs: resolve("src/index.ts"),
  },
  logLevel: "error",
});

const routesUrl = pathToFileURL(tmpFile).href;
const routesModule = await import(routesUrl);
await rm(tmpFile).catch(() => {});
const routeApi = routesModule.default;

if (!routeApi) {
  console.error("[bake] routes.ts must default-export routes({...})");
  process.exit(1);
}

// Bake needs the source manifest, not RouterApi (runtime API). Therefore
// routes.ts must also export `manifest`.
//
// The chosen convention: routes.ts exports both `default` (RouterApi) and
// `manifest` (the source object). See examples/routes.ts.

const manifest = routesModule.manifest;
if (!manifest) {
  console.error(
    "[bake] routes.ts must also `export const manifest = {...}` " +
    "(the same object passed to routes()).",
  );
  process.exit(1);
}

// ---------- Main loop ----------

await mkdir(OUT_DIR, { recursive: true });

// Read the HTML template (the same index.html used by the app). Without it
// there is nowhere to place baked output.
const TEMPLATE_HTML = await readFile("examples/index.html", "utf8");

const sitemapEntries = [];
let total = 0;

for (const [pattern, entry] of Object.entries(manifest)) {
  if (pattern === "*") continue;

  // entry can be Page, () => import, or nested. Bake currently handles direct
  // lazy imports and Page entries.
  const pg = await resolvePage(entry);
  if (!pg) continue;
  if (!pg.bake) continue;

  console.log(`[bake] ${pattern}`);

  const allParams = await pg.bake.paths();
  for (const params of allParams) {
    const pathname = applyParams(pattern, params);
    const data = await pg.bake.data(params);
    const headMeta = pg.head ? pg.head(params, data) : {};

    const tpl = pg.view({
      params,
      data,
      path: () => pathname,
      child: null,
    });

    const bodyHtml = renderTemplate(tpl);
    const finalHtml = buildHtml({
      template: TEMPLATE_HTML,
      bodyHtml,
      head: headMeta,
      bakedData: data,
      revalidate: pg.bake.revalidate,
      canonical: headMeta.canonical ?? `${BASE_URL}${pathname}`,
    });

    const file = join(OUT_DIR, pathname === "/" ? "/index.html" : `${pathname}/index.html`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, finalHtml);
    total++;

    sitemapEntries.push({
      loc: `${BASE_URL}${pathname}`,
      changefreq: "weekly",
    });
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

console.log(`[bake] done: ${total} pages + sitemap.xml`);

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

function applyParams(pattern, params) {
  return pattern.replace(/:([\w]+)/g, (_, k) => {
    const v = params[k];
    if (v == null) throw new Error(`[bake] missing param :${k} for ${pattern}`);
    return encodeURIComponent(String(v));
  });
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------- Render TemplateResult → HTML string ----------
//
// Tiny server-side renderer for TemplateResult. Supports the same shapes as
// html.ts, but without events (@click is ignored) and without live signals
// (function values are called once).

function renderTemplate(tpl) {
  if (tpl == null || tpl === false || tpl === true) return "";
  if (typeof tpl === "string") return escapeHtml(tpl);
  if (typeof tpl === "number") return String(tpl);
  if (Array.isArray(tpl)) return tpl.map(renderTemplate).join("");
  if (tpl && tpl._mado === true) return renderMadoTemplate(tpl);
  // unknown
  return "";
}

function renderMadoTemplate(tpl) {
  const { strings, values } = tpl;
  let html = "";
  for (let i = 0; i < strings.length; i++) {
    html += strings[i];
    if (i < strings.length - 1) {
      html += renderValue(values[i], inAttributeContext(html));
    }
  }
  // Remove event marker attributes (the client html.ts does this too).
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

function renderValue(v, inAttr) {
  if (v == null || v === false) return "";
  if (v === true) return "";
  if (typeof v === "function") {
    try {
      return renderValue(v(), inAttr);
    } catch {
      return "";
    }
  }
  if (Array.isArray(v)) return v.map((x) => renderValue(x, inAttr)).join("");
  if (v && v._mado === true) return renderMadoTemplate(v);
  if (inAttr) return escapeAttr(String(v));
  return escapeHtml(String(v));
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

  // head
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
    setMeta(document, {
      name: "twitter:card",
      content: tw.card ?? "summary",
    });
    if (tw.title ?? og.title)
      setMeta(document, { name: "twitter:title", content: tw.title ?? og.title });
    if (tw.description ?? og.description)
      setMeta(document, { name: "twitter:description", content: tw.description ?? og.description });
    if (tw.image ?? og.image)
      setMeta(document, { name: "twitter:image", content: tw.image ?? og.image });
  }
  for (const m of head.meta ?? []) setMeta(document, m);
  for (const l of head.link ?? []) setLink(document, l);

  // JSON-LD
  if (head.jsonLd != null) {
    const s = document.createElement("script");
    s.setAttribute("type", "application/ld+json");
    s.setAttribute("data-mado-head", "baked");
    s.textContent = JSON.stringify(head.jsonLd);
    document.head.appendChild(s);
  }

  // revalidate meta: for CDN or manual CI re-bake logic
  if (revalidate) {
    setMeta(document, {
      name: "bake-revalidate",
      content: String(revalidate),
    });
    setMeta(document, {
      name: "bake-stamp",
      content: String(Date.now()),
    });
  }

  // Baked data: the client can use it as initialData.
  if (bakedData !== undefined) {
    const s = document.createElement("script");
    s.setAttribute("type", "application/json");
    s.id = "bake";
    s.textContent = JSON.stringify(bakedData);
    document.body.appendChild(s);
  }

  // body: insert baked HTML inside #app.
  const app = document.getElementById("app");
  if (app) {
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
