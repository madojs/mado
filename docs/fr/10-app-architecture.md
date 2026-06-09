# Architecture d'application

La forme recommandée d'une app Mado en production est volontairement simple :
un manifeste de routes, un shell, un client API, un module auth, et des pages
qui importent leurs propres composants.

## Structure

```txt
src/
├── main.ts
├── routes.ts
├── layouts/
├── pages/
├── components/
├── lib/
└── styles/
```

`lib/` contient la logique métier, `layouts/` enveloppe les groupes de routes,
`components/` contient les tags réutilisables, et `pages/` contient un fichier
par page.

```ts
import { html, render } from "@madojs/mado";
import "./styles/global.js";
import routesApi from "./routes.js";

render(html`${routesApi.view}`, document.getElementById("app")!);
```

N'importe pas tous les composants dans `main.ts`. Une page importe les
composants qu'elle rend.

```ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./lib/auth.js";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "/admin": layout({
    layout: () => import("./layouts/app.js"),
    guard: requireAuth,
    routes: { "/": () => import("./pages/admin/dashboard.js") },
  }),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest);
```

Exporte `manifest` pour `mado bake`. Utilise `resource()` pour les lectures,
`mutation(..., { invalidates })` pour les écritures, et `useForm()` pour les
workflows utilisateur.

```bash
mado dev
mado release
```

Le dossier déployable est `out/`. `dist/` est interne.
