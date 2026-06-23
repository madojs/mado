# Mado universal starter

A calm native-first web framework for sites and apps. This starter
proves the whole promise in ~15 files:

- one Shadow Component (`feature-card`) shared by the static landing
  and the live SPA,
- one component model end-to-end,
- a build-time seed for a dynamic static route (`/guide/:slug`),
- a private SPA route (`/app`) that falls back through `_mado/spa.html`,
- per-route head metadata, sitemap, canonical and `og:url`
  auto-fallback.

## Run it

```bash
npm install
npm run dev          # Vite dev server
npm run build        # Vite production SPA build
npm run release      # vite build + browser-rendered snapshots → out/
npm run preview      # serve out/ like a real static host
```

`mado release` requires a public origin so it can build absolute
canonical URLs. Set it once in `vite.config.ts`:

```ts
mado({ site: "https://your-app.example" })
```

…or override per environment:

```bash
mado release --base-url https://staging.example
MADO_SITE=https://staging.example mado release
```

## File map

```
src/
  main.ts                       # mounts the router into #app
  app.routes.ts                 # the URL → page table

  pages/
    home.page.ts                # public, static
    guide.page.ts               # dynamic static (/guide/:slug)
    app.page.ts                 # SPA-only interactive route
    not-found.page.ts           # 404 (SPA fallback)

  components/
    feature-card.component.ts   # shared by landing + app
    live-counter.component.ts   # reactivity demo

  content/
    guides.ts                   # browser-safe content module

  styles/
    tokens.css                  # design tokens (custom properties)
    reset.css                   # tiny modern reset
    document.css                # light-DOM document layout
```

## Going further

If you need module boundaries, layouts, guards, an auth shell, an HTTP
client and a Stripe-style billing example, scaffold the modular
starter instead:

```bash
mado init my-app --starter modular
```

The modular starter is the reference architecture for long-lived
business apps. Both starters target the same Mado runtime — they only
differ in how much structure they pre-create for you.