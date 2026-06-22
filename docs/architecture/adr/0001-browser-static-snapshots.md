# ADR 0001 — Browser-rendered static snapshots

**Status:** Accepted (0.12.0)
**Date:** 2026-06-22

## Context

Mado started as a calm browser-native SPA framework for internal tools
and admin panels. Two new product requirements made that scope too
narrow:

1. Public-facing surfaces (landing pages, docs sites, product pages)
   need search engines and social preview bots to see a fully rendered
   document on first request, without running JavaScript.
2. The same component model that powers the live SPA must produce that
   document — we do not want a second component runtime, a hydration
   protocol, or a server renderer.

The conventional answers (Next/Nuxt SSR, Astro, Eleventy, Lit SSR,
Solid Start, …) each ship at least one of:

- a separate component model for the server,
- a hydration boundary that introduces a second source of truth,
- a build-time JSX/Vue/Svelte compiler,
- a Node runtime in production.

Mado is positioned as "calm native-first": we cannot adopt any of
those without breaking the positioning.

## Decision

Adopt **browser-rendered static snapshots with Declarative Shadow
DOM** as the canonical SEO/static path:

1. `mado release` runs `vite build`, then opens each declared static
   route in a real headless Chromium pointed at the build output, and
   serialises the rendered document — including the Shadow DOM as
   Declarative Shadow DOM — into one HTML file per route under
   `out/`.
2. The client runtime treats the snapshot as an **atomic takeover**
   target: a Mado component instance reattaches to the existing host
   in place, with no second tree, no hydration, no diff.
3. Routes that are not declared `static` stay SPA-only and are served
   through the `_mado/spa.html` fallback the same way they were
   before.
4. Vite's `base` is the single source of truth for the public URL
   prefix; the runtime reads it from `import.meta.env.BASE_URL`, the
   CLI reads it from the build bridge (`_mado/build.json`) for
   sitemap / canonical / preview, and the build bridge is dropped
   before the artifact ships.
5. Build-time seeds for static routes are strict `JsonValue` only,
   validated by a path-aware walker so a `Date`, `Map`, `undefined`
   field or cycle fails the build instead of silently corrupting the
   first client render.

## Alternatives rejected

- **SSR (Next / Nuxt / Solid Start).** Ships a second component model
  and a Node production runtime. Hydration boundary is the largest
  source of recurring bug classes in the ecosystem. Mado's
  positioning rejects both.

- **Hydration via an island / partial hydration model (Astro,
  Marko).** Splits the component graph into "static" and "interactive"
  sub-graphs with framework-specific compilers. Adds a second mental
  model for a public-site benefit that DSD already provides.

- **Author-time prerendering with `linkedom`/`jsdom`.** Cannot run
  Shadow DOM, adoptedStyleSheets, layout, or any browser API.
  Snapshots would diverge from what the browser actually renders.

- **External prerender service (Prerender.io and friends).** Adds an
  external dependency, runs on each request, and Mado has no canonical
  way to detect when to flush its cache.

- **Embed a Node runtime that pretends to be a browser.** Same
  divergence problem as `linkedom`, plus a custom DOM polyfill we
  would have to maintain forever.

## Consequences

- A compatible Chromium is required at **release time** (not at
  request time, not in production) for projects that declare any
  static route. `mado release` documents how to install one
  (Playwright-managed Chromium, system Chrome, or operator-provided
  path) and CI gates the round-trip with `npx playwright install
  --with-deps chromium` plus `MADO_REQUIRE_BROWSER=1`.

- `page.static.paths()` and `page.static.initialData()` must be
  **browser-safe and secret-free**: they execute during the discovery
  pass AND remain in the client bundle. The strict `JsonValue`
  validator catches the common shapes that would otherwise leak.

- The framework now has a documented HTTP policy for snapshot capture:
  documents, scripts, stylesheets and tracked resources are fatal;
  favicon-class endpoints are ignored; fonts and paint frames are
  quality hints with bounded timeouts.

- The product surface widens from "internal tools / admin panels" to
  "sites and apps". Marketing copy, package metadata, GitHub topics
  and the default starter all change accordingly. The previous
  modular reference architecture is preserved as
  `mado init --starter modular` for long-lived business apps.

## Known limits

- Static routes cannot use `Date`, `Map`, `Set`, class instances,
  `undefined` values, cycles, or non-finite numbers in their
  `initialData`. The validator gives a path-aware error.

- `mado release` snapshots are deterministic only in a pinned
  environment (same Chromium revision, same source tree). We document
  that determinism contract; reproducing it across CI vendors is the
  operator's responsibility.

- Static `paths()` runs at build time. We do not currently support
  incremental re-snapshot from a webhook; a static-content change
  requires a fresh release.

- Public client-only state inside a static route (canvas, media
  controllers, transient timers) survives takeover but is not part of
  the snapshot — it materialises only after JS executes.

---

## Original implementation plan (for history)

The remainder of this document is the original implementation plan
that drove the work up to 0.12.0. It is preserved verbatim for
historical context.

---