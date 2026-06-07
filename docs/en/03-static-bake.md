# Smart Static (`bake`)

> Baking HTML for SEO without runtime SSR. **Idea: data and view in one file, static output.**

`bake` is a **build-time prerender**, not SSR. The output is static `*.html` files that any nginx/Cloudflare serves as regular static content. On the client, Web Components come alive and SPA navigation continues to work.

---

## When `bake` is suitable

- **Marketing pages**: landing pages, sub-landings for advertising campaigns, product pages.
- **Catalog with a relatively stable set of pages**: blog, documentation, portfolio, e-commerce up to **~10k SKUs** with updates less than once an hour.
- **Content that is the same for all users**: the entire page is identical for a guest and an authenticated user (or authentication is rendered on the client via `effect()`).
- You need **good SEO** (rich snippets, OG, JSON-LD) and **fast first paint** without running node servers in production.

## When `bake` is **not** suitable

- **Hundreds of thousands of pages with frequent changes**. `bake` traverses all `paths` synchronously in one run. For 100k+ pages this means minutes of rebuild, and invalidating one page either requires a full rebake or separate CI logic (see below on targeted revalidation).
- **Personalized content in HTML**. If the page should show "Hello, Ivan" in the `<title>` or in meta — that's not for `bake`. Authenticated dashboards, personal feeds, a cart with real prices for the user — keep these as SPA.
- **Server-only APIs are needed in render**: cookies, headers, real network requests to private APIs. On the bake side only `linkedom` is available, no Node environment for components.
- **A/B tests and flags that change markup on the first paint**. `bake` will lock in one variant. Handle dynamic behavior on the client via `effect()`.
- **Real-time / frequently changing data** (stock quotes, warehouse stock by the minute). `bake.revalidate` is metadata, not runtime: the framework does not re-bake anything itself.
- **Content behind authentication** (admin, internal tools). No need; use SPA mode.

---

## Concept

`page({...})` has four optional slots related to `bake`:

- `head` — meta, OG, JSON-LD.
- `bake.paths` — list of URL parameters for generation (build-time, can be `async`).
- `bake.data` — data for a specific URL (build-time, can be `async`).
- `bake.revalidate` — after how many seconds the cache is stale (written to `<meta>`, real invalidation is handled by your CI/CDN).

The `npm run bake` command traverses all `page` entries with `bake`, generates HTML via `linkedom`, and places it in `out/<path>/index.html`. **No Chromium needed** — `linkedom` is ~50 KB.

---

## Example

```ts
// src/pages/product.ts
import { page, component, html } from "@madojs/mado";
import { findProduct, products, type Product } from "../lib/products.js";

component("x-product-page", ({ host }) => {
  return () => {
    const p = findProduct(host.dataset.slug);
    return p
      ? html`<h1>${p.name}</h1><p>${p.description}</p>`
      : html`<p>Not found.</p>`;
  };
});

export default page<{ slug: string }, Product | undefined>({
  title: ({ slug }) => `${findProduct(slug)?.name} — MyShop`,

  head: ({ slug }, baked) => {
    const p = baked ?? findProduct(slug);
    if (!p) return {};
    return {
      description: p.description,
      canonical: `/product/${p.slug}`,
      og: { title: p.name, image: p.image, type: "product" },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        offers: { "@type": "Offer", price: p.price, priceCurrency: p.currency },
      },
    };
  },

  bake: {
    paths: () => products.map((p) => ({ slug: p.slug })),
    data: ({ slug }) => findProduct(slug),
    revalidate: 3600,
  },

  view: ({ params }) =>
    html`<x-product-page data-slug=${params.slug}></x-product-page>`,
});
```

```ts
// src/routes.ts
import { routes, type RoutesMap } from "@madojs/mado";

// Export BOTH default (RouterApi for runtime) AND manifest (for the bake script).
export const manifest: RoutesMap = {
  "/": () => import("./pages/home.js"),
  "/product/:slug": () => import("./pages/product.js"),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest, { titleSuffix: " · MyShop" });
```

## Running

```bash
npm install -D linkedom esbuild
npm run build
npm run bake
```

You get:

```
out/
├── product/
│   ├── mado-mug/index.html        ← HTML with meta + JSON-LD
│   ├── raw-bundler/index.html
│   └── shadow-dom/index.html
└── sitemap.xml
```

## What's Inside the Generated HTML

```html
<head>
  <title>Mado Mug — MyShop</title>
  <meta name="description" content="..." data-mado-head="baked">
  <link rel="canonical" href="/product/mado-mug" data-mado-head="baked">
  <meta property="og:title" content="Mado Mug" data-mado-head="baked">
  <meta property="og:image" content="..." data-mado-head="baked">
  <script type="application/ld+json" data-mado-head="baked">
    {"@context":"https://schema.org","@type":"Product","..."}
  </script>
  <meta name="bake-revalidate" content="3600" data-mado-head="baked">
  <meta name="bake-stamp" content="1234567890" data-mado-head="baked">
</head>
<body>
  <div id="app">
    <x-product-page data-slug="mado-mug">
      <h1>Mado Mug</h1>
      <p>A mug with the inscription "zero dependencies".</p>
      <strong>12 EUR</strong>
    </x-product-page>
  </div>

  <!-- preloaded data for hydration -->
  <script id="bake" type="application/json">
    {"slug":"mado-mug","name":"Mado Mug","price":12,"..."}
  </script>

  <script type="module" src="/dist/examples/main.js"></script>
</body>
```

