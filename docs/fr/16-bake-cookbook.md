# Bake cookbook

`mado bake` rend certaines routes en HTML statique. C'est pour le SEO et un
premier rendu rapide, pas pour SSR + hydration.

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

Dans les vues baked, préfère les tableaux simples (`items.map(...)`). Les
directives runtime comme `each()` sont pour le navigateur.

```ts
export const manifest = {
  "/": () => import("./pages/home.js"),
  "/blog/:slug": () => import("./pages/blog-post.js"),
};
export default routes(manifest);
```

`mado release` produit l'artefact déployable dans `out/`. Si bake signale une
valeur non supportée, remplace la partie runtime-only ou rends-la côté client.
