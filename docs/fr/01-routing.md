# Routage

> Un seul fichier manifeste. Pas de scanners de dossiers. Pas de caractères spéciaux.

## Pourquoi pas de routes basées sur les fichiers

Dans Next/SvelteKit/SolidStart, les routes apparaissent "magiquement" à partir des noms de
fichiers. Cela a des avantages (la structure d'URL visible dans `pages/`), mais en production
cela signifie :

- Un plugin-scanner invisible dans le build. Sans lui, les fichiers ne sont que des fichiers.
- Des caractères spéciaux dans les chemins : `[id]`, `(group)`, `_layout`, `+page.svelte`, `...slug`.
- Les routes serveur et les routes client se mélangent.
- Tester le routage est pénible : vous avez besoin d'un émulateur de build-tool.

Mado considère cela comme **trop de magie**. Nous procédons différemment.

## Manifeste

Un seul fichier — `src/routes.ts`. Un seul objet. Lu de haut en bas.

```ts
// src/routes.ts
import { routes } from 'madojs';

export default routes({
  '/':              () => import('./pages/home.js'),
  '/about':         () => import('./pages/about.js'),
  '/users/:id':     () => import('./pages/user-profile.js'),
  '/users/:id/edit':() => import('./pages/user-edit.js'),
  '*':              () => import('./pages/not-found.js'),
});
```

Vous voulez voir toutes les routes ? Ouvrez `routes.ts`. Pas de surprises.

## Ce qui va à droite d'un chemin

Chaque entrée est **l'une de ces trois choses** :

### 1. Import lazy (recommandé)

```ts
'/posts': () => import('./pages/posts.js'),
```

- Le navigateur crée son propre chunk lors du bundling (esbuild --bundle --splitting).
- Le module est chargé uniquement quand l'utilisateur visite la route.
- Les navigations suivantes utilisent le résultat mis en cache.

### 2. Page prête (eager)

```ts
import about from './pages/about.js';

'/about': about,
```

Dans le bundle immédiatement, sans délai. Utilisez pour les pages critiques (accueil, connexion).

### 3. Imbriqué avec layout

```ts
import { routes, nested } from 'madojs';

export default routes({
  '/': () => import('./pages/home.js'),

  '/admin/*': nested({
    layout: () => import('./layouts/admin.js'),
    routes: {
      '':       () => import('./pages/admin/dashboard.js'),
      'users':  () => import('./pages/admin/users.js'),
      'logs':   () => import('./pages/admin/logs.js'),
    },
  }),
});
```

Un layout est juste une `page({...})` ordinaire qui rend `ctx.child` où elle le souhaite :

```ts
// src/layouts/admin.ts
import { page, html, css, component } from 'madojs';

export default page({
  view: ({ child }) => html`
    <div class="admin">
      <aside><nav>...</nav></aside>
      <main>${child}</main>
    </div>
  `,
});
```

## Contrat de page

```ts
import { page, html, resource, jsonFetcher } from 'madojs';

export default page({
  title: ({ id }) => `Utilisateur #${id}`,        // string | (params) => string
  load:  ({ id }) => resource(...),                // optionnel, retourne Resource ou data
  view:  ({ params, data, path, child }) => html`...`,  // OBLIGATOIRE
});
```

Trois emplacements, c'est tout. Si vous exportez autre chose que `page({...})`, une simple
fonction par exemple — `routes()` génère une erreur claire :

```
[Mado] La route lazy n'a pas retourné page({...}) comme export par défaut.
```

## Paramètres d'URL

```ts
'/users/:id': () => import('./pages/user.js'),
```

```ts
export default page<{ id: string }>({
  title: ({ id }) => `Utilisateur ${id}`,
  view:  ({ params }) => html`<h1>${params.id}</h1>`,
});
```

Les types sont passés dans `page<Params>` — `tsc` vérifie que vous n'accédez pas à
`params.foo` qui n'existe pas dans la route.

## Options globales

```ts
export default routes(
  { '/': home, '/about': about, '*': nf },
  {
    titleSuffix: ' · MonApp',                      // → "Accueil · MonApp"
    loading: () => html`<x-spinner/>`,             // pendant le chargement du module
    error:   (err) => html`<x-fatal-error .err=${err}/>`,
  },
);
```

## Navigation programmatique

```ts
import route from './routes.js';

route.navigate('/posts');
route.navigate('/posts?page=2');
route.navigate('/posts', { replace: true });
```

Les clics sur `<a href="/foo" data-link>` sont interceptés globalement (sans l'attribut —
le navigateur effectue un rechargement complet, comme prévu pour les liens externes).

## Paramètres de requête

```ts
import { queryParam } from 'madojs';

const page = queryParam('page', '1');
page();              // '1'
page.set('2');       // history.replaceState + re-rendu
page.set(null);      // supprimer le paramètre
page.set('3', { push: true });   // history.pushState
```

`queryParam` est un signal normal. Utilisez-le n'importe où : dans les pages, les composants,
les computed.

## Ce qui est intentionnellement absent

- ❌ Auto-scan de `pages/`. **Un seul fichier manifeste explicite**.
- ❌ Caractères spéciaux dans les chemins (`[id]`, `(group)`, `_layout`). **Les paramètres sont
  uniquement `:name`, rien d'autre**.
- ❌ Routage côté serveur dans le même manifeste. Mado est un framework côté client.
- ❌ Auto-préchargement au survol. Si vous en avez vraiment besoin — faites-le manuellement :
  `link.addEventListener('mouseenter', loader)`. Généralement inutile.

## FAQ

**Et si j'ai 100 routes ? Le fichier ne deviendra-t-il pas énorme ?**
Il atteindra ~150 lignes. C'est toujours **une seule source de vérité** contre une centaine
de fichiers dans `pages/` avec des noms magiques. En pratique, même les grands projets (1000+
pages) peuvent se diviser en manifestes de fonctionnalités :

```ts
import { routes } from 'madojs';
import adminRoutes from './features/admin/routes.js';
import billingRoutes from './features/billing/routes.js';

export default routes({
  ...adminRoutes,
  ...billingRoutes,
  '*': () => import('./pages/not-found.js'),
});
```

**Comment tester le routage ?**
Importez `routes.ts` — c'est juste un objet. Substituez votre router mock. Pas besoin
d'émulation de build-tool.
