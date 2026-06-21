# Routing

> One app map. No folder scanners. No special path syntax.

Mado does not infer routes from files. The browser sees files as files; route
composition should be readable in one place.

## App Manifest

Use `src/app.routes.ts` as the application map:

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

Open `app.routes.ts` and you can see the whole app: public pages, auth zone,
protected app zones, guards and shells.

Exporting `manifest` is important because `mado bake` reads it.

## Module Routes

Modules export plain route maps. They do not call `layout()` and they do not
decide which shell wraps them.

```ts
// src/modules/billing/billing.routes.ts
export const billingRoutes = {
  "/invoices": () => import("./pages/invoices-list.page.js"),
  "/invoices/:id": () => import("./pages/invoice-detail.page.js"),
};
```

The prefix is applied by `src/app.routes.ts` when the module is mounted under
`"/billing"`.

## What Goes On The Right Side

### Lazy page import

```ts
"/users/:id": () => import("./modules/users/pages/user-profile.page.js"),
```

Vite creates a separate chunk for dynamic imports in production.

### Eager page

```ts
import home from "./modules/home/home.page.js";

export const manifest = {
  "/": home,
};
```

Use this only for tiny critical pages.

### Layout group

```ts
"/admin": layout({
  layout: () => import("./layouts/app-shell.layout.js"),
  guard: requireAuth,
  routes: adminRoutes,
}),
```

A layout is a normal `page({...})` file:

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

Keep layout views stateless. Put page-specific signals, resources and forms in
pages/components/resources, not in layout locals.

## Page Contract

```ts
import { html, page } from "@madojs/mado";

export default page<{ id: string }>({
  title: ({ id }) => `User ${id}`,
  view: ({ params }) => html`<h1>${params.id}</h1>`,
});
```

If a lazy route does not default-export `page({...})`, `routes()` throws a clear
error.

## Navigation

```ts
import appRoutes from "./app.routes.js";

appRoutes.navigate("/billing/invoices");
appRoutes.navigate("/billing/invoices?page=2");
appRoutes.navigate("/login", { replace: true });
```

Clicks on `<a href="/foo">` are intercepted for same-origin SPA navigation.
External links still use normal browser navigation.

## Query Parameters

```ts
import { queryParam } from "@madojs/mado";

const page = queryParam("page", "1");
page();
page.set("2");
page.set(null);
page.set("3", { push: true });
```

`queryParam()` is a signal. Use it in pages or components when URL state is part
of the UI.

## What Is Intentionally Absent

- No auto-scan of page folders.
- No special filesystem route syntax like `[id]`, `(group)`, `_layout`.
- No server routes in the client manifest.
- No hidden layout discovery. App zones are explicit in `app.routes.ts`.
