# Routing

> One app map. No folder scanners. No magic path syntax.

Mado uses an explicit route manifest. Route composition should be readable in
one place: `src/app.routes.ts`.

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

Export `manifest` so `mado bake` can read it.

## Module Routes

Modules export plain route maps. They do not call `layout()`.

```ts
export const billingRoutes = {
  "/invoices": () => import("./pages/invoices-list.page.js"),
  "/invoices/:id": () => import("./pages/invoice-detail.page.js"),
};
```

The prefix is applied by `src/app.routes.ts`.

## Page

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

## Query Params

```ts
import { queryParam } from "@madojs/mado";

const search = queryParam("q", "");
search.set("mado");
```

`queryParam()` returns a signal-like API and syncs state with the URL.
