# Маршрутизація

Mado використовує явний route manifest: один файл показує весь URL-граф
застосунку.

```ts
import { routes } from "madojs";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "/users/:id": () => import("./pages/user-detail.js"),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest);
```

## Сторінка

```ts
import { page, html } from "madojs";

export default page<{ id: string }>({
  title: ({ id }) => `User ${id}`,
  view: ({ params }) => html`<x-user data-id=${params.id}></x-user>`,
});
```

Сторінка може мати `title`, `head`, `load`, `view`, `errorView` і `bake`.
Маршрут може бути lazy import або готовим `page({...})`.

## Nested routes

```ts
import { nested, routes } from "madojs";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "/app": nested({
    layout: () => import("./layouts/app-layout.js"),
    routes: {
      "/dashboard": () => import("./pages/dashboard.js"),
      "/settings": () => import("./pages/settings.js"),
    },
  }),
};

export default routes(manifest);
```

Layout отримує дочірній view і може рендерити shell: nav, sidebar, toolbar,
notifications.

## Навігація

Посилання з `data-link` перехоплюються роутером:

```html
<a href="/users/42" data-link>Open</a>
```

Програмна навігація:

```ts
import { navigate } from "madojs";

navigate("/users/42");
```

Router підтримує hover-prefetch, stale async guard, scroll-to-top для нової
навігації та `dispose()` для тестів/dev overlay.

## Query params

```ts
import { queryParam } from "madojs";

const search = queryParam("q", "");
search.set("mado");
```

`queryParam()` повертає signal-like API і синхронізує стан із URL.
