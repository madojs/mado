# Mado Starter

Canonical starter for Mado business apps: admin panels, internal tools and
long-lived SPAs.

## Commands

```bash
npm install
npm run dev
npm run release
```

`npm run release` writes the deploy artifact to `out/`.

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
- `content.css` styles page-level light DOM: forms, tables, prose and simple
  states.
- Reusable leaf components keep their own styles in ``css`...` `` inside
  `component()` options.

Vite uses Lightning CSS for CSS transforms/minification in this starter.

## Generate Files

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

The generator writes files only. Wire new routes in `src/app.routes.ts` or the
module route map by hand.

## More

The full architecture guide lives in the framework docs:
https://github.com/madojs/mado/tree/main/docs/en
