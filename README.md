<div align="center">
  <img
    src="./docs/assets/brand/mado-logo-light.png"
    alt="MadoJS"
    width="560"
  />

  <p>
    <strong>A calm native-first web framework for sites and apps.</strong>
  </p>

  <p>
    Web Components · Signals · Browser-rendered static snapshots · Zero runtime dependencies
  </p>
</div>


# Mado

> A calm native-first web framework for sites and apps.

[![npm](https://img.shields.io/npm/v/@madojs/mado.svg)](https://www.npmjs.com/package/@madojs/mado)
[![CI](https://github.com/madojs/mado/actions/workflows/ci.yml/badge.svg)](https://github.com/madojs/mado/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Donate: PayPal](https://img.shields.io/badge/Donate-PayPal-ff3f59.svg)](https://www.paypal.com/paypalme/tsekhmister)

Build with real Web Components, signals, routing, data and forms.
Ship live SPAs and browser-rendered static documents from one
component model.

**One component model. One page model. One release command.**

Mado (`窓`) means *window* in Japanese: a calm window into your app,
without dragging a whole frontend factory into the room.

## What you get

```txt
Mado component = Custom Element + open Shadow DOM
Mado page      = route + load + head + view + optional static declaration
Mado release   = Vite build
               + browser-rendered static documents
               + Declarative Shadow DOM
               + SPA fallback
               + deployment artifact

Client activation = atomic takeover
                  ≠ hydration
                  ≠ SSR reconciliation
```

Browser-native source, with Vite as the development and delivery
transport. No framework-specific compiler and zero runtime
dependencies.

## Use cases

- Public landing pages
- Documentation sites
- Product / catalog pages
- SaaS applications
- Business applications
- Admin panels and internal tools
- Dashboards
- Embedded widgets

## Quick start

```bash
npm exec --package @madojs/mado@latest -- mado init my-app
cd my-app
npm install
npm run dev
```

The default starter is the universal starter: ~15 source files,
runnable without a backend, demonstrating one Shadow Component shared
between a static landing page and a live SPA route.

Need the modular reference architecture (auth shell, guarded zones,
billing module, HTTP client, module boundaries)?

```bash
mado init my-app --starter modular
```

## The Mado way

### Signals — reactive state

```ts
import { signal, computed, effect } from "@madojs/mado";

const count = signal(0);
const doubled = computed(() => count() * 2);
effect(() => console.log(count()));

count.set(1);
```

### Templates — tagged template html

```ts
html`<button @click=${fn} ?disabled=${loading} class=${cls}>${label}</button>`;
```

- `${value}` — child content (text, nodes, arrays, nested `html`, `each`)
- `@event=${fn}` — event listener
- `attr=${v}` — attribute
- `.prop=${v}` — DOM property
- `?attr=${flag}` — boolean attribute
- Functions and signals are tracked reactively

### Components — real Web Components

```ts
import { component, css, html } from "@madojs/mado";

component(
  "x-card",
  () => () => html`<section><slot></slot></section>`,
  {
    styles: css`:host { display: block; padding: 1rem; }`,
  },
);
```

Open shadow root, scoped styles, slots, attribute reactivity, a real
custom element under the hood. The same component renders inside the
static snapshot via Declarative Shadow DOM and inside the live SPA via
direct DOM attachment.

### Pages — `route + load + head + view`

```ts
import { html, page } from "@madojs/mado";

export default page({
  static: true,                                  // capture as HTML at release
  title: "Mado Keyboard",
  head: () => ({ description: "A canonical product page." }),
  view: () => html`<h1>Welcome</h1>`,
});
```

### Routing — explicit, code-split

```ts
import { routes, routeUrl } from "@madojs/mado";

export default routes({
  "/":            () => import("./pages/home.page"),
  "/users/:id":   () => import("./pages/user.page"),
  "*":            () => import("./pages/not-found.page"),
});

// Internal links must be base-aware.
html`<a data-link href=${routeUrl("/users/42")}>User</a>`;
```

Lazy loading, layout groups, query params, guards, hover prefetch,
scroll restoration, error boundary, View Transitions, base-path
awareness (Vite `base` → runtime `import.meta.env.BASE_URL`).

### Data — resource + mutation

```ts
import { resource, mutation, jsonFetcher } from "@madojs/mado";

const user = resource(
  () => `/api/users/${userId()}`,
  jsonFetcher<User>(),
  { staleTime: 60_000 },
);

const save = mutation(api.saveUser, {
  invalidates: ["/api/users*"],
});
```

Cache, loading/error state, abort, refresh, optimistic `mutate()`,
glob-based invalidation. Lifecycle-aware inside components.

### Forms — schema-based validation

```ts
import { useForm, html } from "@madojs/mado";

const form = useForm({
  email: { required: true, type: "email" },
  age: { type: "number", min: 18 },
});
```

### Static snapshots — SEO without SSR

```bash
mado release
```

`mado release` runs your app in a real Chromium and freezes the
rendered HTML — including the Shadow DOM via Declarative Shadow DOM —
into one file per route. On first paint the live component re-attaches
to the same host with zero hydration boundary.

- Real search engines see a fully rendered document.
- Social preview bots see the canonical / og tags inside the raw HTML.
- JS-disabled browsers see meaningful content.
- The live app boots from the same snapshot without re-fetching seeded
  data.

## CLI

```bash
mado init my-app                  # scaffold universal starter
mado init my-app --starter modular  # scaffold modular reference architecture
mado dev                          # Vite dev server
mado build                        # Vite production SPA build
mado typecheck                    # tsc --noEmit
mado static [--base-url …]        # low-level snapshot only
mado release                      # vite build + snapshots + deployment files
mado preview                      # serve out/ like a real static host
mado new <kind> <path>            # scaffold canonical files
```

## Honest boundaries

- No server renderer.
- No hydration protocol.
- No framework compiler.
- No runtime dependencies.
- No built-in backend.
- No UI-kit marketplace.
- Modern evergreen browsers only.
- A compatible Chromium is required at release time for static routes.
- Static `paths()` and `initialData()` callbacks must be browser-safe
  and secret-free (they run during discovery AND ship in the client
  bundle).

## Why teams pick Mado

| What matters to you | Best choice |
|---|---|
| Largest ecosystem, most hires available | React or Vue |
| Reusable design-system components across host frameworks | Lit |
| Maximum rendering performance, JSX workflow | Solid or Svelte 5 |
| Progressive enhancement of server-rendered pages | htmx + your backend |
| One component model for sites and apps with calm maintenance | **Mado** |

## Production

```bash
mado release    # typecheck + vite build + static snapshots + deployment files
mado preview    # serve out/ like a real static host
```

One command, one artifact (`out/`). Upload anywhere: VPS, Cloudflare
Pages, GitHub Pages (with base), any static CDN.

## Documentation

Canonical docs (English) live in [`docs/en/`](./docs/en/README.md).

AI-agent entrypoints: [AGENTS.md](./AGENTS.md) · [llms.txt](./llms.txt)

## Tests

```bash
npm run typecheck
npm run build
npm test
npm run size
npm run package:smoke
```

The full snapshot + takeover round-trip and the base-path contract
are required CI gates (`.github/workflows/ci.yml → static-snapshot`),
run under a pinned Playwright-managed Chromium with
`MADO_REQUIRE_BROWSER=1` so they never silently skip on PRs.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). Bug fixes with tests, docs
improvements, examples and carefully discussed core changes are
welcome. Runtime dependencies are not.

## License

MIT.