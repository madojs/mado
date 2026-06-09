# Bake cookbook

`mado bake` рендерит выбранные роуты в статический HTML. Это для SEO и быстрого
первого ответа, не SSR с hydration.

## Минимальная страница

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
директивы вроде `each()` нужны браузеру.

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

`unsafeHTML()` используй только для доверенного или заранее очищенного HTML.

## Manifest и output

```ts
export const manifest = {
  "/": () => import("./pages/home.js"),
  "/blog/:slug": () => import("./pages/blog-post.js"),
};
export default routes(manifest);
```

`mado release` создает deploy artifact в `out/`. Если bake ругается на
unsupported value, значит в статическую страницу попало runtime-only значение:
замени `each()` на `items.map(...)` или вынеси интерактивный кусок в клиент.
