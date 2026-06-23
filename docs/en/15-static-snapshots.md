# Static snapshots (`mado static`)

> Browser-rendered static HTML for SEO and first paint. No SSR, no
> hydration, no template-language bake.

`mado static` is a *snapshot capture*: at release time Mado runs your
app in a real headless Chromium, lets the page render to the DOM
(including any Shadow DOM), then serialises the result — Declarative
Shadow DOM and all — to one HTML file per route. On first paint the
live SPA atomically replaces the static tree; there is no hydration
protocol and no node reconciliation.

It is the right tool for content that is the same for every visitor:
public landing pages, product / catalogue pages, documentation, blog
posts. It is intentionally **not** an SSR runtime for personalised
data.

## When `static` is suitable

- Public pages with a single canonical representation per URL.
- Pages whose data is known at build time (CMS dump, file system,
  Markdown, JSON, build-time API call).
- Pages that need to appear fully rendered in `view-source:`, in
  social preview crawlers, and to JS-disabled clients.
- First paint of a page that *later* upgrades into a live SPA route.

## When `static` is **not** suitable

- Personalised content per visitor (auth, geo, A/B). The capture sees
  one DOM and would ship it to everyone.
- Real-time data (chat, dashboards, prices). The snapshot is frozen
  the moment of capture.
- Routes behind guards. Static pages are public by definition; the
  discovery pipeline refuses to capture guarded routes.

For those cases keep the route SPA-only — Mado still serves a clean
`_mado/spa.html` fallback for them.

## Declaring a static page

A page opts in through the `static` field on `page({ ... })`. Two
shapes are accepted:

```ts
// Single static page (no params)
import { html, page } from "@madojs/mado";

export default page({
  static: true,
  title: "Pricing",
  head: () => ({ description: "Plans and pricing." }),
  view: () => html`<main><h1>Pricing</h1></main>`,
});
```

```ts
// Dynamic static route — one capture per `paths()` entry
import { html, page } from "@madojs/mado";

export default page<{ slug: string }, Guide>({
  static: {
    paths: async () => guides.map((g) => ({ slug: g.slug })),
    initialData: async ({ slug }) => loadGuide(slug),
  },
  title: ({ slug }) => guides.find((g) => g.slug === slug)?.title ?? slug,
  head: ({ slug }, seed) => ({
    description: seed?.summary ?? "",
  }),
  view: (ctx) => html`<article>${ctx.data.body}</article>`,
});
```

The seed produced by `initialData()` is JSON-serialised into the
captured HTML as `<script type="application/json" data-mado-static-data="…">`.
On first client boot Mado consumes it once so `page.load()` and
`page.head()` see the same data the snapshot saw — no extra fetch.

## Running

In normal use `mado static` is invoked through `mado release`:

```bash
mado release          # vite build + mado static + deployment files
mado preview          # serve out/ like a real static host
```

You can also invoke `mado static` on its own (for tighter loops in
CI), but it operates on the existing `out/` artefact produced by
`vite build`, so the canonical command is `release`.

A public origin is required so static documents carry absolute
canonical URLs. Set it in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { mado } from "@madojs/mado/vite";

export default defineConfig({
  plugins: [mado({ site: "https://your-app.example" })],
});
```

…or override per run:

```bash
mado release --base-url https://staging.example
MADO_SITE=https://staging.example mado release
```

## What the generated HTML contains

For every captured route:

- The full rendered light DOM.
- Every open shadow root serialised through Declarative Shadow DOM
  (`<template shadowrootmode="open">`).
- Adopted stylesheets materialised into `<style>` tags inside the
  shadow root.
- A `<link rel="canonical">` and `<meta property="og:url">` derived
  from `site + base + pathname` (if the page did not declare its own).
  Both are marked `data-mado-head="static"` so the runtime `applyHead`
  removes them on SPA navigation into a page without explicit head
  metadata.
- The seed `<script type="application/json" data-mado-static-data="…">`
  for routes that declared `initialData()`.
- Vite assets resolved through the active `base`.

`<form>`, `<input>`, `<select>`, `<textarea>` and `<details>` state
is serialised through attributes so a JS-disabled browser sees the
same shape the snapshot captured.

## Constraints and gotchas

- **`paths()` and `initialData()` run during discovery AND ship in the
  client bundle.** Keep them browser-safe. Never read secrets, never
  call private services.
- **Static pages cannot use guards** — route-level or layout-level.
- **Wildcard routes (`*`) cannot be static.** They are the SPA
  fallback.
- **A compatible Chromium is required.** CI should install it through
  Playwright:
  ```bash
  npx playwright install --with-deps chromium
  ```
  …or via the framework's installed `playwright-core` for revision
  parity:
  ```bash
  node node_modules/playwright-core/cli.js install --with-deps chromium
  ```
- **Capture is strict by default.** Any failed fetch (script, style,
  resource(), custom element definition) fails the snapshot. A small
  allow-list covers `/favicon.ico`, `/favicon.svg`, `/robots.txt`
  and `data:` URLs.
- **All network calls happen against an internal capture server** that
  serves the freshly built `out/` tree. There is no real network at
  capture time.

## Comparison

| Approach                              | Mado static snapshot |
| ------------------------------------- | -------------------- |
| Next-style SSR + hydration            | not used             |
| Astro-style island runtime            | not used             |
| Build-time HTML from templates only   | not used             |
| Browser-rendered DOM + DSD + takeover | **used**             |

The result is a plain HTML file. Search engines, social preview
crawlers and `curl` see exactly what your app renders on first paint;
no JavaScript step is required to make the document meaningful.

## Cookbook

Concrete recipes for blog, product catalogue, documentation site and
multi-locale builds live in [23-cookbook.md](./23-cookbook.md).

## TL;DR

- Declare `static: true | { paths, initialData }` on `page({ ... })`.
- Run `mado release`.
- Ship `out/` to any static host.
- The live SPA takes over atomically on first paint.