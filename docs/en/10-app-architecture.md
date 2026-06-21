# App architecture

The official starter is the canonical production shape for Mado apps. It is
not a demo architecture and not a framework inside the framework: it is plain
files, imports, Mado primitives, and ESLint boundaries.

## File Tree

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

## The App Map

`src/app.routes.ts` is the whole application map. Modules export plain route
maps; app routes decide which shell and guard wrap each zone.

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

- Export `manifest` so `mado bake` can discover bakeable pages.
- Modules never call `layout()`.
- Layouts describe app zones, not domains.
- Do not hide the router inside a custom element or a second shell in
  `main.ts`.

## File Forms

The suffix tells you the shape:

| Suffix            | Role                                  |
| ----------------- | ------------------------------------- |
| `*.page.ts`       | route page, default `page({...})`     |
| `*.layout.ts`     | app-zone wrapper, default `page(...)` |
| `*.connector.ts`  | one external API system               |
| `*.resource.ts`   | `resource()` and `mutation()` layer   |
| `*.service.ts`    | module singleton state                |
| `*.guard.ts`      | route guard                           |
| `*.routes.ts`     | module-local route map                |
| `*.public.ts`     | only public module surface            |
| `*.types.ts`      | domain types                          |
| `*.component.ts`  | Web Component registration            |

Page-local signals, resources and forms live inside `view()`. Module-wide
state lives in `*.service.ts`.

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

Connectors talk to the wire and return domain types. Resources own cache keys
and invalidation. Pages render and call resources/mutations.

## Module Boundaries

Each module is opaque except for `<module>.public.ts`. Other modules import
through that file or not at all. DTOs live under `_contracts/` and stay private
to the connector that understands that external system.

The default starter enforces this with ESLint:

- no barrels (`index.ts`);
- no `export *`;
- no CSS imports outside `src/main.ts`;
- no cross-module imports except public surfaces;
- no `_contracts` imports outside connectors.

## Growth

Start flat when a module is small:

```txt
modules/auth/
  auth.types.ts
  auth.routes.ts
  auth.public.ts
  auth.service.ts
  auth.connector.ts
  login.page.ts
```

When a module grows, group by role without changing suffixes:

```txt
modules/billing/
  pages/
  data/
  api/
  components/
  forms/
  _contracts/
```

If a module becomes too large, split it by subdomain and keep communication
through public surfaces.

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

The generator only writes new files. It does not edit `app.routes.ts`, does
not scan the filesystem, and refuses to overwrite existing files.

## Release

Local development uses Vite through `mado dev`. Production uses one deploy
artifact:

```bash
mado release
rsync -avz out/ user@server:/var/www/app/
```

`out/` is the deploy folder. `dist/` is internal package output.
