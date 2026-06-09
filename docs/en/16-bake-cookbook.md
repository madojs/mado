# Bake cookbook

`mado bake` renders selected routes into static HTML. It is for SEO and fast
first paint, not for server-side hydration.

## Minimal baked page

```ts
export default page({
  head: () => ({ title: "Products", description: "Product catalog" }),
  view: ({ data }) => html`
    <main>
      <h1>Products</h1>
      ${data.products.map((p) => html`<article><h2>${p.name}</h2></article>`)}
    </main>
  `,
  bake: {
    paths: () => [{}],
    data: async () => ({ products: await api.products() }),
    revalidate: 3600,
  },
});
```

For baked pages, use plain arrays in `view()` when possible. Runtime-only
directives such as keyed `each()` are for the browser.

## Dynamic routes

```ts
export default page<{ slug: string }>({
  head: ({ slug }, data) => ({ title: data.title, canonical: `/blog/${slug}` }),
  view: ({ data }) => html`<article>${unsafeHTML(data.html)}</article>`,
  bake: {
    paths: async () => (await api.posts()).map((p) => ({ slug: p.slug })),
    data: ({ slug }) => api.post(slug),
  },
});
```

`unsafeHTML()` is allowed only for trusted or already-sanitized HTML.

## Route manifest

`mado bake` needs the source manifest:

```ts
export const manifest = {
  "/": () => import("./pages/home.js"),
  "/blog/:slug": () => import("./pages/blog-post.js"),
};

export default routes(manifest);
```

## Output

By default app-mode writes baked pages under `out/baked/`. `mado release`
produces the final deploy artifact:

```bash
mado release
tree out
```

The deployable folder is `out/`, not `dist/`.

## Unsupported values

Bake intentionally fails loudly instead of writing `[object Object]`. If a baked
view throws an unsupported directive error:

- replace `each()` with `items.map(...)` in baked markup;
- keep interactive-only widgets behind client routes;
- make sure every value can be serialized to static HTML.

## Canonical links

Pass `--base-url` or set `bake.baseUrl` in `mado.config.json` so generated
canonical links and sitemap entries point to production.

```json
{
  "bake": {
    "baseUrl": "https://example.com"
  }
}
```

## When not to bake

Do not bake pages whose content is user-specific, permission-dependent, or
changes every few seconds. Use a normal SPA route with `resource()` instead.
