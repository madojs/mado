# AGENTS.md — contracts for LLM agents

> This file is machine-readable and human-readable. If you are an LLM working
> on this codebase, you can rely on every rule below being enforced by ESLint
> or by convention. This is the ground truth; soft style guides aren't.

## 0. Mado API cheat sheet (ground truth)

This starter uses [Mado](https://github.com/madojs/mado) — NOT React, Lit
or Solid. Do not invent APIs. The pieces you'll see in this codebase:

- `signal()`, `computed()`, `effect()`, `batch()`, `untracked()` —
  signals. Read: `count()`. Write: `count.set(v)` / `count.update(fn)`.
  **No `.value`.** **No hooks.**
- `html\`...\`` — tagged template, NOT JSX. Bindings:
  `${value}`, `attr=${v}`, `.prop=${v}`, `?attr=${flag}`, `@evt=${fn}`.
  **A reactive child = a getter function: `${() => count() * 2}`.**
- `render(htmlTpl, container)` — mount root.
- `each(items, keyFn, renderFn)` — keyed list. Do not use `.map()` for lists.
- `component("x-tag", ({ attr, onDispose }) => () => html`...`, { styles })` —
  Web Component registration. `attr(name, default?)` returns a reactive
  `Signal<string>`.
- `page({ title, view, bake?, ... })` — route page. `view` receives
  `{ params, query, child }` (child only in layouts).
- `routes(manifest)` / `layout({ layout, guard, routes })` — router DSL.
- `navigate(path)` — programmatic navigation.
- `resource(keyFn, fetcherFn, { staleTime })` — data resource with cache.
  Keys are typically URL-shaped. Read: `r.data()`, `r.loading()`,
  `r.error()`. Refetch: `r.refresh()`.
- `mutation(runFn, { invalidates: string[], abortPrevious? })` — call with
  `.run(input)`. `invalidates` uses glob patterns over keys.
- `useForm({ field: rules })` — schema-based form. Returns `{ onSubmit,
  onInput, onBlur, isValid(), submitting() }`.

Things that DO NOT exist in Mado (do not write them):

- ❌ `routePage()` / `mount()` / `prefix()` / `useRouteParam()` /
   `RouterOutlet`. Use `page()`, `render()`, `routes()`/`layout()`,
   `view: ({ params }) => ...`.
- ❌ JSX, hooks, decorators, classes, VDOM, `requestUpdate`.
- ❌ `signal.value`. There is no `.value`.
- ❌ Component `attrs.foo` plain string access. Use `ctx.attr("foo")`.

## 1. Project shape

```
src/
  main.ts                  # boot. ONLY file allowed to `import "*.css"`.
  app.routes.ts            # one source of truth. Exports both `default = routes(manifest)` and `manifest`.

  layouts/                 # all `*.layout.ts`. One zone of the app per file.
    app-shell.layout.ts
    auth-shell.layout.ts

  shared/                  # no business logic, no signal state
    ui/        lib/        http/        styles/

  modules/<name>/          # all business logic. Bounded context.
    <name>.types.ts        # domain types. only `export type`.
    <name>.routes.ts       # PLAIN map of path → lazy page imports. named `xRoutes`.
    <name>.public.ts       # ONLY file other modules may import from.
    <name>.service.ts?     # singleton state.
    <name>.connector.ts?   # one external API.
    <name>.guard.ts?       # route guards.
    *.page.ts              # route. default `page({...})`.
    *.component.ts         # reusable web component.
    *.resource.ts          # `resource(...)`/`mutation(...)` factories.
    *.form.ts              # `useForm` schema factory.
    _contracts/            # PRIVATE provider DTOs. never re-exported.
    _parts/                # module-local UI helpers.
    pages/ components/ data/ api/ forms/    # used when files >5.
```

## 2. File-form contracts

### `*.page.ts`
```ts
import { html, page } from "@madojs/mado";

// 1. LOCAL STATE
// 2. DATA           (resources from data/*.resource.ts)
// 3. ACTIONS
// 4. VIEW

export default page({
  title: string,
  bake?: { paths?: () => Array<Record<string, string>>, data?: ... },
  view: ({ params, query, child }) => unknown,
});
```
- Default export MUST be the result of `page(...)`.
- The 4 commented section headers MUST appear in this order even when empty.
- For pages with URL params, do `view: ({ params }) => { const x = use(() => params.id); ... }`.
- For functions called synchronously inside `view()` that read signals, wrap
  the signal reads in `untracked()` to avoid effect cycles with the router.

### `*.connector.ts`
```ts
// 1. CONFIG       const base = "/api/...";
// 2. MAPPERS      DTO → domain. pure functions.
// 3. ENDPOINTS    export const xxxApi = { ... };  // returns DOMAIN types only
// 4. ERRORS       export class XxxError extends HttpError {}
```
- MUST NOT import: `signal`, `computed`, `effect`, `resource`, `mutation`,
  `html`, `component`, `page`.
- MUST import its private DTOs ONLY from sibling `_contracts/`.

### `*.resource.ts`
```ts
import { mutation, resource } from "@madojs/mado";

export const useXxx = (...inputs) =>
  resource(() => "/api/xxx", () => xxxApi.method(), { staleTime: 30_000 });

export const saveXxx = mutation((input) => xxxApi.save(input), {
  invalidates: ["/api/xxx*"],
});
```
- Keys are URL-shaped so glob invalidates work naturally.
- MUST NOT import UI or services.

### `*.service.ts`
```ts
// 1. PRIVATE STATE  const _x = signal<...>(...)   // not exported
// 2. PUBLIC READS   export const x = () => _x()    // signal getter
// 3. ACTIONS        export function setX(v) { _x.set(v) }
// 4. INIT?          export function init(): Promise<void> | void
```
- ES module IS the singleton. No DI container.

### `*.guard.ts`
```ts
export function requireX(): boolean | string {
  if (!ok) return "/login"; // redirect path
  return true;              // allow
}
```
- Used inside `layout({ guard: requireX, ... })` in `app.routes.ts`.

### `*.form.ts`
```ts
import { useForm } from "@madojs/mado";
export const useInvoiceForm = () =>
  useForm({ email: { required: true, type: "email" } });
```
- MUST be called INSIDE a view (it's per-render).

### `*.routes.ts`
```ts
export const billingRoutes = {
  "/path": () => import("./path.page"),
};
```
- Pages MUST be lazy-imported.
- Paths are relative to the prefix mounted in `src/app.routes.ts`.

### `*.public.ts`
- ONLY `export ...` and `export type ...` statements re-exporting from the
  module's own internals.
- NEVER `export *`. (Forbidden by ESLint.)
- THE only file other modules may import from.

### `*.component.ts`
```ts
import { component, css, html } from "@madojs/mado";

component(
  "x-tag",
  ({ attr }) => {
    const size = attr("size", "md");
    return () => html`<div class=${() => `c-${size()}`}><slot></slot></div>`;
  },
  { styles: css`:host { display: block; }` },
);
```
- One side effect: the `component(...)` registration.
- Pure UI: no services, no resources, no business types.
- For reactive attributes, use `ctx.attr(name, default?)` — NOT plain
  `attrs.foo`.

### `*.types.ts`
- ONLY `export type` / `export interface`. No runtime values.

### `*.layout.ts` — app zone wrapper
```ts
import { html, page } from "@madojs/mado";
export default page({
  view: ({ child }) => html`<div class="shell">${child}</div>`,
});
```
- A layout IS a page. Its view wraps `${child}` in shared chrome.
- It does NOT know which page is rendered inside. `child` is anonymous.
- It MAY read public surfaces of other modules (e.g. `auth.public` for the
  nav bar). It MUST NOT keep per-route state in view locals.
- **A layout describes an APP ZONE, not a domain.** Zones are things like
  "auth", "app", "marketing", "embed". Multiple modules can share one zone.

**Placement is single-path:** ALL layouts live in `src/layouts/`. There are
no module-owned layouts. Composition (which shell wraps which module) is a
decision made in `src/app.routes.ts`.

## 3. Routing in `src/app.routes.ts`

```ts
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

Rules:
- Export `manifest` separately so `mado bake` can discover pages.
- Modules ALWAYS export a plain `routes` map. They never wrap themselves in
  `layout({...})`.
- Composition (shell + guard) happens ONLY inside `app.routes.ts`.
- Do not wrap routes in `main.ts` or in custom-element wrappers.

## 4. Import boundaries (enforced by ESLint)

| From                                | May import                                                            |
| ----------------------------------- | --------------------------------------------------------------------- |
| `src/{main,app.routes}.ts`          | anything                                                              |
| `src/layouts/*.layout.ts`           | `shared/**`, `modules/<y>/<y>.public.ts`, `modules/<y>/<y>.types.ts`  |
| `shared/**`                         | only `shared/**`                                                      |
| `modules/<x>/**` (any file)         | `shared/**` and `modules/<y>/<y>.public.ts` (or `<y>.types.ts`)       |
| `modules/<x>/api/**`                | additionally `_contracts/**` of its own module only                   |
| `modules/<x>/_contracts/**`         | only `_contracts/**` of its own module                                |
| `modules/<x>/*.connector.ts`        | NO `signal/resource/html/component/page/service` imports              |
| `modules/<x>/*.component.ts`        | NO services, NO resources (UI brick only)                             |
| `modules/<x>/*.routes.ts`           | only `*.page.ts` of its own module (no `layout`, no other modules)    |

Other rules:
- `import "*.css"` allowed ONLY in `src/main.ts`.
- `import` from any `index.ts/index.js` forbidden (no barrels).
- `export *` forbidden everywhere.

## 5. Adding things

### To add a page
1. `mado new page <module>/<sub>/<name>` (or paste the template).
2. Add a route to `modules/<module>/<module>.routes.ts`.
3. If the prefix is new, add a `"/prefix": layout({...})` entry to
   `src/app.routes.ts`.

### To add a module
1. `mado new module <name>` — creates `types/routes/public`.
2. Paste the snippet the generator prints into `src/app.routes.ts`.

### To add a connector
1. `mado new connector <module>/api/<provider>`.
2. Define the raw DTO in `modules/<module>/_contracts/<provider>.types.ts`.
3. Fill the `MAPPERS` section so the connector returns DOMAIN types only.

## 6. RBAC

- Route-level: pass `guard: requireAuth` (or `requirePermission("x.y")`) to
  `layout({...})` in `app.routes.ts`.
- UI-level: gate bits in views with `hasPermission("x.y")` from
  `modules/auth/auth.public`.

## 7. Styling

- `shared/styles/tokens.css` is loaded once in `index.html` and pierces
  shadow roots via `var(...)`. Use tokens in component `css\`...\``.
- `reset.css` and `app.css` apply ONLY to the light DOM (header, body).
- Per-component styles go inside the component file, never in a `.css` file.
