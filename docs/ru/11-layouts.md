# Layouts

В Mado blessed-способ для layout — nested route group в `routes.ts`.
Не заворачивай каждую страницу вручную и не клади общий shell в `main.ts`,
если в приложении есть разные зоны вроде public/login/admin.

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
    routes: {
      "/": () => import("./pages/admin/dashboard.js"),
      "/orders": () => import("./pages/admin/orders.js"),
    },
  }),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest);
```

Layout — это обычная `page({ view })`, которая рендерит `child`:

```ts
export default page({
  view: ({ child }) => html`<x-app-shell>${child}</x-app-shell>`,
});
```

Правила:

- один shell на группу, не на каждую страницу;
- outer layouts оборачивают inner layouts;
- guard на группе защищает всю поддеревянную часть;
- layout можно lazy-load через `() => import(...)`.

Single-shell wrapper в `main.ts` допустим только для приложений, где абсолютно
все роуты живут в одной оболочке.
