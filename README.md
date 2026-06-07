<div align="center">
  <img
    src="./docs/assets/brand/mado-logo-light.png"
    alt="MadoJS"
    width="560"
  />

  <p>
    <strong>A small native-web SPA framework you can read in an evening.</strong>
  </p>

  <p>
    <code>tsc → browser</code> · Zero runtime dependencies · No required bundler
  </p>
</div>


# Mado

> A small native-web SPA framework you can read in an evening.

Mado is a thin TypeScript framework on top of the browser platform: Web
Components, signals, tagged-template `html`, a router, resources, forms,
context, persisted state and static prerender. No runtime dependencies, no
required bundler, no hidden build pipeline: `tsc → browser`.

Mado (`窓`) means “window” in Japanese: a calm native-web window into an app,
without dragging a whole frontend factory into the room.

```txt
Runtime budget after build:
  native ESM graph: ~60 KB raw, ~24 KB gzip across separate modules
  bundled/minified full API: ~32 KB raw, ~11 KB gzip, ~10 KB brotli
Runtime dependencies: 0
Required dev dependency: typescript
```

## Who It Is For

- Backend developers who need admin panels, dashboards or internal tools
  without learning another build stack first.
- Frontend developers who like the browser platform and want a compact,
  readable tool instead of a large ecosystem contract.
- Small teams that value ownership: if something breaks, `src/` is small
  enough to inspect and patch.
- Landing pages, widgets, embedded tools and CRUD-heavy SPA surfaces where
  predictable code matters more than framework fashion.

## Who It Is Not For

- Beginners learning frontend for the first time. React, Vue and Svelte have
  far larger learning ecosystems.
- Teams that need a ready-made UI-kit ecosystem comparable to React.
- Products that require SSR with hydration as a hard requirement.
- Projects that need a mature plugin marketplace today.
- Teams that are uncomfortable using a pre-v1 framework.

## Why Not Lit, Solid Or htmx?

Short honest version:

- **Lit** is better for design systems and reusable components that must live
  inside many host frameworks. Mado is for whole apps: router, data, forms and
  SEO tools in one small package.
- **Solid** is faster and more mature. It also expects a JSX transform and a
  build pipeline. Mado intentionally works with browser ESM and `tsc`.
- **htmx** is excellent when your backend wants to own HTML fragments. Mado is
  for cases where you still want an SPA: local state, optimistic updates,
  cached resources, query params, lazy modules and persisted UI state.

Mado does not try to win synthetic benchmark marketing. It avoids a Virtual DOM,
uses fine-grained signals and keyed DOM reconciliation, and aims to stay fast
enough for serious admin apps while remaining small and readable.

## Quick Start

### Start a new app

```bash
npm exec --package @madojs/mado@latest -- mado init my-app
cd my-app
npm install
npm run build
npm run serve
```

Use the CRUD starter when you want a compact admin-style example with
`resource()`, `mutation()`, `useForm()`, `each()` and `queryParam()`:

```bash
npm exec --package @madojs/mado@latest -- mado init my-app --starter crud
```

### Try the repository examples

```bash
git clone https://github.com/madojs/mado.git
cd mado
npm install
npm run build
npm run serve -- basic
```

### Small component example

```ts
// src/pages/counter.ts
import { component, css, html, page, signal } from "@madojs/mado";

component(
  "x-counter",
  () => {
    const count = signal(0);
    return () => html`
      <button @click=${() => count.update((n) => n + 1)}>${count}</button>
    `;
  },
  { styles: css`button { padding: .5rem 1rem; }` },
);

export default page({
  title: "Counter",
  view: () => html`<x-counter></x-counter>`,
});
```

```ts
// src/routes.ts
import { routes } from "@madojs/mado";

export const manifest = {
  "/": () => import("./pages/counter.js"),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest);
```

The developer convenience CLI is available as `mado`:

```bash
mado init my-app
mado init my-app --starter crud
mado build
mado typecheck
mado test
mado serve basic
mado dev showcase
mado examples
```

The CLI is useful before v1, but its command polish may still change.

## Documentation

- [Language index](./docs/README.md)
- [English docs](./docs/en/README.md)
- [Russian docs](./docs/ru/README.md)
- [Documentation française](./docs/fr/README.md)
- [Ukrainian docs](./docs/uk/README.md)

Core topics:

- [The Mado way](./docs/en/00-the-mado-way.md)
- [Routing](./docs/en/01-routing.md)
- [Project layout](./docs/en/02-project-layout.md)
- [Static bake & SEO](./docs/en/03-static-bake.md)
- [IDE setup](./docs/en/04-ide-setup.md)
- [Why Mado](./docs/en/05-why-mado.md)
- [For backenders](./docs/en/06-for-backenders.md)
- [LLM pitfalls](./docs/en/07-llm-pitfalls.md)
- [Shadow DOM vs Light DOM](./docs/en/09-shadow-vs-light-dom.md)

