/**
 * Edge prerender Worker (PoC).
 *
 * Idea: for a dynamic page request (for example /product/iphone-15)
 *   1) check KV cache; if fresh HTML exists, return it quickly;
 *   2) if not, fetch data from the origin API, generate HTML through
 *      linkedom + meta tags, store it in KV with TTL, and return it;
 *   3) for all other paths, use simple origin/static proxy behavior.
 *
 * This is NOT SSR with hydration. The Mado SPA still starts on the client and
 * renders from scratch. HTML here is only for crawlers and fast first paint.
 *
 * Cloudflare types come from @cloudflare/workers-types (see tsconfig).
 */

/// <reference types="@cloudflare/workers-types" />

import { parseHTML } from "linkedom";

export interface Env {
  PRERENDER: KVNamespace;
  API_BASE: string;
  CACHE_TTL: string;
}

/**
 * Prerender registry: path pattern → data loader + meta/body generator.
 * A real project can generate this from page({ bake: {...} }); the PoC keeps it
 * explicit for readability.
 */
const prerenders: Array<{
  pattern: RegExp;
  paramName: string;
  build: (
    param: string,
    env: Env,
  ) => Promise<{ title: string; description: string; bodyHtml: string }>;
}> = [
  {
    pattern: /^\/product\/([^/]+)$/,
    paramName: "slug",
    async build(slug, env) {
      // Real API request. The PoC falls back to mock data.
      let data: { name: string; description: string; price: number };
      try {
        const r = await fetch(`${env.API_BASE}/products/${slug}`);
        if (!r.ok) throw new Error(`API ${r.status}`);
        data = await r.json();
      } catch {
        data = {
          name: `Mock product ${slug}`,
          description: `Prerendered product description for ${slug}.`,
          price: 0,
        };
      }
      return {
        title: `${data.name} — Mado demo`,
        description: data.description,
        bodyHtml: `
          <article>
            <h1>${escapeHtml(data.name)}</h1>
            <p>${escapeHtml(data.description)}</p>
            <p><strong>${data.price}</strong></p>
          </article>
        `,
      };
    },
  },
];

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Find a matching prerender rule.
    for (const pr of prerenders) {
      const m = pr.pattern.exec(path);
      if (!m) continue;
      const param = m[1]!;
      return handlePrerender(req, env, pr, param);
    }

    // Everything else is simple static/origin behavior. In a real deployment,
    // this would proxy to Cloudflare Pages or an R2 bucket.
    return new Response(
      `<!doctype html><meta charset="utf-8">
      <title>Mado edge prerender PoC</title>
      <h1>Mado edge prerender</h1>
      <p>Try <a href="/product/iphone-15">/product/iphone-15</a> or
      <a href="/product/macbook-pro">/product/macbook-pro</a>.</p>
      <p>View source to see ready HTML with meta tags.
      That is what Googlebot sees.</p>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  },
};

async function handlePrerender(
  _req: Request,
  env: Env,
  pr: (typeof prerenders)[number],
  param: string,
): Promise<Response> {
  const cacheKey = `${pr.pattern.source}:${param}`;
  const ttl = Number(env.CACHE_TTL ?? "3600");

  // 1. Hit?
  const cached = await env.PRERENDER.get(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": `public, max-age=${ttl}`,
        "x-prerender-cache": "HIT",
      },
    });
  }

  // 2. Miss → build, store, return
  try {
    const { title, description, bodyHtml } = await pr.build(param, env);
    const html = renderShell({ title, description, bodyHtml, canonical: undefined });

    await env.PRERENDER.put(cacheKey, html, { expirationTtl: ttl });

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": `public, max-age=${ttl}`,
        "x-prerender-cache": "MISS",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`<!doctype html><pre>prerender failed: ${escapeHtml(msg)}</pre>`, {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

/**
 * Build final HTML through linkedom. This is the same approach as
 * scripts/bake.mjs, but it runs at the edge instead of build time.
 *
 * The Mado script is loaded normally. After it loads, the client renders from
 * scratch and the prerendered HTML becomes only the initial shell.
 */
function renderShell(opts: {
  title: string;
  description: string;
  bodyHtml: string;
  canonical?: string;
}): string {
  const { document } = parseHTML(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div id="app"></div>
        <script type="importmap">
          { "imports": { "@madojs/mado": "/dist/src/index.js", "@madojs/mado/": "/dist/src/" } }
        </script>
        <script type="module" src="/dist/examples/showcase/main.js"></script>
      </body>
    </html>
  `);

  document.title = opts.title;

  const meta = (name: string, content: string) => {
    const el = document.createElement("meta");
    el.setAttribute("name", name);
    el.setAttribute("content", content);
    document.head.appendChild(el);
  };
  const og = (prop: string, content: string) => {
    const el = document.createElement("meta");
    el.setAttribute("property", prop);
    el.setAttribute("content", content);
    document.head.appendChild(el);
  };

  meta("description", opts.description);
  og("og:title", opts.title);
  og("og:description", opts.description);
  og("og:type", "article");

  if (opts.canonical) {
    const link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", opts.canonical);
    document.head.appendChild(link);
  }

  // Prerendered content. After Mado loads, the client rerenders this, but the
  // crawler and first paint already have meaningful HTML.
  const app = document.getElementById("app")!;
  app.innerHTML = opts.bodyHtml;

  return "<!doctype html>" + document.documentElement.outerHTML;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
