# Bake Cookbook

`mado bake` rend certaines routes en HTML statique. C'est pour le SEO et un
premier rendu rapide, pas pour SSR + hydration.

## Page Minimale

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
directives runtime comme keyed `each()` sont pour le navigateur.

## Routes Dynamiques

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

Utilise `unsafeHTML()` seulement pour du HTML fiable ou déjà nettoyé.

## Route Manifest

`mado bake` a besoin du manifest source :

```ts
export const manifest = {
  "/": () => import("./pages/home.js"),
  "/blog/:slug": () => import("./pages/blog-post.js"),
};

export default routes(manifest);
```

## Output

Standalone `mado bake` écrit les pages baked dans `out/baked/` par défaut.
`mado release` utilise le shell de production bundlé, garde cette copie
`out/baked/` pour inspection, promeut le HTML dans les vrais chemins de route
dans `out/`, et copie le sitemap vers `out/sitemap.xml`.

```bash
mado release
tree out
```

Le dossier déployable est `out/`, pas `dist/`.

## Client Boot

Le HTML baked marque `#app` avec `data-mado-baked`. Ce n'est pas de
l'hydration : au démarrage, `render()` remplace le DOM baked par les bindings
vivants de l'application.

## Valeurs Non Supportées

Bake échoue volontairement au lieu d'écrire `[object Object]`. Si une vue baked
signale une directive non supportée :

- remplace `each()` par `items.map(...)` dans le markup baked ;
- garde les widgets interactifs dans des routes client-only ;
- assure-toi que chaque valeur peut être sérialisée en HTML statique.

## Canonical Links

Passe `--base-url` pour que les liens canonical et le sitemap pointent vers la
production.
