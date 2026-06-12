# Static intelligent (`bake`)

> Générer du HTML pour le SEO sans SSR runtime. **Idée : données et vue dans un seul fichier, sortie statique.**

`bake` est un **prérendu au moment du build**, pas du SSR. La sortie est des fichiers `*.html`
statiques que n'importe quel nginx/Cloudflare sert comme du contenu statique ordinaire. Sur le
client, les Web Components s'animent et la navigation SPA continue de fonctionner.

---

## Quand `bake` est adapté

- **Pages marketing** : landing pages, sous-landings pour des campagnes publicitaires, pages produits.
- **Catalogue avec un ensemble de pages relativement stable** : blog, documentation, portfolio,
  e-commerce jusqu'à **~10k SKUs** avec des mises à jour moins d'une fois par heure.
- **Contenu identique pour tous les utilisateurs** : la page entière est identique pour un
  visiteur et un utilisateur authentifié (ou l'authentification est rendue côté client via `effect()`).
- Vous avez besoin d'un **bon SEO** (rich snippets, OG, JSON-LD) et d'un **premier affichage
  rapide** sans faire tourner des serveurs node en production.

## Quand `bake` n'est **pas** adapté

- **Des centaines de milliers de pages avec des changements fréquents**. `bake` parcourt tous
  les `paths` de façon synchrone en une seule exécution. Pour 100k+ pages, cela signifie des
  minutes de rebuild, et l'invalidation d'une page nécessite soit un rebake complet, soit une
  logique CI séparée (voir ci-dessous sur la revalidation ciblée).
- **Contenu personnalisé dans le HTML**. Si la page doit afficher "Bonjour, Ivan" dans le
  `<title>` ou dans les meta — ce n'est pas pour `bake`. Les tableaux de bord authentifiés,
  les fils personnalisés, un panier avec des prix réels pour l'utilisateur — gardez-les en SPA.
- **Des API uniquement serveur sont nécessaires lors du rendu** : cookies, headers, vraies
  requêtes réseau vers des API privées. Côté bake, seul `linkedom` est disponible, pas
  d'environnement Node pour les composants.
- **Tests A/B et flags qui modifient le markup au premier affichage**. `bake` verrouillera
  une variante. Gérez le comportement dynamique côté client via `effect()`.
- **Données en temps réel / qui changent fréquemment** (cours boursiers, stock entrepôt à la
  minute). `bake.revalidate` est des métadonnées, pas du runtime : le framework ne re-bake
  rien lui-même.
- **Contenu derrière une authentification** (admin, outils internes). Inutile ; utilisez le
  mode SPA.

---

## Concept

`page({...})` a quatre emplacements optionnels liés à `bake` :

- `head` — meta, OG, JSON-LD.
- `bake.paths` — liste des paramètres URL pour la génération (build-time, peut être `async`).
- `bake.data` — données pour une URL spécifique (build-time, peut être `async`).
- `bake.revalidate` — après combien de secondes le cache est périmé (écrit dans `<meta>`, la
  vraie invalidation est gérée par votre CI/CDN).

La commande `npm run bake` parcourt toutes les entrées `page` avec `bake`, génère le HTML via
`linkedom`, et le place dans `out/<chemin>/index.html`. **Pas de Chromium nécessaire** —
`linkedom` fait ~50 Ko.

---

## Exemple

```ts
// src/pages/product.ts
import { page, component, html } from "@madojs/mado";
import { findProduct, products, type Product } from "../lib/products.js";

component("x-product-page", ({ host }) => {
  return () => {
    const p = findProduct(host.dataset.slug);
    return p
      ? html`<h1>${p.name}</h1><p>${p.description}</p>`
      : html`<p>Introuvable.</p>`;
  };
});

export default page<{ slug: string }, Product | undefined>({
  title: ({ slug }) => `${findProduct(slug)?.name} — MaBoutique`,

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

// Exporter À LA FOIS default (RouterApi pour le runtime) ET manifest (pour le script bake).
export const manifest: RoutesMap = {
  "/": () => import("./pages/home.js"),
  "/product/:slug": () => import("./pages/product.js"),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest, { titleSuffix: " · MaBoutique" });
```

## Exécution

```bash
npm install -D linkedom esbuild
npm run build
npm run bake
```

Vous obtenez :

```
out/
├── product/
│   ├── mado-mug/index.html        ← HTML avec meta + JSON-LD
│   ├── raw-bundler/index.html
│   └── shadow-dom/index.html
└── sitemap.xml
```

## Contenu du HTML généré

```html
<head>
  <title>Mado Mug — MaBoutique</title>
  <meta name="description" content="..." data-mado-head="baked">
  <link rel="canonical" href="/product/mado-mug" data-mado-head="baked">
  <meta property="og:title" content="Mado Mug" data-mado-head="baked">
  <meta property="og:image" content="..." data-mado-head="baked">
  <script type="application/ld+json" data-mado-head="baked">
    {"@context":"https://schema.org","@type":"Product","..."}
  </script>
  <meta name="bake-revalidate" content="3600" data-mado-head="baked">
</head>
<body>
  <div id="app">
    <x-product-page data-slug="mado-mug">
      <h1>Mado Mug</h1>
      <p>Un mug avec l'inscription "zéro dépendances".</p>
      <strong>12 EUR</strong>
    </x-product-page>
  </div>

  <!-- données préchargées pour l'hydratation -->
  <script id="bake" type="application/json">
    {"slug":"mado-mug","name":"Mado Mug","price":12,"..."}
  </script>

  <script type="module" src="/dist/examples/main.js"></script>
</body>
```

Après le chargement du JS :

1. Les Web Components `<x-product-page>` s'animent (le navigateur connaît déjà les custom elements).
2. `page.load()` reçoit `baked` comme initialData — pas d'appels `fetch` inutiles.
3. La navigation SPA continue de fonctionner normalement.

---

## Cookbook : Scénarios typiques

### Blog (Markdown → bake)

```ts
// src/lib/posts.ts
import { readdirSync, readFileSync } from "node:fs";
// (ce module est importé uniquement depuis le script bake,
// il ne doit pas se retrouver dans le graph navigateur — mettez-le dans lib/server/ ou excluez-le)

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

### Catalogue produits (e-commerce, ≤ 10k SKUs)

- `bake.paths` → SELECT slug FROM products
- `bake.data` → SELECT * FROM products WHERE slug=?
- Invalidation complète toutes les N heures via cron + `npm run bake`
- Invalidation ciblée d'un seul produit : webhook → rebuild uniquement cette entrée `paths`

### Documentation

- `bake.paths` — parcours du système de fichiers `docs/**/*.md`
- `bake.data` — parsing Markdown
- `head.jsonLd` — `TechArticle`

---

## Revalidate / CDN

`bake.revalidate: 3600` écrit `<meta name="bake-revalidate" content="3600">`
dans le HTML. C'est des **métadonnées** — le framework ne re-bake rien lui-même. Stratégies :

1. **Option la plus simple** : cron dans CI — `npm run bake && rsync out/ origin:/var/www/`.
2. **Via CDN** (Cloudflare/Fastly) : servir le HTML avec `Cache-Control: max-age=3600`. Le CDN
   s'invalide lui-même.
3. **Déclencheur webhook** : API boutique → POST `/_revalidate?path=/product/mado-mug` → CI
   re-bake uniquement cette page (vous pouvez implémenter `bake.paths` pour retourner une liste
   ciblée basée sur un paramètre d'environnement).

---

## Comparaison avec les alternatives

|                          | Next.js SSG/ISR    | playwright-prerender | **mado bake** |
|--------------------------|--------------------|----------------------|-----------------|
| Chrome requis en CI      | non                | **oui** (~300 Mo)    | **non**          |
| Node requis en production | pour ISR          | non                  | **non**          |
| Temps pour 1000 pages    | minutes            | minutes              | **secondes**     |
| Niveau de magie          | élevé              | faible               | **zéro**        |
| Parser HTML              | moteur React       | navigateur           | linkedom (~50 Ko) |
| Configuration            | next.config.js + … | script unique        | script unique   |
| Source de vérité vue+données | séparées       | page                 | **une seule page** |

---

## Limitations et pièges

- **Il n'y a pas de navigateur côté bake.** Ne fonctionnent pas : `setTimeout` (techniquement
  ça marche, mais bake se termine avant qu'il ne se déclenche), `fetch` vers des URLs relatives,
  tous les effets de bord `effect()`/`signal()`, le vrai `requestAnimationFrame`. La fonction
  de rendu doit être déterministe selon `params` / `data`.
- **`linkedom` ≠ navigateur.** Toutes les API DOM ne sont pas supportées (par exemple,
  `HTMLElement.click()` se comporte plus simplement). La logique complexe dans les Web Components
  ne s'exécutera dans le navigateur qu'après `connectedCallback` ; seul ce qui a été rendu
  de façon synchrone lors du premier passage se retrouvera dans le HTML baked.
- **Rendre le contenu dynamique côté client.** L'heure actuelle, les tests A/B, les
  banners géo, le panier de l'utilisateur — ceux-ci ne doivent pas être dans le HTML baked.
  Utilisez `effect()` pour le rendu côté client.
- **Les imports côté serveur ne doivent pas se retrouver dans le graph client.** Si
  `lib/posts.ts` importe `node:fs`, il ne peut pas être importé depuis `view`. Gardez ces
  modules dans un dossier séparé (`lib/build/`) et utilisez-les uniquement depuis
  `bake.paths`/`bake.data`.
- **`paths` et `data` sont exécutés à chaque exécution de bake.** S'ils impliquent une
  requête de base de données lourde — mettez en cache au niveau du script.

---

## TL;DR

Si une page est **identique pour tous les utilisateurs**, a **un ensemble d'URLs relativement
stable**, et que **le SEO + le premier affichage** comptent — ajoutez `bake: { paths, data }`
et obtenez du HTML statique avec meta/JSON-LD/sitemap en millisecondes. Pas de serveur node,
pas de Chrome, pas de magie.

Si la page est personnalisée, ou qu'il y a des millions d'URLs, ou que le contenu change en
temps réel — `bake` n'est pas votre outil. Gardez-la en SPA ou intégrez un framework SSR séparé.
