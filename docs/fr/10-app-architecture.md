# Architecture d'application

Le starter officiel est la forme canonique d'une application Mado en
production. Ce n'est pas un framework dans le framework : seulement des
fichiers, des imports, les primitives Mado et des limites ESLint.

## Structure

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

`src/app.routes.ts` est la carte de toute l'application. Les modules exportent
des route maps simples ; les app routes décident quel shell et quel guard
enveloppent chaque zone.

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

- Export `manifest` pour `mado bake`.
- Les modules n'appellent jamais `layout()`.
- Les layouts décrivent des zones d'application, pas des domaines.
- Ne cachez pas le router dans un custom element ou un second shell dans
  `main.ts`.

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

Les signals, resources et forms locaux à une page vivent dans `view()`. L'état
partagé par un module vit dans `*.service.ts`.

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

## Styles

| File | Role |
| --- | --- |
| `src/shared/styles/tokens.css` | design tokens as CSS custom properties |
| `src/shared/styles/reset.css` | document/light DOM reset |
| `src/shared/styles/shell.css` | app-zone layouts from `src/layouts/` |
| `src/shared/styles/content.css` | page-level forms, tables, prose and states |

Les composants feuilles gardent leurs styles dans ``css`...` `` dans les
options de `component()` et dépendent des tokens, pas de classes globales.

`vite.config.ts` active le transformer Lightning CSS de Vite. Mado ne possède
pas le prefixing, le lowering CSS ou la minification.

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

Le générateur écrit seulement de nouveaux fichiers. Il ne modifie pas
`app.routes.ts`.
