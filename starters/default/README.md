# Mado Starter — Modular

> One disciplined shape for [Mado](https://github.com/madojs/mado) apps.
> Stays sane from 1 module to 100.

Optimized for **admin panels, internal tools and business SPAs** that need to
stay maintainable for years, not weeks.

## Why this shape

- **Feature modules** (`src/modules/<name>/`) own their pages, data, API
  connectors and state.
- **Public boundary** — a module is only allowed to import other modules
  through their `<name>.public.ts`. Enforced by ESLint.
- **Layouts + guards live in `src/app.routes.ts`** inside `layout({...})`
  blocks, the way Mado expects. There is exactly one canonical place for a
  shell — never wrap the router in `main.ts` or in a custom-element.
- **Three-layer API**: `shared/http` → `module/*.connector.ts` →
  `module/*.resource.ts`. DTOs of external systems never leak past the
  connector.
- **One file form per suffix.** A `*.page.ts` always looks the same. A
  `*.connector.ts` always looks the same. Tools and LLMs need to learn one
  shape per type, not the whole app.
- **No magic.** No DI, no decorators, no `defineModule()`, no runtime module
  registry. Just files, imports and an ESLint config.

## Layout

```
src/
  main.ts                  # boot
  app.routes.ts            # one source of truth: routes(manifest) + named manifest export

  layouts/                 # one *.layout.ts per app zone (auth, app, marketing…)
    app-shell.layout.ts
    auth-shell.layout.ts

  shared/                  # universal, no business logic, no signal state
    ui/                    # x-button, x-spinner …
    lib/                   # pure utilities
    http/                  # http client + interceptors + error shape
    styles/                # tokens.css, reset.css, app.css

  modules/                 # all business logic lives here
    auth/                  # flat module (small)
      auth.types.ts
      auth.routes.ts       # plain route map
      auth.public.ts
      auth.service.ts
      auth.connector.ts
      auth.guard.ts
      login.page.ts
      _contracts/auth-api.types.ts
    billing/               # folder-grown module (bigger)
      billing.types.ts
      billing.routes.ts
      billing.public.ts
      api/stripe.connector.ts
      _contracts/stripe.types.ts
      data/invoices.resource.ts
      components/invoice-status-badge.component.ts
      pages/
        invoices-list.page.ts
        invoice-detail.page.ts
```

## File suffix = file shape

| Suffix              | Role                      | Default export        |
| ------------------- | ------------------------- | --------------------- |
| `*.page.ts`         | Route component           | `page({...})`         |
| `*.layout.ts`       | Shared chrome (wraps `${child}`) | `page({ view: ({child}) => ... })` |
| `*.component.ts`    | Reusable web component    | `component(...)`      |
| `*.connector.ts`    | One external API system   | named `xxxApi` object |
| `*.resource.ts`     | Resources & mutations     | named `useXxx()`      |
| `*.service.ts`      | Singleton state + actions | named exports         |
| `*.form.ts`         | `useForm` schema factory  | named `useXxxForm()`  |
| `*.guard.ts`        | Route guard               | named `requireX()`    |
| `*.routes.ts`       | Module-internal routes    | named `xRoutes`       |
| `*.public.ts`       | Module's public surface   | named re-exports      |
| `*.types.ts`        | TypeScript types          | only `export type`    |

Every form is documented in [`AGENTS.md`](./AGENTS.md) (for LLM agents) and
[`docs/file-forms.md`](./docs/file-forms.md) (for humans).

## Routing (Mado canonical)

One rule:
- A **layout** describes an APP ZONE (auth, app, marketing, embed). All
  layouts live in `src/layouts/`.
- A **module** ALWAYS exports a plain `routes` map. It never wraps itself.
- **Composition** (which shell + which guard wraps which module) happens
  inside `src/app.routes.ts`.

```ts
// src/app.routes.ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./modules/auth/auth.public";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";

export const manifest = {
  // Public landing (no shell, no guard).
  "/": () => import("./modules/home/home.page"),

  // AUTH ZONE
  "/login": layout({
    layout: () => import("./layouts/auth-shell.layout"),
    routes: authRoutes,
  }),

  // APP ZONE
  "/billing": layout({
    layout: () => import("./layouts/app-shell.layout"),
    guard: requireAuth,
    routes: billingRoutes,
  }),

  "*": () => import("./modules/home/not-found.page"),
};

export default routes(manifest);
```

Reading this file = reading the app: 4 zones, each with its shell, guard
and which modules feed it.

The `manifest` export lets `mado bake` discover pages that declare
`bake: { paths, data }`.

## Boundaries (enforced)

```
shared/           ←  cannot import from modules/
layouts/          ←  may import shared/* and any modules/<y>/*.public.ts
modules/<x>/      ←  may import shared/* and modules/<y>/*.public.ts
modules/<x>/api/  ←  cannot import resource/page/service/UI
_contracts/       ←  never reexported outside the module
modules/<x>/*.routes.ts  ←  plain map only, no layout(), no other modules
```

See [`eslint.config.mjs`](./eslint.config.mjs).

## Quick start

```bash
npm install
npm run dev
```

## Generate files

```bash
npm run new -- module billing
npm run new -- page billing/pages/invoices-list
npm run new -- connector billing/api/stripe
npm run new -- resource billing/data/invoices
npm run new -- service billing/cart
npm run new -- form billing/invoice
npm run new -- component billing/components/invoice-status-badge
npm run new -- guard billing/billing
npm run new -- layout admin-shell             # always under src/layouts/
```

Each command creates **one file** in the canonical shape. It never edits
other files (no magic). The generator lives in the framework CLI (`mado new`),
so generated apps do not carry a local copy. After scaffolding a page or
module, paste the snippet the generator prints into `app.routes.ts` by hand. See
[`docs/cli.md`](./docs/cli.md).

## Grow as you go

- 1–5 files in a module → keep them flat in `modules/<name>/`.
- More than 5 → group into `pages/`, `_parts/`, `data/`, `api/`,
  `components/`, `forms/`, `_contracts/`.
- File **suffixes** never change. Only their grouping does.

See [`docs/growth-guide.md`](./docs/growth-guide.md).

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — the why, in 1 screen
- [`docs/file-forms.md`](./docs/file-forms.md) — canonical shape per suffix
- [`docs/growth-guide.md`](./docs/growth-guide.md) — flat → folders
- [`docs/cli.md`](./docs/cli.md) — `mado new …`
- [`AGENTS.md`](./AGENTS.md) — contracts for LLM agents (includes Mado API
  cheat sheet — required reading)

## License

MIT.
