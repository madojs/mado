# Routing

> Один app map. Никаких folder scanners. Никаких специальных path symbols.

Mado не выводит routes из файлов. Composition должна читаться в одном месте.

## App Manifest

Используйте `src/app.routes.ts` как карту приложения:

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

Открываешь `app.routes.ts` и видишь все зоны приложения: public pages, auth,
protected app zones, guards и shells.

`manifest` экспортируется отдельно, чтобы `mado bake` мог его прочитать.

## Module Routes

Modules экспортируют plain route maps. Они не вызывают `layout()` и не решают,
какой shell их оборачивает.

```ts
export const billingRoutes = {
  "/invoices": () => import("./pages/invoices-list.page.js"),
  "/invoices/:id": () => import("./pages/invoice-detail.page.js"),
};
```

Prefix применяет `src/app.routes.ts`, когда module монтируется под
`"/billing"`.

## Layout Group

```ts
"/admin": layout({
  layout: () => import("./layouts/app-shell.layout.js"),
  guard: requireAuth,
  routes: adminRoutes,
}),
```

Layout — обычный `page({...})` file:

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

Layout view держим stateless. Page-specific signals, resources и forms живут в
pages/components/resources, не в layout locals.

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

## Чего нет намеренно

- Auto-scan of page folders.
- Filesystem syntax вроде `[id]`, `(group)`, `_layout`.
- Server routes в client manifest.
- Hidden layout discovery.
