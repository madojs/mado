# Mado modular starter

Reference architecture for long-lived modular business applications:
admin panels, internal tools, SaaS backoffice. The starter ships the
opinions a team of more than one person will eventually adopt anyway —
auth shell, guarded zones, module boundaries, HTTP client and
contracts.

If you are building a website, a landing page, a docs site or any
small interactive app, prefer the universal starter:

```bash
mado init my-app                  # universal default
mado init my-app --starter modular  # this starter
```

Both starters target the same Mado runtime. They only differ in how
much structure is pre-created.

## Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build     # Vite production SPA build
npm run release   # vite build + browser-rendered snapshots → out/
npm run preview   # serve out/ like a real static host
```

`npm run release` requires a public origin so it can build absolute
canonical URLs. Set it once in `vite.config.ts`:

```ts
mado({ site: "https://your-app.example" })
```

…or override per environment:

```bash
mado release --base-url https://staging.example
```

The public home page is captured as a static document; auth and
billing surfaces stay SPA-only and are served through the
`_mado/spa.html` fallback.

## Dev API mock

`vite.config.ts` mounts a tiny in-memory mock for the endpoints used by
this starter so `npm run dev` is runnable out of the box:

| Method + path                            | Behaviour                                      |
| ---------------------------------------- | ---------------------------------------------- |
| `POST /api/auth/login`                   | accepts `demo@mado.dev` / `demo123`            |
| `GET  /api/auth/me`                      | current user (after login)                     |
| `POST /api/auth/logout`                  | clears the in-memory session                   |
| `GET  /api/billing/stripe/invoices`      | lists six seeded invoices                      |
| `GET  /api/billing/stripe/invoices/:id`  | returns a single invoice                       |
| `POST /api/billing/stripe/invoices/:id/pay` | flips status to `paid`                      |

The mock only runs under `vite dev`, so `mado release` ships a clean
bundle that talks to your real backend. Disable the mock with
`MADO_MOCK_API=0` or remove the `devApiMock()` plugin entry.

When you wire up your real backend, mirror the request/response shape
in `auth.connector.ts` and `stripe.connector.ts`. The contract types in
`modules/<name>/_contracts/` are the source of truth.

## Shape

```txt
public/                  static assets copied by Vite
src/
  main.ts                imports global CSS and mounts the router
  app.routes.ts          app map: zones, layouts, guards and modules
  layouts/               app-zone shells
  shared/
    http/                HTTP client and interceptors
    lib/                 pure utilities
    styles/              tokens, reset, shell and content CSS
    ui/                  reusable x-* components
  modules/               business modules
    <name>/
      <name>.routes.ts
      <name>.public.ts
      <name>.types.ts
      pages/
      data/
      api/
      components/
      _contracts/
```

## CSS Contract

- `tokens.css` defines CSS custom properties and is safe for Shadow DOM
  components through `var(...)`.
- `reset.css` normalizes the document/light DOM surface.
- `shell.css` styles app-zone layouts from `src/layouts/`.
- `content.css` styles page-level light DOM: forms, tables, prose and
  simple states.
- Reusable leaf components keep their own styles in ``css`...` ``
  inside `component()` options.

Vite uses Lightning CSS for CSS transforms/minification in this
starter.

## Internal links

Always emit internal links through `routeUrl()` so they pick up the
deployed Vite `base` automatically:

```ts
import { routeUrl } from "@madojs/mado";

html`<a data-link href=${routeUrl("/billing/invoices")}>Invoices</a>`
```

The router only intercepts anchors that opt in with `data-link`; bare
`<a href>` falls through to a full document load.

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
npm run new -- layout admin-shell
```

The generator writes files only. Wire new routes in
`src/app.routes.ts` or the module route map by hand.

## More

The full architecture guide lives in the framework docs:
https://github.com/madojs/mado/tree/main/docs/en
