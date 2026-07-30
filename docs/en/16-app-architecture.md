# App architecture

The default starter is the canonical minimum for a Mado app: plain files,
imports and Mado primitives. It deliberately does not prescribe backend-style
layers or a domain-module system before the application needs them.

Start with the universal shape below. The later modular section records an
optional scaling experiment, not a framework contract and not the default
answer for generated applications.

## Project layout (universal starter)

The default universal starter is the canonical minimum:

```
my-app/
├── package.json              # exactly one runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── tsconfig.node.json        # Vite config type checking
├── vite.config.ts            # mado() from @madojs/mado/vite
├── index.html                # Vite entry + SPA shell
└── src/
    ├── main.ts               # entry: mount router into #app
    ├── app.routes.ts         # one app map (default + named `manifest`)
    ├── pages/                # route-level *.page.ts files
    ├── components/           # reusable custom elements
    ├── content/              # browser-safe content modules
    └── styles/               # tokens, reset and light-DOM document CSS
```

`index.html` belongs at the project root because Vite treats it as an entry
template, not a static public file. Create `public/` only when the application
has copy-as-is assets such as favicons, images or `robots.txt`.

The optional [`@madojs/ui`](./17-mado-ui.md) CLI does not change the
one-runtime-dependency contract. It copies ordinary source and CSS into
configured application paths, normally under `src/`; applications do not
import the UI package in browser code.

The modular starter targets the same runtime but intentionally has a different
source tree: it adds `layouts/`, `modules/` and `shared/` for applications that
already need those boundaries. Its optional shape is documented separately
below; it is not the universal starter with a few empty folders filled in.

### The three artifact states

| Folder    | What it is                                                  | Who writes      | Who reads               | Deploy?       |
| --------- | ----------------------------------------------------------- | --------------- | ----------------------- | ------------- |
| `src/`    | your TypeScript source                                      | you             | Vite, `tsc --noEmit`    | ❌ no          |
| `public/` | static assets copied as-is                                  | you             | Vite build              | ✅ via `out/` |
| `out/`    | **deploy artifact**: assets + snapshots + SPA/404 policy    | `mado release`  | nginx / CDN / CF Pages  | ✅ **yes**    |

One-liner: develop with `mado dev`, ship with `mado release`, then deploy
`out/` with the host-specific routing policy from
[Deployment](./20-deployment.md).

### Naming rules

| What                       | Style              | Example                |
| -------------------------- | ------------------ | ---------------------- |
| File                       | kebab-case         | `user-profile.ts`      |
| Component tag              | `x-` + kebab       | `<x-user-profile>`     |
| Context                    | PascalCase + `Ctx` | `ThemeCtx`, `AuthCtx`  |
| Signal                     | camelCase          | `userId`, `isLoggedIn` |
| Route page module          | kebab + `.page.ts` | `posts.page.ts`        |

### What does NOT belong in `src/`

- ❌ Build-tool configs beyond `vite.config.ts` with `mado()`.
- ❌ `.env` files — read env in `src/shared/lib/config.ts` from
  `import.meta.env` and import that one module everywhere.
- ❌ Tests mixed with code — put them in `test/`.
- ❌ `examples/` folder — keep large demos outside the app repo.

## Optional experiment: modular reference starter

The modular starter demonstrates one possible shape for a larger business
frontend with several guarded zones and a shared API policy. Adopt only the
parts that solve a problem already present in the application. A small app
does not need `modules/`, connectors, public barrels or ESLint boundaries.

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

### Modular app map

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

- Export `manifest` so `mado static` can discover pages that opt into capture.
- Modules never call `layout()`.
- Layouts describe app zones, not domains.
- Do not hide the router inside a custom element or a second shell in
  `main.ts`.

### Optional file forms

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

### Optional layered data flow

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

### Optional module boundaries

Each module is opaque except for `<module>.public.ts`. Other modules import
through that file or not at all. DTOs live under `_contracts/` and stay private
to the connector that understands that external system.

The modular reference starter enforces these optional boundaries with ESLint:

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

Vite 8's standard CSS pipeline owns transforms and minification. Mado adds no
CSS transformer; applications can configure Vite directly when they have a
measured need.

Mado UI may install its theme and opt-in native CSS recipes into either style
root. Treat those files as application-owned source, import only what the app
uses and layer project overrides normally.

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

For reviewed UI source, use the separate registry CLI:

```bash
mado new component billing/components/invoice-status-badge
npx @madojs/ui@latest add badge
```

The first command creates a minimal component skeleton. The second resolves a
reviewed registry item and its dependencies, then copies them into the paths
declared by `mado-ui.json`. See [Mado UI](./17-mado-ui.md).

## Release

Local development uses Vite through `mado dev`. Production uses one deploy
artifact:

```bash
mado release
rsync -avz out/ user@server:/var/www/app/
```

`out/` is the deploy folder. `dist/` is internal package output.
