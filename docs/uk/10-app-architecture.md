# Архітектура застосунку

Офіційний starter — канонічна production-форма Mado-застосунку. Це не
framework всередині framework: лише files, imports, Mado primitives та ESLint
boundaries.

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

`src/app.routes.ts` is the app map. Modules export plain route maps; app routes
decide which shell and guard wrap each zone.

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

Page-local signals, resources and forms live inside `view()`. Module-wide state
lives in `*.service.ts`.

## Styles

| File | Role |
| --- | --- |
| `src/shared/styles/tokens.css` | design tokens as CSS custom properties |
| `src/shared/styles/reset.css` | document/light DOM reset |
| `src/shared/styles/shell.css` | app-zone layouts from `src/layouts/` |
| `src/shared/styles/content.css` | page-level forms, tables, prose and states |

Leaf components keep their own styles in ``css`...` `` inside `component()`
options and depend on tokens, not global classes.

`vite.config.ts` uses Vite's Lightning CSS transformer. Mado does not own
prefixing, CSS lowering or minification.

## CLI

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

The generator writes files only and does not edit `app.routes.ts`.
