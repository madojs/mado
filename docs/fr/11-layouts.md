# Layouts

Le chemin recommandé pour les layouts Mado est un groupe de routes imbriqué
dans `routes.ts`.

```ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./lib/auth.js";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "/login": layout({
    layout: () => import("./layouts/auth.js"),
    routes: { "/": () => import("./pages/login.js") },
  }),
  "/admin": layout({
    layout: () => import("./layouts/app.js"),
    guard: requireAuth,
    routes: { "/": () => import("./pages/admin/dashboard.js") },
  }),
};

export default routes(manifest);
```

Un layout est une `page({ view })` qui rend `child` :

```ts
export default page({
  view: ({ child }) => html`<x-app-shell>${child}</x-app-shell>`,
});
```

Règles : un shell par groupe, pas par page ; les layouts externes enveloppent
les layouts internes ; un guard sur le groupe protège tout le sous-arbre.
