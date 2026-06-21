# Layouts

The blessed layout recipe in Mado is a route group in `src/app.routes.ts`.
Do not put a single global shell in `main.ts` when the app has multiple zones:
public, auth, app, embed.

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

A layout is a normal `page({ view })` that renders `child`:

```ts
export default page({
  view: ({ child }) => html`
    <div class="layout layout--app">
      <main class="app-main">${child}</main>
    </div>
  `,
});
```

Rules:

- one shell per route group, not per page;
- modules export plain route maps and do not call `layout()`;
- guard on a group protects the whole subtree;
- layout view stays stateless; page-local state lives in pages/components/resources.
