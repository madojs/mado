# Routing

> One app map. No folder scanners. No special path syntax. Layouts
> are pages that render `${child}`.

Mado does not infer routes from files. Route composition lives in
one file — `src/app.routes.ts` — so the whole map is readable at a
glance.

## The app manifest

```ts
// src/app.routes.ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./modules/auth/auth.public";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";

export const manifest = {
  "/":       () => import("./modules/home/home.page"),
  "/login": layout({
    layout: () => import("./layouts/auth-shell.layout"),
    routes: authRoutes,
  }),
  "/billing": layout({
    layout: () => import("./layouts/app-shell.layout"),
    guard:  requireAuth,
    routes: billingRoutes,
  }),
  "*": () => import("./modules/home/not-found.page"),
};

export default routes(manifest);
```

Opening `app.routes.ts` shows the whole app: public pages, auth
zone, protected zones, guards and shells.

Exporting `manifest` is **required**: `mado static` discovers
static routes by reading it.

## Module routes

Modules export plain route maps. They do not decide which shell
wraps them; that happens in `app.routes.ts`.

```ts
// src/modules/billing/billing.routes.ts
export const billingRoutes = {
  "/invoices":     () => import("./pages/invoices-list.page"),
  "/invoices/:id": () => import("./pages/invoice-detail.page"),
};
```

When mounted under `"/billing"` the public URLs become
`/billing/invoices` and `/billing/invoices/:id`.

## Layouts (the one blessed path)

A layout is a `page({ view })` that renders `${ctx.child}` somewhere:

```ts
// src/layouts/app-shell.layout.ts
import { html, page } from "@madojs/mado";

export default page({
  view: ({ child }) => html`
    <header class="app-header">…</header>
    <main class="app-main">${child}</main>
  `,
});
```

Mount it through `layout({ layout, routes, guard? })` in
`app.routes.ts`. That is the **only** canonical place to declare a
layout.

Two corollaries that prevent the classic "navigation appears below
content" bug:

- **Order matters.** Outer manifest entries wrap inner ones.
- **One shell per group.** If a subtree needs a different shell,
  open a new `layout({...})` group; do not branch inside one shell.

Two acceptable alternatives exist but are escape hatches, not the
default:

- *Single shell in `main.ts`* — `render(html\`<x-shell>${routes.view}</x-shell>\`)`.
  Caveat: every route lives inside one shell; no centred login page,
  no marketing landing without admin chrome.
- *Per-page wrapping inside `view`* — each page repeats the shell.
  Caveat: the first time someone forgets it the layout disappears.
  Do not start with this.

Layouts are stateless wrappers. Per-page state belongs in the page
or in a `resource()` keyed by the page's identity — never in layout
view locals.

## What goes on the right side

### Lazy page import (preferred)

```ts
"/users/:id": () => import("./modules/users/pages/user-profile.page"),
```

Vite emits a separate chunk per dynamic import in production.

### Eager page

```ts
import home from "./modules/home/home.page";

export const manifest = { "/": home };
```

Use only for tiny critical pages.

### Layout group

```ts
"/admin": layout({
  layout: () => import("./layouts/app-shell.layout"),
  guard:  requireAuth,
  routes: adminRoutes,
}),
```

## Page contract

```ts
import { html, page } from "@madojs/mado";

export default page<{ id: string }>({
  title: ({ id }) => `User ${id}`,
  view:  ({ params }) => html`<h1>${params.id}</h1>`,
});
```

If a lazy route does not default-export `page({...})`, `routes()`
throws a clear error at load time.

## Guards

A guard is a function returning `true | false | string | { redirect, replace? } | { halt }`:

```ts
export function requireAuth(): boolean | string {
  return isAuthed() ? true : "/login";
}
```

Guards apply outer → inner: layout-group guards run before page
guards. Static routes refuse all guards (they are public by
definition).

## Internal links — `routeUrl()` + `data-link`

Vite's `base` flows into `appBase` and `routeUrl()` automatically.
Internal links MUST use both:

```ts
import { html, routeUrl } from "@madojs/mado";

html`<a data-link href=${routeUrl("/users/42")}>User 42</a>`;
html`<a data-link href=${routeUrl("/")}>Home</a>`;     // → "/mado/" under base
```

- `routeUrl(path)` returns a base-prefixed URL (preserves query and
  hash).
- `data-link` opts the anchor into SPA navigation. A bare
  `<a href>` performs a full document load — intentional for
  foreign URLs and downloads.

The router intercepts links inside open Shadow DOM (it uses
`event.composedPath()`).

## Programmatic navigation

```ts
import appRoutes from "./app.routes";
import { navigate } from "@madojs/mado";

appRoutes.navigate("/billing/invoices");
appRoutes.navigate("/billing/invoices?page=2");
appRoutes.navigate("/login", { replace: true });

// Standalone helper — dispatches popstate, every active router updates.
navigate("/users/42");
```

Both accept route paths (no base prefix). The active base is
re-applied internally before `history.pushState`.

## Query parameters

```ts
import { queryParam } from "@madojs/mado";

const page = queryParam("page", "1");
page();                        // current value (reactive)
page.set("2");                 // history.replaceState
page.set("3", { push: true }); // history.pushState
page.set(null);                // delete the parameter
```

`queryParam()` returns a `Signal<string>`. Reading inside a
template subscribes; updating triggers a re-render.

## Prefetch

Hover-prefetch is on by default for `<a data-link>`. Programmatic
prefetch:

```ts
import { prefetchPath } from "@madojs/mado";
prefetchPath("/billing/invoices/123");
```

Foreign-base links (outside the active prefix) are ignored — the
manifest only knows base-free route paths.

## What is intentionally absent

- No auto-scan of page folders.
- No filesystem route syntax (`[id]`, `(group)`, `_layout`).
- No server routes in the client manifest.
- No hidden layout discovery — app zones are explicit in
  `app.routes.ts`.