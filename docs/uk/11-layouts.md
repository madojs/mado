# Layouts

Рекомендований спосіб layout у Mado — вкладена група маршрутів у `routes.ts`.

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

Layout — це `page({ view })`, яка рендерить `child`:

```ts
export default page({
  view: ({ child }) => html`<x-app-shell>${child}</x-app-shell>`,
});
```

Один shell на групу, не на кожну сторінку. Guard на групі захищає все
піддерево.
