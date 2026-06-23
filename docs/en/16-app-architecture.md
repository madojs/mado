# App architecture

The official starter is the canonical production shape for Mado apps. It is
not a demo architecture and not a framework inside the framework: it is plain
files, imports, Mado primitives, and ESLint boundaries.

## Project layout (universal starter)

Both starters share the same top-level shape. The universal starter is the
minimum:

```
my-app/
├── package.json              # exactly one runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── vite.config.ts            # mado() from @madojs/mado/vite
├── index.html                # Vite entry + SPA shell
├── public/                   # static assets (favicons, images, robots.txt)
└── src/
    ├── main.ts               # entry: mount router into #app
    ├── app.routes.ts         # one app map (default + named `manifest`)
    ├── pages/                # *.page.ts files
    ├── components/           # reusable <x-tag> components
    └── shared/               # http/, lib/, styles/, ui/
```

`index.html` belongs at the project root because Vite treats it as an entry
template, not a static public file. Put only copy-as-is files in `public/`.

### The three artifact states

| Folder    | What it is                                                  | Who writes      | Who reads               | Deploy?       |
| --------- | ----------------------------------------------------------- | --------------- | ----------------------- | ------------- |
| `src/`    | your TypeScript source                                      | you             | Vite, `tsc --noEmit`    | ❌ no          |
| `public/` | static assets copied as-is                                  | you             | Vite build              | ✅ via `out/` |
| `out/`    | **the deploy artifact**: SPA shell + assets + snapshots     | `mado release`  | nginx / CDN / CF Pages  | ✅ **yes**    |

One-liner: develop with `mado dev`, ship with `mado release`, upload `out/`.

### Naming rules

| What                       | Style              | Example                |
| -------------------------- | ------------------ | ---------------------- |
| File                       | kebab-case         | `user-profile.ts`      |
| Component tag              | `x-` + kebab       | `<x-user-profile>`     |
| Context                    | PascalCase + `Ctx` | `ThemeCtx`, `AuthCtx`  |
| Signal                     | camelCase          | `userId`, `isLoggedIn` |
| Page-internal element      | `x-<route>-page`   | `<x-posts-page>`       |

### What does NOT belong in `src/`

- ❌ Build-tool configs beyond `vite.config.ts` with `mado()`.
- ❌ `.env` files — read env in `src/shared/lib/config.ts` from
  `import.meta.env` and import that one module everywhere.
- ❌ Tests mixed with code — put them in `test/`.
- ❌ `examples/` folder — keep large demos outside the app repo.

## File tree (modular reference starter)

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

- Export `manifest` so `mado static` can discover bakeable pages.
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

## Styles

The starter uses plain CSS plus component-local ``css`...` ``. The split is
intentional:

| File | Role |
| ---- | ---- |
| `src/shared/styles/tokens.css` | design tokens as CSS custom properties |
| `src/shared/styles/reset.css` | document/light DOM reset |
| `src/shared/styles/shell.css` | app-zone layouts from `src/layouts/` |
| `src/shared/styles/content.css` | page-level forms, tables, prose and states |

Reusable leaf components keep their own styles in ``css`...` `` inside
`component()` options. They should depend on tokens (`var(--color-text)`)
rather than global classes.

`vite.config.ts` opts into Vite's Lightning CSS transformer. Mado does not own
prefixing, CSS lowering or minification.

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
