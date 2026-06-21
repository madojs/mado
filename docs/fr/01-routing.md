# Routage

> Une seule app map. Pas de folder scanners. Pas de syntaxe magique.

Mado ne déduit pas les routes depuis les fichiers. La composition doit rester
lisible dans un seul endroit.

## App Manifest

Utilisez `src/app.routes.ts` comme carte de l'application :

```ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./modules/auth/auth.public";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";

export const manifest = {
  "/": () => import("./modules/home/home.page.js"),
  "/login": layout({
    layout: () => import("./layouts/auth-shell.layout.js"),
    routes: authRoutes,
  }),
  "/billing": layout({
    layout: () => import("./layouts/app-shell.layout.js"),
    guard: requireAuth,
    routes: billingRoutes,
  }),
  "*": () => import("./modules/home/not-found.page.js"),
};

export default routes(manifest);
```

Ouvrez `app.routes.ts` pour voir les zones de l'app : pages publiques, auth,
zones protégées, guards et shells.

Exportez `manifest` pour `mado bake`.

## Module Routes

Les modules exportent de simples route maps. Ils n'appellent pas `layout()` et
ne décident pas quel shell les enveloppe.

```ts
export const billingRoutes = {
  "/invoices": () => import("./pages/invoices-list.page.js"),
  "/invoices/:id": () => import("./pages/invoice-detail.page.js"),
};
```

Le prefix est appliqué par `src/app.routes.ts` quand le module est monté sous
`"/billing"`.

## Layout Group

```ts
"/admin": layout({
  layout: () => import("./layouts/app-shell.layout.js"),
  guard: requireAuth,
  routes: adminRoutes,
}),
```

Un layout est un fichier `page({...})` ordinaire :

```ts
import { html, page } from "@madojs/mado";

export default page({
  view: ({ child }) => html`
    <div class="layout layout--app">
      <main class="app-main">${child}</main>
    </div>
  `,
});
```

Gardez les layout views stateless. Les signals, resources et forms spécifiques
à une page vivent dans les pages/components/resources.

## Page Contract

```ts
import { html, page } from "@madojs/mado";

export default page<{ id: string }>({
  title: ({ id }) => `User ${id}`,
  view: ({ params }) => html`<h1>${params.id}</h1>`,
});
```

## Navigation

```ts
import appRoutes from "./app.routes.js";

appRoutes.navigate("/billing/invoices");
appRoutes.navigate("/billing/invoices?page=2");
appRoutes.navigate("/login", { replace: true });
```

## Query Parameters

```ts
import { queryParam } from "@madojs/mado";

const page = queryParam("page", "1");
page();
page.set("2");
page.set(null);
page.set("3", { push: true });
```

## Ce qui est absent volontairement

- Pas d'auto-scan des dossiers de pages.
- Pas de syntaxe filesystem comme `[id]`, `(group)`, `_layout`.
- Pas de server routes dans le manifest client.
- Pas de découverte cachée des layouts.
