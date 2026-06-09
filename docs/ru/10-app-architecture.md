# Архитектура приложения

Базовая форма production-приложения на Mado должна быть скучной: один route
manifest, один shell, один API-клиент, один auth-модуль и страницы, которые
импортируют свои компоненты.

## Структура

```txt
src/
├── main.ts
├── routes.ts
├── layouts/
│   ├── app.ts
│   └── auth.ts
├── pages/
│   ├── home.ts
│   ├── login.ts
│   ├── not-found.ts
│   └── admin/
├── components/
├── lib/
│   ├── api.ts
│   └── auth.ts
└── styles/
```

`lib/` хранит бизнес-логику, `layouts/` оборачивает группы роутов,
`components/` хранит переиспользуемые UI-теги, а `pages/` содержит один файл
на страницу.

## Entry point

```ts
import { html, render } from "@madojs/mado";
import "./styles/global.js";
import "./components/x-button.js";
import routesApi from "./routes.js";

render(html`${routesApi.view}`, document.getElementById("app")!);
```

В `main.ts` импортируй только глобальные провайдеры, стили и маленькие общие
компоненты. Feature-компоненты импортирует страница, которая их рендерит.

## Routes

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

`export const manifest` нужен для `mado bake`.

## API, forms, release

Держи один API-клиент и один auth-модуль. Для списков используй `resource()`,
для записей `mutation(..., { invalidates })`, для форм `useForm()`.

```ts
const form = useForm({
  email: { required: true, type: "email" },
  "items.*.title": { required: true },
});
const items = form.array("items");
```

Разработка:

```bash
mado dev
```

Продакшен:

```bash
mado release
rsync -avz out/ user@server:/var/www/app/
```

Деплоится только `out/`. `dist/` — внутренний результат `tsc`.
