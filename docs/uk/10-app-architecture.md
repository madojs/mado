# Архітектура застосунку

Production-застосунок на Mado має бути простим: один manifest маршрутів, один
shell, один API-клієнт, один auth-модуль і сторінки, які імпортують власні
компоненти.

```txt
src/
├── main.ts
├── routes.ts
├── layouts/
├── pages/
├── components/
├── lib/
└── styles/
```

`lib/` — бізнес-логіка, `layouts/` — обгортки груп маршрутів, `components/` —
повторні UI-теги, `pages/` — один файл на сторінку.

```ts
import { html, render } from "@madojs/mado";
import "./styles/global.js";
import routesApi from "./routes.js";

render(html`${routesApi.view}`, document.getElementById("app")!);
```

Feature-компоненти імпортує сторінка, яка їх рендерить.

```ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./lib/auth.js";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "/admin": layout({
    layout: () => import("./layouts/app.js"),
    guard: requireAuth,
    routes: { "/": () => import("./pages/admin/dashboard.js") },
  }),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest);
```

`manifest` потрібен для `mado bake`. Для читання використовуй `resource()`, для
запису `mutation(..., { invalidates })`, для форм `useForm()`.

```bash
mado dev
mado release
```

Деплоїться `out/`, а не `dist/`.
