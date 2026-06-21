# La voie Mado

> Une seule bonne façon. Des contrats stricts. Pas de magie.

Mado est un framework pour les équipes qui construisent des panneaux d'admin,
des outils internes et des SPA métier. Ces apps doivent être simples à créer
et ennuyeuses à maintenir. Mado préfère donc des conventions claires à cinq
styles équivalents.

## Principes

1. **Une seule voie.** Si vous écrivez quelque chose d'inhabituel, vérifiez
   d'abord s'il existe déjà un helper/API canonique.
2. **L'explicite plutôt que la magie.** Pas de file-system scanners, globals
   implicites ou side effects cachés.
3. **La plateforme d'abord.** Web Components, History API, `<form>`, `fetch` et
   Shadow DOM restent visibles.
4. **Types stricts.** `tsc --strict --noUncheckedIndexedAccess` toujours.
5. **Pas de dépendances runtime.** Le tooling dev/build est acceptable ; le
   runtime Mado reste natif.

## Structure du projet

```txt
src/
├── main.ts           ← boot: global CSS/providers + render router
├── app.routes.ts     ← readable app map, exports `manifest` + default routes()
├── layouts/          ← app-zone wrappers (`page({ view: ({ child }) => ... })`)
├── shared/           ← UI bricks, http client, pure lib, global CSS
└── modules/          ← bounded contexts
    └── billing/
        ├── billing.routes.ts
        ├── billing.public.ts
        ├── billing.types.ts
        ├── pages/
        ├── data/
        ├── api/
        └── _contracts/
```

Le starter par défaut est la version canonique de cette forme. Si d'anciens
exemples divergent, le starter et `docs/10-app-architecture.md` gagnent.

## Un composant = un fichier

```ts
import { component, css, html } from "@madojs/mado";

component("x-user-card", () => () => html`<div class="card"><slot></slot></div>`, {
  styles: css`
    .card { padding: 1rem; }
  `,
});
```

Importer le fichier du composant enregistre l'élément. Importez-le là où le tag
est utilisé.

## Une seule façon de décrire une page

```ts
import { html, page, resource, jsonFetcher } from "@madojs/mado";

export default page({
  title: ({ id }) => `User #${id}`,
  view: ({ params }) => {
    const user = resource(() => `/api/users/${params.id}`, jsonFetcher());
    return html`...`;
  },
});
```

Les signals, resources et forms locaux à une page vivent dans `view()`. L'état
partagé par un module vit dans `*.service.ts`.

## Ce que nous ne faisons pas

- Pas de JSX/Vue/Svelte syntax.
- Pas de custom elements sans trait d'union.
- Pas de lecture de signal via `.value`; un signal est une fonction.
- Pas de `innerHTML` direct.
- Pas de runtime packages sans discussion.

En cas de doute, documentez une recette claire plutôt que d'ajouter un nouveau
primitive au core.
