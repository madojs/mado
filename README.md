<div align="center">
  <img
    src="./docs/assets/brand/mado-logo-light.png"
    alt="MadoJS"
    width="560"
  />

  <p>
    <strong>Build business apps. Keep maintenance boring.</strong>
  </p>

  <p>
    Browser-native · TypeScript-first · Zero runtime dependencies
  </p>
</div>


# Mado

> A calm frontend stack for internal tools, admin panels and business SPA.

[![npm](https://img.shields.io/npm/v/@madojs/mado.svg)](https://www.npmjs.com/package/@madojs/mado)
[![CI](https://github.com/madojs/mado/actions/workflows/ci.yml/badge.svg)](https://github.com/madojs/mado/actions/workflows/ci.yml)
[![Browser Regression](https://github.com/madojs/mado/actions/workflows/browser.yml/badge.svg)](https://github.com/madojs/mado/actions/workflows/browser.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Mado is a browser-native SPA framework for teams that want routing, forms,
data fetching and state management — without turning their frontend into an
infrastructure project.

You write TypeScript, run `tsc`, and open the browser. No JSX transform, no
Vite required, no hidden build pipeline. The entire runtime is readable in an
evening. When something breaks, you can read the source and fix it.

Mado (`窓`) means "window" in Japanese: a calm window into your app, without
dragging a whole frontend factory into the room.

## When to use Mado

- **Admin panels and dashboards** — forms, tables, filters, auth, role guards.
- **Internal tools and backoffice** — CRUD workflows, settings, billing UI.
- **Small SaaS frontends** — where long-term maintainability matters more than
  ecosystem size.
- **Embedded widgets** — where small footprint and independence from host
  frameworks matter.

The common thread: apps where **the frontend should not become its own
infrastructure problem**.

## When not to use Mado

- **SEO-heavy public sites** that need SSR with hydration.
- **Large teams optimizing for hiring compatibility** — React/Vue have bigger
  talent pools.
- **Projects that need a mature UI-kit ecosystem** comparable to React today.
- **Beginners learning frontend** — React, Vue and Svelte have far larger
  learning resources.
- **Teams uncomfortable with a pre-v1 framework** — Mado is honest about its
  stage.

## What Mado will not build

Mado stays useful by saying no. These are intentionally out of scope:

- SSR with hydration. Use `bake` or edge prerender for SEO-oriented static
  output.
- A template compiler, JSX transform, or VDOM compatibility layer.
- A separate store library. Use `signal()`, `computed()` and `resource()`.
- Suspense primitives or a router plugin system.
- Built-in i18n, animation, or virtual-scroll primitives.
- Non-evergreen browser support. The baseline is modern evergreen browsers with
  Baseline 2023 platform features.

## Why teams pick Mado

| What matters to you | Best choice |
|---|---|
| Largest ecosystem, most hires available | React or Vue |
| Reusable design-system components across host frameworks | Lit |
| Maximum rendering performance, JSX workflow | Solid or Svelte 5 |
| Progressive enhancement of server-rendered pages | htmx + your backend |
| Full app stack with minimal infrastructure and calm maintenance | **Mado** |

**Honest tradeoffs:**

- **vs Lit** — Lit is better for design systems. Mado is for whole apps:
  router, data, forms and prerender in one package, no assembly required.
- **vs Solid** — Solid is faster and more mature. It also requires Vite + a
  babel plugin. Mado requires nothing but `tsc`.
- **vs htmx** — htmx is excellent when your backend owns HTML. Mado is for
  cases where you want a real SPA: local state, optimistic updates, cached
  resources, lazy modules and persisted UI state.

## What you get

Routing, forms, state, data fetching and prerendering — without ecosystem tax:

- No runtime dependencies to audit, update or break
- No bundler required to start (`tsc` is enough)
- Fewer moving parts to debug
- Compact API surface you can learn in a day
- Lower long-term cognitive load

```txt
Runtime budget:
  enforced in CI with npm run size
Runtime dependencies: 0
Required dev dependencies: typescript, esbuild, linkedom
```

## Quick Start

### Start a new app

```bash
npm exec --package @madojs/mado@latest -- mado init my-app
cd my-app
npm install
npm run dev
```

The admin starter gives you the blessed production shape: layouts, guards,
auth/API client, forms and a small admin shell.

```bash
npm exec --package @madojs/mado@latest -- mado init dashboard --starter admin
cd dashboard
npm install
npm run dev
```

The CRUD starter is a compact resource/mutation/forms example:

```bash
npm exec --package @madojs/mado@latest -- mado init my-app --starter crud
```

### Try the flagship example

```bash
git clone https://github.com/madojs/mado.git
cd mado
npm install
npm run build
npm run serve -- showcase
```

The showcase is a CRM-shaped pressure app with auth, tables, filters, nested
routes, context services, forms and real data patterns.

## How it works

### Signals — reactive state

```ts
import { signal, computed, effect } from "@madojs/mado";

const count = signal(0);
const doubled = computed(() => count() * 2);
effect(() => console.log(count()));

count.set(1);
```

Signals are getter functions: read with `count()`, write with `count.set(v)`
or `count.update(fn)`.

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

### Components — Web Components

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

### Routing — file-based-free

```ts
import { routes } from "@madojs/mado";

export default routes({
  "/": () => import("./pages/home.js"),
  "/users/:id": () => import("./pages/user-detail.js"),
  "*": () => import("./pages/not-found.js"),
});
```

Lazy loading, nested routes, query params, guards, hover prefetch, scroll
restoration, error boundary, View Transitions.

### Data — resource + mutation

```ts
import { resource, mutation, invalidate, jsonFetcher } from "@madojs/mado";

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

Resource keys are the cache identity. Use keys that include the endpoint, params
and data shape; two resources with the same key share cached data and in-flight
requests.

### Forms — schema-based validation

```ts
import { useForm, html } from "@madojs/mado";

const form = useForm({
  email: { required: true, type: "email" },
  age: { type: "number", min: 18 },
});

html`
  <form @submit=${form.onSubmit(async (values) => api.save(values))}>
    <input name="email" @input=${form.onInput} @blur=${form.onBlur}>
    <button ?disabled=${() => !form.isValid() || form.submitting()}>Save</button>
  </form>
`;
```

HTML-like constraints (`required`, `min`, `max`, `pattern`, `type`), async
validators, field arrays. Close to the platform, not fighting it.

### Lists — keyed reconciliation

```ts
import { each } from "@madojs/mado";

html`<ul>${() => each(items(), (item) => item.id, (item) => html`<li>${item.name}</li>`)}</ul>`;
```

### Static prerender — SEO without SSR

```bash
mado release
```

Build-time prerender of routes into static HTML with meta tags and JSON-LD.
No hydration runtime. For dynamic content, see the Cloudflare edge-prerender
PoC in [`examples/cloudflare`](./examples/cloudflare/).

## Production

```bash
mado release    # typecheck + build + bundle + bake + promote baked HTML + copy public -> out/
mado preview    # serve out/ like a static host
```

One command, one artifact (`out/`). Upload anywhere: VPS, Cloudflare Pages,
any static CDN.

## CLI

```bash
mado init my-app              # scaffold new app
mado init dashboard --starter admin
mado dev                      # dev server with hot reload
mado build                    # tsc compile
mado typecheck                # type check without emit
mado test                     # run test suite
mado release                  # full production build
mado preview                  # serve production build locally
```

## Documentation

- [The Mado way](./docs/en/00-the-mado-way.md) — conventions and principles
- [Routing](./docs/en/01-routing.md)
- [Project layout](./docs/en/02-project-layout.md)
- [Static bake & SEO](./docs/en/03-static-bake.md)
- [App architecture](./docs/en/10-app-architecture.md)
- [Layouts](./docs/en/11-layouts.md)
- [Auth and API](./docs/en/12-auth-and-api.md)
- [Deployment](./docs/en/13-deployment.md)
- [Testing](./docs/en/14-testing.md)
- [Error handling](./docs/en/15-error-handling.md)
- [For backend developers](./docs/en/06-for-backenders.md)
- [Why Mado (detailed comparison)](./docs/en/05-why-mado.md)

Localized docs: [French](./docs/fr/README.md) · [Ukrainian](./docs/uk/README.md) · [Russian](./docs/ru/README.md) 

AI-agent entrypoints: [AGENTS.md](./AGENTS.md) · [llms.txt](./llms.txt)

## Examples

- [`examples/showcase`](./examples/showcase/) — flagship CRM pressure app
  (auth, tables, filters, forms, nested routes, context services).
- [`examples/tickets`](./examples/tickets/) — CRUD validation app.
- [`examples/basic`](./examples/basic/) — minimal API tour.
- [`examples/cloudflare`](./examples/cloudflare/) — edge prerender PoC.

## Known Limits

| Limit | What it means |
|---|---|
| No SSR hydration | Use `bake` or edge prerender for SEO. Server rendering is out of scope. |
| Small ecosystem | No UI-kit or plugin marketplace. You own your components. |
| Pre-v1 API | Public API is small and intentional, but may change before v1. |
| Evergreen browsers only | Modern Chrome, Edge, Firefox, Safari. No IE/legacy. |
| Template IDE support | `html`` highlighting needs lit-plugin or similar. |

## Tests

```bash
npm run typecheck
npm run build
npm test
npm run test:browser
```

Covers signals, computed, effects, html parser, keyed reconciliation, resources,
mutations, forms, router isolation, component lifecycle and example smoke tests.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). Bug fixes with tests, docs
improvements, examples and carefully discussed core changes are welcome.
Runtime dependencies are not.

## License

MIT.