After JS loads:

1. Web Components `<x-product-page>` come alive (the browser already knows the custom elements).
2. `page.load()` receives `baked` as initialData — no unnecessary `fetch` calls.
3. SPA navigation continues to work as normal.

---

## Cookbook: Typical Scenarios

### Blog (Markdown → bake)

```ts
// src/lib/posts.ts
import { readdirSync, readFileSync } from "node:fs";
// (this module is imported only from the bake script,
// it must not end up in the browser graph — put it in lib/server/ or ifdef it out)

export const allPosts = () =>
  readdirSync("content/blog").map((file) => ({
    slug: file.replace(/\.md$/, ""),
    ...parseFrontmatter(readFileSync(`content/blog/${file}`, "utf-8")),
  }));
```

```ts
// src/pages/blog-post.ts
import { page, html } from "@madojs/mado";
import { allPosts } from "../lib/posts.js";

export default page<{ slug: string }>({
  title: ({ slug }) => allPosts().find((p) => p.slug === slug)?.title ?? slug,
  head: ({ slug }, post) => ({
    description: post?.excerpt,
    canonical: `/blog/${slug}`,
    og: { title: post?.title, type: "article" },
  }),
  bake: {
    paths: () => allPosts().map(({ slug }) => ({ slug })),
    data: ({ slug }) => allPosts().find((p) => p.slug === slug),
  },
  view: ({ params }) =>
    html`<x-blog-post data-slug=${params.slug}></x-blog-post>`,
});
```

### Product Catalog (e-commerce, ≤ 10k SKUs)

- `bake.paths` → SELECT slug FROM products
- `bake.data` → SELECT * FROM products WHERE slug=?
- Full invalidation every N hours via cron + `npm run bake`
- Targeted invalidation of a single product: webhook → rebuild only that `paths` entry

### Documentation

- `bake.paths` — traversal of the file system `docs/**/*.md`
- `bake.data` — Markdown parsing
- `head.jsonLd` — `TechArticle`

---

## Revalidate / CDN

`bake.revalidate: 3600` writes `<meta name="bake-revalidate" content="3600">` and `bake-stamp` to the HTML. This is **metadata** — the framework does not re-bake anything itself. Strategies:

1. **Simplest option**: cron in CI — `npm run bake && rsync out/ origin:/var/www/`.
2. **Via CDN** (Cloudflare/Fastly): serve HTML with `Cache-Control: max-age=3600`. CDN invalidates itself.
3. **Webhook trigger**: shop API → POST `/_revalidate?path=/product/mado-mug` → CI re-bakes only that page (you can implement `bake.paths` to return a targeted list based on an env parameter).

---

## Comparison with Alternatives

|                          | Next.js SSG/ISR    | playwright-prerender | **mado bake** |
|--------------------------|--------------------|----------------------|-----------------|
| Chrome required in CI    | no                 | **yes** (~300 MB)    | **no**          |
| Node required in production | for ISR         | no                   | **no**          |
| Time for 1000 pages      | minutes            | minutes              | **seconds**     |
| Magic level              | high               | low                  | **zero**        |
| HTML parser              | React renderer     | browser              | linkedom (~50 KB) |
| Configuration            | next.config.js + … | single script        | single script   |
| Source of truth view+data | separate          | page                 | **one page**    |

---

## Limitations and Gotchas

- **There is no browser on the bake side.** The following do not work: `setTimeout` (technically it works, but bake finishes before it fires), `fetch` to relative URLs, any `effect()`/`signal()` side effects, real `requestAnimationFrame`. The render function must be deterministic based on `params` / `data`.
- **`linkedom` ≠ browser.** Not all DOM APIs are supported (for example, `HTMLElement.click()` behaves more simply). Heavy logic in Web Components will only execute in the browser after `connectedCallback`; only what rendered synchronously on the first pass will end up in the baked HTML.
- **Render dynamic content on the client.** Current time, A/B tests, geo-banners, the user's cart — these must not be in the baked HTML. Use `effect()` for client-side rendering.
- **Server-side imports must not end up in the client graph.** If `lib/posts.ts` imports `node:fs`, it cannot be imported from `view`. Keep such modules in a separate folder (`lib/build/`) and use them only from `bake.paths`/`bake.data`.
- **`paths` and `data` are executed on every bake run.** If they involve a heavy database query — cache at the script level.

---

## TL;DR

If a page is **the same for all users**, has **a relatively stable set of URLs**, and **SEO + first paint** matter — add `bake: { paths, data }` and get static HTML with meta/JSON-LD/sitemap in milliseconds. No node server, no Chrome, no magic.

If the page is personalized, or there are millions of URLs, or content changes in real time — `bake` is not your tool. Keep it as SPA or bring in a separate SSR framework.