AI-agent entrypoints:

- [AGENTS.md](./AGENTS.md)
- [llms.txt](./llms.txt)

## Examples

- [`examples/basic`](./examples/basic/) — minimal API tour.
- [`examples/tickets`](./examples/tickets/) — LLM zero-history CRUD validation.
- [`examples/showcase`](./examples/showcase/) — flagship SaaS CRM pressure app.
- [`examples/cloudflare`](./examples/cloudflare/) — edge prerender / deployment PoC.

## Core API

### Signals

```ts
import { batch, computed, effect, flushSync, signal } from "@madojs/mado";

const count = signal(0);
const doubled = computed(() => count() * 2);

effect(() => console.log(count()));

batch(() => {
  count.set(1);
  count.set(2);
});

flushSync();
```

Signals are getter functions: read with `count()`, write with `count.set(next)`
or `count.update(fn)`.

### Templates

```ts
html`<button @click=${fn} ?disabled=${loading} class=${className}>${label}</button>`;
```

- Child bindings accept text, nodes, arrays, nested `html```, and `each(...)`.
- `attr=${v}` writes an attribute.
- `@event=${fn}` attaches an event listener.
- `.prop=${v}` writes a DOM property.
- `?attr=${flag}` toggles a boolean attribute.
- Function values, including signals and computed values, are tracked
  reactively.

### Components

```ts
import { component, css, html } from "@madojs/mado";

component(
  "x-card",
  () => () => html`<section><slot></slot></section>`,
  {
    styles: css`
      :host { display: block; }
      section { padding: 1rem; border: 1px solid var(--border); }
    `,
  },
);
```

Components are Custom Elements. Shadow DOM is enabled by default. Use
`{ shadow: false }` for app shells and admin layouts that should inherit global
utility classes.

### Lists

```ts
import { each } from "@madojs/mado";

html`
  <ul>
    ${() => each(items(), (item) => item.id, (item) => html`<li>${item.name}</li>`)}
  </ul>
`;
```

`each()` performs keyed reconciliation and reuses DOM nodes across reorder,
insert and delete operations.

### Routing

```ts
import { routes } from "@madojs/mado";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "/users/:id": () => import("./pages/user-detail.js"),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest);
```

The router provides lazy page loading, nested routes, query params, hover
prefetch, async stale guards, loading delay, View Transitions support and
`dispose()` for tests/dev overlays.

### Data

```ts
import { invalidate, jsonFetcher, mutation, resource } from "@madojs/mado";

const user = resource(
  () => `/api/users/${userId()}`,
  jsonFetcher<User>(),
  { staleTime: 60_000 },
);

const save = mutation(api.saveUser, {
  invalidates: ["/api/users*"],
});

await save.run(values);
invalidate("/api/users*");
```

`resource()` handles cache, loading/error state, aborts, refresh and optimistic
local `mutate()`. Inside `component()` setup it is lifecycle-aware.

### Forms

```ts
import { html, useForm } from "@madojs/mado";

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

Validation is based on native HTML constraint validation plus optional custom
`validate(values)`.

## Static HTML Without Hydration

Mado intentionally does not ship SSR with hydration. For SEO-oriented pages it
offers `bake`: build-time prerender of finite routes into HTML with meta tags,
JSON-LD and baked data. For very large or changing catalogs, see the
Cloudflare Worker edge-prerender PoC in [`examples/cloudflare`](./examples/cloudflare/).

## Production Bundle

Native ESM is the default development and demo path. When a bundled production
artifact is useful, run:

```bash
npm run bundle
npm run preview
```

`bundle` uses optional `esbuild` for code splitting, SRI, `.gz` and `.br`
outputs. `preview` emulates the provided `nginx.conf` with `node:http`.

## Tests

```bash
npm run typecheck
npm run build
npm test
npm run test:browser
```

The test suite covers signals, computed values, effects, dynamic dependencies,
the html parser, keyed reconciliation, resources, mutations, forms, router
isolation, component lifecycle and example smoke tests.

## Known Limits

| Limit | Meaning |
|---|---|
| No SSR hydration | Use `bake` or edge prerender for SEO. Per-user server rendering is intentionally out of scope for now. |
| Small ecosystem | No plugin marketplace or UI-kit ecosystem comparable to React. |
| Template IDE support needs plugins | `html`` syntax highlighting/type tooling usually needs lit-plugin or similar tooling. |
| Evergreen browsers | Targets modern Chrome/Edge/Firefox/Safari. Legacy browsers are out of scope. |
| Pre-v1 API | Public API is intentionally small, but v0.x may still change before v1. |

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). The short version: bug fixes with
tests, docs improvements, examples and carefully discussed small core changes
are welcome. Runtime dependencies are not.

## License

MIT.
