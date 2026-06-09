# Bake cookbook

`mado bake` рендерить вибрані маршрути у статичний HTML. Це для SEO та швидкого
першого рендеру, не SSR з hydration.

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

У baked views краще використовувати звичайні масиви (`items.map(...)`).
Runtime-директиви на кшталт `each()` потрібні браузеру.

```ts
export const manifest = {
  "/": () => import("./pages/home.js"),
  "/blog/:slug": () => import("./pages/blog-post.js"),
};
export default routes(manifest);
```

`mado release` створює deploy artifact у `out/`. Якщо bake повідомляє про
unsupported value, винеси runtime-only частину в клієнт або заміни її на
серіалізований HTML.
