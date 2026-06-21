# Архитектура приложения

Официальный starter — каноничная production-форма Mado-приложения. Это не
framework внутри framework: только файлы, imports, Mado primitives и ESLint
boundaries.

## Структура

```txt
src/
├── main.ts
├── app.routes.ts
├── layouts/
│   ├── app-shell.layout.ts
│   └── auth-shell.layout.ts
├── shared/
│   ├── http/
│   ├── lib/
│   ├── styles/
│   └── ui/
└── modules/
    ├── auth/
    │   ├── auth.routes.ts
    │   ├── auth.public.ts
    │   ├── auth.service.ts
    │   ├── auth.connector.ts
    │   ├── auth.guard.ts
    │   ├── login.page.ts
    │   └── _contracts/
    └── billing/
        ├── billing.routes.ts
        ├── billing.public.ts
        ├── billing.types.ts
        ├── api/
        ├── data/
        ├── pages/
        ├── components/
        └── _contracts/
```

## App Map

`src/app.routes.ts` — карта всего приложения. Modules экспортируют plain route
maps; app routes решают, какой shell и guard оборачивают каждую зону.

```ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./modules/auth/auth.public";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";

export const manifest = {
  "/": () => import("./modules/home/home.page"),
  "/login": layout({
    layout: () => import("./layouts/auth-shell.layout"),
    routes: authRoutes,
  }),
  "/billing": layout({
    layout: () => import("./layouts/app-shell.layout"),
    guard: requireAuth,
    routes: billingRoutes,
  }),
  "*": () => import("./modules/home/not-found.page"),
};

export default routes(manifest);
```

Rules:

- Export `manifest`, чтобы `mado bake` мог найти bakeable pages.
- Modules не вызывают `layout()`.
- Layouts описывают app zones, не домены.
- Router не прячется в custom element или втором shell в `main.ts`.

## File Forms

| Suffix | Role |
| --- | --- |
| `*.page.ts` | route page, default `page({...})` |
| `*.layout.ts` | app-zone wrapper, default `page(...)` |
| `*.connector.ts` | one external API system |
| `*.resource.ts` | `resource()` and `mutation()` layer |
| `*.service.ts` | module singleton state |
| `*.guard.ts` | route guard |
| `*.routes.ts` | module-local route map |
| `*.public.ts` | only public module surface |
| `*.types.ts` | domain types |
| `*.component.ts` | Web Component registration |

Page-local signals, resources and forms live inside `view()`. Module-wide state
lives in `*.service.ts`.

## Data Flow

```txt
shared/http/http-client.ts
        ▲
modules/<x>/api/*.connector.ts      DTO -> domain mapping
        ▲
modules/<x>/data/*.resource.ts      cache keys + mutations
        ▲
modules/<x>/pages/*.page.ts         UI consumes domain types
```

## Module Boundaries

Модуль opaque, кроме `<module>.public.ts`. Другие modules импортируют через этот
файл или никак. DTO внешних систем лежат в `_contracts/` и остаются private для
connector.

Default starter enforces this with ESLint:

- no barrels (`index.ts`);
- no `export *`;
- no CSS imports outside `src/main.ts`;
- no cross-module imports except public surfaces;
- no `_contracts` imports outside connectors.

## Styles

| File | Role |
| --- | --- |
| `src/shared/styles/tokens.css` | design tokens as CSS custom properties |
| `src/shared/styles/reset.css` | document/light DOM reset |
| `src/shared/styles/shell.css` | app-zone layouts from `src/layouts/` |
| `src/shared/styles/content.css` | page-level forms, tables, prose and states |

Reusable leaf components keep their own styles in ``css`...` `` inside
`component()` options and depend on tokens, not global classes.

`vite.config.ts` opts into Vite Lightning CSS transformer. Mado does not own
prefixing, CSS lowering or minification.

## CLI

Use `mado new` for boring file scaffolding:

```bash
mado new module billing
mado new page billing/pages/invoices-list
mado new connector billing/api/stripe
mado new resource billing/data/invoices
mado new service billing/cart
mado new form billing/invoice
mado new component billing/components/invoice-status-badge
mado new guard billing/billing
mado new layout app-shell
```

The generator writes files only. It does not edit `app.routes.ts`, does not scan
the filesystem, and refuses to overwrite existing files.
