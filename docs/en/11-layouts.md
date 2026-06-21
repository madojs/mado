# Layouts

> **One blessed path.** Layouts in Mado are route groups with a shared
> shell. There is exactly one canonical place to declare a layout — your
> `app.routes.ts` manifest. Putting layout code anywhere else (in `main.ts`, in a
> page view, in a global custom-element wrapper) is a bug pattern: the LLM and
> the human both produce visually broken UI when they guess differently.

## The canonical recipe

```ts
// src/app.routes.ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./modules/auth/auth.public.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { billingRoutes } from "./modules/billing/billing.routes.js";

export const manifest = {
  "/":       () => import("./modules/home/home.page.js"),
  "/login": layout({
    layout:  () => import("./layouts/auth-shell.layout.js"),
    routes:  authRoutes,
  }),
  "/billing": layout({
    layout:  () => import("./layouts/app-shell.layout.js"),
    guard:   requireAuth,
    routes:  billingRoutes,
  }),
  "*": () => import("./modules/home/not-found.page.js"),
};

export default routes(manifest);
```

A layout is just a `page({ view })` that renders `${ctx.child}` somewhere:

```ts
// src/layouts/app.ts
import { html, page } from "@madojs/mado";
import "../components/app-shell.js";   // <x-app-shell> (sidebar + topbar + slot)

export default page({
  view: ({ child }) => html`
    <x-app-shell>${child}</x-app-shell>
  `,
});
```

That is the whole API.

- **Order of layouts** matters: outer groups wrap inner groups. The order in
  the manifest is exactly the order of rendering.
- **One shell per group**, not one shell per page. If you want a different
  shell for a subtree, create a new group with its own `layout`.
- **Layouts can be lazy** (`() => import(...)`). They are loaded together
  with the page.

## Why "one blessed path"

Without this convention, every page accumulates `<x-app-shell>${...}</x-app-shell>`
boilerplate, the LLM eventually puts the shell wrapper into `main.ts` "to make
it consistent", and the next refactor produces the classic
*"navigation appears below the page content"* screenshot. The layout-group
recipe makes the shell the **outer frame** structurally; there is no way to
re-order it by accident.

## Two acceptable alternatives (with caveats)

These exist for completeness. Reach for them only if you cannot use layout
groups.

### a) A single shell with the router slot in `main.ts`

```ts
import { html, render } from "@madojs/mado";
import "./components/app-shell.js";
import router from "./routes.js";

render(html`<x-app-shell>${router.view}</x-app-shell>`, app);
```

Caveat: every route now lives inside one shell. You cannot have a centered
login page or a marketing landing page without the admin chrome around it.
Use this only for single-shell apps.

### b) Per-page wrapping inside `view`

```ts
export default page({
  view: () => html`
    <x-app-shell>
      <h1>Orders</h1>
      ...
    </x-app-shell>
  `,
});
```

Caveat: repetition. Every new page must remember the wrapper. The first time
someone forgets it, the layout disappears and the LLM "fixes" it in the wrong
place. **Do not start with this.**

## Where to find more

- `src/page.ts` defines `layout()`, `page()`, `Guard` and `LayoutRoutes`.
- `src/router/manifest.ts` flattens the layout manifest and applies guards
  outer → inner before the page renders.
- The default starter (`mado init my-app`) ships with public, auth and
  authenticated app zones and is the reference implementation.

If you ever feel tempted to invent a fourth pattern, write it down in your
project `docs/` first and discuss it with the team. The cost of inconsistency
in this exact spot is higher than the cost of a slightly awkward layout.
