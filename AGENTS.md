# Agent rules for Mado

> This file is read by AI agents in IDEs (Cursor, Cline, Copilot, Continue, etc.).
> Goal: prevent them from generating React-like code where Mado should be used.
>
> Skip `TODO.md` unless the user explicitly resumes that tracker.

## Project at a glance

- **Mado** — a calm native-first web framework for both static sites
  and live SPAs. One Web Component model, one page model, one release
  command.
- Current phase: **pre-1.0 application validation** through
  [madojs.dev](https://madojs.dev) and Mado UI; independent external
  application validation is still pending.
  Read `package.json` for
  the current package version; do not infer stability from a roadmap date.
- Built on Web Components + signals + tagged-template `html`.
- **Vite is the canonical transport** for development, build and the
  static snapshot pipeline. Generated apps depend on `typescript`,
  `vite` and `playwright-core` (the last only for `mado release`,
  which captures real Chromium-rendered HTML).
- Zero runtime dependencies (Vite is dev/build tooling, not bundled).
- Small TypeScript core in `src/`; bundle size is measured but is not a hard
  gate while the public contract is still changing.

## Mado UI boundary

- [`@madojs/ui`](https://ui.madojs.dev) is a separate development CLI and
  versioned source registry. Use `npx @madojs/ui@latest ...` only when the
  application opts into the official UI registry.
- Never generate a browser import from `@madojs/ui`. Installed files belong to
  the application and may be edited.
- `mado new component` creates a minimal local component skeleton.
  `mado-ui add` installs reviewed registry source and its dependencies.
- If `mado-ui.json` exists, inspect it and `.mado-ui.lock.json` before adding,
  updating or recreating UI source. Commit both project-state files.
- Lock format 2 records the developer's `explicitItems` and every installed
  item's direct dependency edges. Treat them as ownership metadata; never
  reconstruct roots or removal edges from the current registry.
- A format-1 lock requires the original explicit roots:
  `mado-ui migrate <explicit-item...> --dry-run`, then the same command without
  `--dry-run`. Never infer those roots from installed files; ask when they
  cannot be recovered.
- Remove only explicit roots with
  `mado-ui remove <item...> --dry-run`, review the plan, then rerun without
  `--dry-run`. Do not manually delete copied files or hand-edit the lock.

## HARD RULES — violation = bug

### 1. Templates — tagged template ``` html`` ``` only

```ts
// ❌ NO
const view = <button onClick={fn}>{count}</button>;

// ❌ NO (this is Vue)
const view = `<button @click="fn">{{ count }}</button>`;

// ✅ YES
const view = html`<button @click=${fn}>${count}</button>`;
```

### 2. Reactivity — only via `signal()` / `computed()` / `effect()`

```ts
// ❌ NO (this is React)
const [count, setCount] = useState(0);
useEffect(() => { ... }, [count]);

// ❌ NO (this is Vue/Svelte reactivity)
let count = $state(0);
const vueCount = Vue.ref(0);

// ✅ YES
const count = signal(0);
const doubled = computed(() => count() * 2);
effect(() => console.log(count()));
count.set(5);
count.update(n => n + 1);
```

**A signal is a getter function**: read as `count()`, not `count.value`.

### 3. Components — Web Components via `component()`

```ts
// ❌ NO (classes / decorators / Lit-style)
class MyButton extends HTMLElement { ... }
@customElement('my-button')
class MyButton extends LitElement { ... }

// ❌ NO (React-style functional components)
function Counter() { return <button>...</button>; }

// ✅ YES
component("x-counter", (ctx) => {
  const count = signal(0);
  return html`<button @click=${() => count.update(n => n + 1)}>${count}</button>`;
});
```

- The element name **must contain a hyphen** (`x-foo`, `my-btn`, `app-shell`).
- `setup()` is called once on connect. Inside, we create signals and resources.
- `setup()` returns one `TemplateResult` directly. It is not a renderer
  function and is not re-run for state changes.
- Reactivity belongs only to template slots: `${signal}` or
  `${() => expression}`. Structural changes return nested templates from a
  reactive child slot.

### 4. Cleanup — `ctx.onDispose(fn)`

```ts
// ❌ NO (React)
useEffect(() => {
  const id = setInterval(...);
  return () => clearInterval(id);
}, []);

// ✅ YES
component("x-timer", (ctx) => {
  const id = setInterval(..., 1000);
  ctx.onDispose(() => clearInterval(id));
  return html`...`;
});
```

**`resource()`, `effect()`, and subscriptions inside `setup()` hook into the lifecycle automatically** — no need to write onDispose for them.

### 4b. Reactive attributes — `ctx.attr()`

```ts
// ❌ NO (reading once during setup, never reactive)
component("x-badge", ({ host }) => {
  const variant = host.getAttribute("variant") ?? "default";
  return html`<span class=${variant}>...</span>`;
});

// ❌ NO (MutationObserver boilerplate)
component("x-badge", ({ host, onDispose }) => {
  const variant = signal(host.getAttribute("variant") ?? "default");
  const obs = new MutationObserver(() =>
    variant.set(host.getAttribute("variant") ?? "default"),
  );
  obs.observe(host, { attributes: true, attributeFilter: ["variant"] });
  onDispose(() => obs.disconnect());
  return html`<span class=${variant}>...</span>`;
});

// ✅ YES — one line, reactive, no cleanup needed
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default");
  return html`<span class=${() => `badge-${variant()}`}>...</span>`;
});
```

`ctx.attr(name, defaultValue?)` returns a `Signal<string>` that auto-updates.
Internally Mado uses a per-instance `MutationObserver` for attributes registered
during `setup()`. The observer auto-disconnects on component removal via
lifecycle cleanup.

### 5. Reactive value in template child position = function

The most common AI mistake:

```ts
const count = signal(0);

// ❌ NOT REACTIVE — count() is read once
html`<div>${count() * 2}</div>`;

// ✅ REACTIVE — the function will be called when count changes
html`<div>${() => count() * 2}</div>`;

// ✅ ALSO OK — the signal itself is a function, Mado recognizes it
html`<div>${count}</div>`;
```

**Rule of thumb:** if there is a signal call (with parentheses) inside `${...}`, wrap it in `() => ...`.

### 6. Attribute bindings

```ts
// string/number → attribute
html`<a href=${url}>...</a>`;

// DOM property (objects, numbers without serialization, .value for input)
html`<input .value=${user.name} />`;
html`<my-list .items=${arr}></my-list>`;

// boolean attribute (toggle)
html`<button ?disabled=${isLoading}>...</button>`;

// event
html`<button @click=${fn}>...</button>`;
```

Common mistake: `disabled=${loading()}` — this attempts to set a **string** attribute `disabled="true"` or `disabled="false"`, which does not work correctly. **Use `?disabled=`.**

### 7. Lists — via `each()`

```ts
import { each } from "@madojs/mado";

// ❌ Works, but no keyed reconciliation → loses focus on reorder
html`<ul>
  ${() => items().map((t) => html`<li>${t.name}</li>`)}
</ul>`;

// ✅ Correct: keyed, reuses DOM nodes
html`<ul>
  ${() =>
    each(
      items(),
      (t) => t.id,
      (t) => html`<li>${t.name}</li>`,
    )}
</ul>`;
```

### 7b. Parser hard errors

Mado fails loudly for template shapes that cannot be represented safely.

```ts
// ❌ NO — slots inside RAW_TEXT elements are a parser error
html`<textarea>${draft}</textarea>`;
html`<title>${title}</title>`;

// ✅ YES — use properties or page/head APIs
html`<textarea .value=${draft}></textarea>`;
page({ title: ({ id }) => `User ${id}`, view: () => html`<main></main>` });

// ❌ NO — nested SVG-only templates lose namespace context
html`<svg>${html`<path d=${d}></path>`}</svg>`;

// ✅ YES — keep the SVG in one template or in its own component
html`<svg viewBox="0 0 10 10"><path d=${d}></path></svg>`;
```

No dynamic `${...}` child slots inside `<script>`, `<style>`, `<textarea>`,
or `<title>`. Keep SVG internals in one `<svg>...</svg>` template.

### 8. Routing — `routes()` + `page()`

```ts
// app.routes.ts — app manifest
import { routes } from "@madojs/mado";
export const manifest = {
  "/": () => import("./pages/home.page"),
  "/users/:id": () => import("./pages/user.page"),
  "*": () => import("./pages/not-found.page"),
};
export default routes(manifest);

// page file
import { page, html } from "@madojs/mado";
export default page<{ id: string }>({
  title: ({ id }) => `User ${id}`,
  view: ({ params }) => html`<x-user data-id=${params.id}></x-user>`,
});
```

- Each page is a **separate file** with `export default page({...})`.
  Start under `src/pages/`; introduce feature folders only when the application
  has real domain boundaries.
- Import pages with dynamic `import()` — this enables Vite code-splitting.
  Extensionless local specifiers are valid in generated Mado apps.
- Programmatic navigation: `import { navigate } from "@madojs/mado"; navigate("/users/42")`.
- Layouts are declared in the route manifest via `layout()`. Treat
  `layout.view({ child })` as a stateless wrapper around `${child}` and shared
  chrome. Put per-page state in pages/components/resources, not in layout view
  locals that depend on route identity.
- **`onDispose`** — cleanup hook for page views. Use for `setInterval`, `WebSocket`, `EventSource`. `resource()` and `effect()` are auto-cleaned.
- **`untracked()`** — an advanced escape hatch for excluding a read from your
  own `effect()`. Page/component setup is already isolated from parent
  tracking; never add `untracked()` merely because code runs in `view()`.

```ts
// page with polling and cleanup
import { page, html, signal } from "@madojs/mado";
export default page({
  view: ({ onDispose }) => {
    const data = signal(null);
    const poll = async () => {
      const res = await fetch("/api/status");
      data.set(await res.json());
    };
    const id = setInterval(poll, 5000);
    onDispose(() => clearInterval(id)); // ← cleaned up on navigation
    poll(); // initial call
    return html`<div>${() => JSON.stringify(data())}</div>`;
  },
});
```

### 9. Data fetching — `resource()` / `mutation()`

```ts
// ❌ NO (React Query / SWR)
const { data } = useQuery(['user', id], () => fetch(...));

// ✅ YES
import { resource, jsonFetcher, mutation, invalidate } from "@madojs/mado";

const user = resource(
  () => `/api/users/${userId()}`,   // key (reactive — re-fetches on change)
  jsonFetcher<User>(),               // how to load
  { staleTime: 60_000 },
);
// user.data() / user.error() / user.loading() / user.refresh() / user.mutate()

const save = mutation<User, User>(
  (u) => fetch("/api/users", { method: "POST", body: JSON.stringify(u) }).then(r => r.json()),
  { invalidates: ["/api/users*"] },  // glob invalidation
);
await save.run(newUser);
```

- A resource key is the cache identity. Same key means shared cache and deduped
  in-flight request; use distinct keys for distinct data or auth scope.
- `mutation().run()` is concurrent by default. `loading()` stays true while any
  run is in flight. Use `{ abortPrevious: true }` only for search-as-you-type or
  "latest request wins" flows.
- Invalidation is best-effort after a successful mutation; invalidation errors
  are logged but do not turn the mutation itself into a failure.

### 10. Forms — `useForm()`

```ts
// ❌ NO (Formik / RHF / Yup)
const { register, handleSubmit } = useForm({ resolver: yupResolver(schema) });

// ✅ YES
import { useForm } from "@madojs/mado";

const f = useForm({
  initial: { email: "", age: "" as number | "" },
  validate: async (values, { signal }) =>
    await api.valid(values, { signal }) ? null : { email: "Unavailable" },
});

html`
  <form
    @submit=${f.onSubmit(async (v) => {
      await api.save(v);
    })}
  >
    <input name="email" type="email" required @input=${f.onInput} @blur=${f.onBlur} />
    <input name="age" type="number" min="18" @input=${f.onInput} />
    ${() =>
      f.touched().email && f.errors().email
        ? html`<small>${f.errors().email}</small>`
        : null}
    <button ?disabled=${() => !f.isValid() || f.submitting()}>Save</button>
  </form>
`;
```

HTML owns native constraints. Custom validation receives an `AbortSignal`.
Use `setField`, not a schema/field-array abstraction.

### 11. Styles — ``` css`` ``` + Shadow DOM by default

Screens and layouts are `page()` definitions in the light DOM. Import their
global stylesheet from the application entry:

```ts
// src/main.ts
import "./styles/content.css";

// src/pages/admin.page.ts
import { html, page } from "@madojs/mado";

export default page({
  view: () => html`<main class="admin-screen">...</main>`,
});
```

Autonomous widgets are Shadow DOM components and carry their own styles:

```ts
import { component, css, html } from "@madojs/mado";

component("x-card", () => html`<div><slot></slot></div>`, {
  styles: css`
    :host {
      display: block;
      padding: 1rem;
    }
    div {
      background: var(--bg);
    }
    ::slotted(h2) {
      margin: 0;
    }
  `,
});
```

`{ shadow: false }` is a rare escape hatch for a custom element that must
render native controls into a parent form or meet another host-level Light DOM
requirement. Do not use it to build a route screen or to make global CSS reach
a component.

### 12. Context (DI) — `createContext` / `provide` / `inject`

```ts
import { createContext, provide, inject } from "@madojs/mado";

const ApiCtx = createContext<ApiClient>(defaultApi);

component("x-app", ({ host }) => {
  provide(host, ApiCtx, new ApiClient(...));
  return html`<x-child></x-child>`;
});

component("x-child", ({ host }) => {
  const api = inject(host, ApiCtx);  // signal<ApiClient>
  return html`<div>${() => api().version}</div>`;
});
```

This interoperates through the Web Components `context-request` protocol.
Providers may expose function values; only real Mado Signals are treated as
reactive sources. Subscriptions are removed with the active lifecycle.

### 13. Component registration imports

Custom elements are global after registration, but the browser never imports a
component file automatically.

```ts
// src/pages/dashboard.page.ts
import { html, page } from "@madojs/mado";
import "../components/status-badge.component";

export default page({
  view: () => html`<x-status-badge>Ready</x-status-badge>`,
});
```

The import runs `customElements.define("x-status-badge", ...)`. After that,
pages and layouts may render `<x-status-badge>` anywhere in the current
document.

Rules:

- Visual route chrome → implement as a `page()` layout with `{ child }` and
  wire it through `layout()` in the route manifest, not a slotted app-shell
  custom element.
- Non-visual global provider components, when genuinely needed → import in
  `main.ts`.
- Components used only by one page → import in that page.
- Components shared by a feature → import in the feature entry/page.
- Tiny leaf components used everywhere → importing in `main.ts` is acceptable.
- Do **not** bulk-import every component "just in case".

### 14. Static snapshots — browser-rendered, not SSR/SSG

`mado static` (normally invoked through `mado release`) captures real
HTML by navigating each page in a headless Chromium and serialising
the resulting DOM, including the Shadow DOM through Declarative Shadow
DOM (DSD). On first paint the live SPA **atomically replaces** the
static tree — there is no hydration protocol, no node reconciliation
and no per-attribute diffing.

A page opts in by declaring `static` on `page({ ... })`:

```ts
// Static landing page
export default page({
  static: true,
  title: "Home",
  head: () => ({ description: "Public landing" }),
  view: () => html`<main><h1>Hello</h1></main>`,
});

// Dynamic static route
export default page({
  static: {
    paths: async () => [{ slug: "alpha" }, { slug: "beta" }],
    initialData: async ({ slug }) => loadGuide(slug),
  },
  title: ({ slug }) => `Guide: ${slug}`,
  view: (ctx) => html`<article>${ctx.data}</article>`,
});
```

Important constraints:

- Static pages cannot use guards (route- or layout-level) — they are
  public by definition.
- `paths()` and `initialData()` run at discovery AND ship in the
  client bundle. Keep them browser-safe; never read secrets.
- A global wildcard route (`*`) may use literal `static: true` to produce a
  generic noindex `404.html`; its rendered fallback must not depend on
  `path()`. Without `static` it remains the SPA fallback. Object configs and
  other wildcard patterns cannot be static. An explicit captured or
  `public/404.html` disables the generated catch-all SPA `_redirects`; hybrid
  apps must provide host-specific rewrites for their known SPA-only routes.
- The `static` discovery uses Vite SSR as a control plane only;
  nothing is rendered in Node. The actual capture happens in
  headless Chromium.

<!-- docs-lint:allow-legacy-mention -->
There is no `bake`, no `bake.paths`, no `bake.data`, no
`bake.revalidate`, no `npm run bake`, no `linkedom` renderer, no
"meta-shell". Those names refer to a removed system; do not generate
them. If you see them in older docs, treat them as obsolete.
<!-- /docs-lint:allow-legacy-mention -->

## SOFT GUIDELINES — recommended, but not critical

- **TypeScript strict.** Use `noUncheckedIndexedAccess`-aware code (with `!` or a type guard).
- **Imports:** generated Vite apps may use extensionless local imports. Browser-native
  package examples that run without Vite should use `.js` specifiers.
- **Public imports only.** App code imports from `@madojs/mado`. Load the
  public `@madojs/mado/devtools.js` subpath dynamically behind
  `import.meta.env.DEV` when needed. Other package subpaths and `dist/src/*`
  are internal.
- **One file = one responsibility.** Don't put 5 components in one file "because they're all small".
- **Do not add runtime dependencies** (`npm install` in `dependencies`). This violates the framework's principle.
- **JSDoc on public functions** is required. Comments explain "why", not "what".

## Project structure

Two official starters target the same Mado runtime:

```
# universal starter (default — `mado init my-app`)
src/
├── main.ts
├── app.routes.ts
├── pages/         ← one *.page.ts per route, light DOM
├── components/    ← reusable Web Components (Shadow DOM)
├── content/       ← static content (guides, etc.)
└── styles/

# modular starter (`mado init my-app --starter modular`)
src/
├── main.ts
├── app.routes.ts
├── layouts/       ← stateless app-zone shells (`page({ child })`)
├── shared/        ← ui, http, lib, styles
└── modules/       ← bounded contexts with pages/data/api/services
```

The modular starter ships a dev-only mock API in `vite.config.ts`
(`/api/auth/*`, `/api/billing/*`). Disable with `MADO_MOCK_API=0`
or remove the `devApiMock()` plugin before pointing at a real backend.

## Internal links — always `routeUrl()`

Vite's `base` flows automatically into `appBase` and `routeUrl()`. App
code MUST use `routeUrl()` for every internal anchor so the URL stays
correct under `/`, `/mado/` or any sub-path deployment, and MUST opt
in with `data-link` for SPA navigation:

```ts
import { routeUrl } from "@madojs/mado";

html`<a data-link href=${routeUrl("/users/42")}>User</a>`;
html`<a data-link href=${routeUrl("/")}>Home</a>`;        // → "/mado/" under base
```

`navigate("/users/42")` for programmatic navigation. Both accept route
paths (no base) and apply the active base internally.

## App architecture for LLM

Generate the smallest structure justified by the application. The default
starter is canonical; the modular starter is an experiment for larger
business frontends, not a structure to impose on every project.

- `src/main.ts` mounts `routesApi.view` and imports global styles and component
  registrations.
- `src/app.routes.ts` owns the manifest and `routes(...)`.
- Put one route per file in `src/pages/`; add `layouts/`, feature folders,
  shared HTTP wrappers or DI only when repeated application code requires
  them.
- Do not generate `modules/`, repositories, connectors, providers or generic
  service layers pre-emptively. Mado is a frontend framework, not a backend
  architecture generator.
- Use browser `fetch()` directly for a small app. Add a thin application API
  helper when auth/error policy is genuinely shared.
- Use `resource()` for reactive reads, `mutation(..., { invalidates })` for
  writes, and `useForm()` for form state/validation.
- Use `mado release` as the production path. `out/` is the deploy artifact;
  static routes receive snapshots and client-only routes remain SPA fallbacks.

## Where to find specific answers

| Question                         | File                             |
| -------------------------------- | -------------------------------- |
| How does reactivity work?        | `src/signal.ts`                  |
| How are templates parsed?        | `src/html/`                      |
| How does the router work?        | `src/router/`                    |
| How does resource + cache work?  | `src/resource.ts`                |
| How do forms work?               | `src/forms.ts`                   |
| How should an app be structured? | `docs/en/16-app-architecture.md` |
| How should official UI source be installed? | `docs/en/17-mado-ui.md` |
| How should errors be handled?    | `docs/en/21-error-handling.md`   |
| How should static snapshots be used? | `docs/en/15-static-snapshots.md` / `docs/en/23-cookbook.md` |
| What API may applications use?   | `docs/en/30-api-surface.md`      |
| What ordering is guaranteed?     | `docs/en/31-reactivity-ordering.md` |
| What does v1 stability mean?     | `docs/en/32-v1-stability.md`     |
| Why is Mado still pre-1.0?       | `docs/architecture/maturity-roadmap.md` |
| When something goes wrong        | `docs/en/40-llm-guide.md`        |

## Before committing

```bash
npm run typecheck   # must pass
npm run build       # must build without warnings
npm test            # all tests green
```

## TL;DR for the agent

> If you are about to generate `useState`, JSX, `class extends HTMLElement`, `useEffect` with a return cleanup, `useForm` with yupResolver, `useQuery` with queryClient — **stop, you are not writing Mado**. Read this file again.
