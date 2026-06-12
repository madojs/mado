# Bake Cookbook

`mado bake` рендерит выбранные роуты в статический HTML. Это для SEO и быстрого
первого ответа, не SSR с hydration.

## Минимальная Страница

```ts
export default page({
  head: () => ({ title: "Products", description: "Catalog" }),
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

В baked views лучше использовать обычные массивы (`items.map(...)`). Runtime
директивы вроде keyed `each()` нужны браузеру.

## Dynamic Routes

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

`unsafeHTML()` используй только для доверенного или заранее очищенного HTML.

## Route Manifest

`mado bake` нужен source manifest:

```ts
export const manifest = {
  "/": () => import("./pages/home.js"),
  "/blog/:slug": () => import("./pages/blog-post.js"),
};

export default routes(manifest);
```

## Output

Standalone `mado bake` по умолчанию пишет baked pages в `out/baked/`.
`mado release` использует bundled production shell, оставляет копию в
`out/baked/` для inspection, промотирует HTML в реальные route paths внутри
`out/` и копирует sitemap в `out/sitemap.xml`.

```bash
mado release
tree out
```

Deployable folder — `out/`, не `dist/`.

## Client Boot

Baked HTML помечает `#app` атрибутом `data-mado-baked`. Это не hydration:
клиентский `render()` заменяет baked DOM живыми bindings при старте приложения.
Так первый ответ содержит SEO/first-paint HTML, а SPA после загрузки работает
как обычно.

## Unsupported Values

Bake намеренно падает громко вместо записи `[object Object]`. Если baked view
ругается на unsupported directive:

- замени `each()` на `items.map(...)` в baked markup;
- интерактивные виджеты оставь в client-only routes;
- убедись, что все значения сериализуются в статический HTML.

## Canonical Links

Передай `--base-url` или задай `bake.baseUrl` в `mado.config.json`, чтобы
canonical links и sitemap указывали на production.
