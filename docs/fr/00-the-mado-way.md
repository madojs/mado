# La voie Mado

> Une seule bonne façon. Des contrats stricts. Pas de magie.

Mado est un framework pour les équipes qui construisent des panneaux d'admin,
des outils internes et des SPA métier — des apps qui doivent être simples à
créer et ennuyeuses à maintenir. Pour cela, il impose un **ensemble de
conventions**. Si vous les respectez, le projet reste compréhensible même avec
200 écrans et 5 développeurs. Si vous les enfreignez — les types et le linter
vous le diront immédiatement.

## Principes

1. **Une seule voie.** Pour chaque tâche, il existe un seul chemin correct, pas cinq. Si vous
   écrivez quelque chose d'inhabituel — demandez-vous si un helper idiomatique n'existe pas déjà.
2. **L'explicite plutôt que la magie.** Pas de scanners de système de fichiers, pas de globals
   implicites, pas d'effets de bord cachés. Tout ce que fait le framework peut être lu dans un
   seul fichier.
3. **La plateforme d'abord.** Si le navigateur propose déjà une fonctionnalité — utilisez-la
   directement. Pas d'abstractions personnalisées sur `fetch`, `<form>`, l'History API, ou
   Shadow DOM.
4. **Types stricts.** `tsc --strict --noUncheckedIndexedAccess` toujours. Si quelque chose ne
   peut pas être typé — c'est un signal que l'API est mauvaise.
5. **Pas de dépendances runtime.** Chaque dépendance est un engagement sur des années ;
   l'écosystème Web Components n'en a pas besoin.

## Conventions

### Structure du projet

```
src/
├── routes.ts         ← manifeste de routes, un fichier par projet
├── main.ts           ← point d'entrée : providers + montage de <x-app>
├── pages/            ← une page = un fichier = `export default page({...})`
├── components/       ← composants réutilisables, enregistrement des effets de bord
├── lib/              ← contextes, clients API, logique métier sans UI
└── styles/           ← styles partagés (si nécessaire), fichiers .ts avec css``
```

C'est **obligatoire**, pas optionnel. Si un projet a 10 développeurs — ils doivent
tous écrire de la même manière.

### Un composant = un fichier

```ts
// src/components/user-card.ts
import { component, html, css } from "@madojs/mado";

component(
  "x-user-card",
  () => {
    return () => html`<div class="card"><slot /></div>`;
  },
  {
    styles: css`
      .card {
        padding: 1rem;
      }
    `,
  },
);
```

`import './components/user-card.js'` **enregistre** le composant via
`customElements.define`. C'est un effet de bord. Importez là où le composant est nécessaire.

### Une seule façon de charger les données

❌ N'appelez pas `fetch()` directement depuis un composant. Utilisez toujours :

```ts
// lecture → resource
const user = resource(() => `/api/users/${id()}`, jsonFetcher());

// écriture → mutation
const save = mutation(api.save, { invalidates: ["/api/users*"] });
```

Cela fournit la mise en cache, l'annulation, la gestion des erreurs et l'invalidation automatique.

### Une seule façon de décrire une page

```ts
// src/pages/user-profile.ts
import { page, html, resource, jsonFetcher } from "@madojs/mado";

export default page({
  title: ({ id }) => `Utilisateur #${id}`,
  view: ({ params }) => html`...`,
});
```

Trois emplacements — `title`, `load`, `view`. Pas d'autres. Vous voulez autre chose — c'est
un composant ou un helper.

### Une seule façon de déclarer les routes

Voir [`01-routing.md`](./01-routing.md).

## Ce que nous NE faisons PAS

- ❌ N'écrivez pas de composants sans trait d'union. C'est la règle du navigateur pour
  les custom elements : `user-card` est correct, `usercard` ne l'est pas.
- `x-*` n'est qu'une convention pour les exemples et les tests Mado, pas un standard de marque.
  En production, utilisez un préfixe de domaine : `app-*`, `crm-*`, `ticket-*`, `admin-*`.
- ❌ N'utilisez pas `innerHTML` directement. Uniquement via `html\`\``.
- ❌ N'appelez pas `setTimeout`/`setInterval` sans nettoyage. Uniquement à l'intérieur de `effect()`.
- ❌ Ne stockez pas d'état mutable global. Utilisez les signals et `context`.
- ❌ N'ajoutez pas de packages sans discussion. Chaque dépendance est un engagement.

## En cas de doute

Si vous vous demandez "quelle est la meilleure façon ici ?" — c'est un signal que :

1. Soit il existe un helper intégré que vous ne connaissez pas (consultez `docs/`).
2. Soit c'est une nouvelle situation — discutez-en et **consignez-la** dans ce document
   comme une convention supplémentaire.

"Un 'bien' cohérent vaut mieux qu'un 'idéal' varié."
