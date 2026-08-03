# The Mado Way

> One right way. Strict contracts. No magic.

Mado is a frontend framework for static sites and live SPAs that should be
easy to build and boring to maintain. It provides a small set of contracts;
application structure grows only when the application has a measured need.

## Principles

1. **One way.** For every task there is one right path, not five. If you write
   something unusual — ask yourself whether an idiomatic helper already exists.
2. **Explicitness over magic.** No file-system scanners, no implicit globals, no
   hidden side-effects. Everything the framework does can be read in a single file.
3. **Platform first.** If the browser already has a feature — use it directly.
   Mado helpers may add reactivity and lifecycle ownership, but they do not hide
   the native `fetch`, `<form>`, History API or Shadow DOM contracts.
4. **Strict types.** `tsc --strict --noUncheckedIndexedAccess` always. If
   something cannot be typed — that is a signal the API is wrong.
5. **No runtime dependencies in Mado core.** Every framework dependency is a
   years-long commitment; the Web Components ecosystem does not require one.

## Conventions

### Project structure

```txt
src/
├── main.ts           ← boot: global CSS + render router
├── app.routes.ts     ← one readable route map
├── pages/            ← one *.page.ts per route
├── components/       ← autonomous Web Components
├── content/          ← optional static content
└── styles/           ← optional document/global CSS
```

This universal starter is the canonical minimum. Add `layouts/`, feature
folders, shared HTTP policy or domain modules only after repeated application
code justifies them. The modular starter is an optional architecture
experiment, not a framework contract.

### One component = one file

```ts
// src/components/x-user-card.component.ts
import { component, html, css } from "@madojs/mado";

component(
  "x-user-card",
  () => {
    return html`<div class="card"><slot /></div>`;
  },
  {
    styles: css`
      .card {
        padding: 1rem;
      }
    `,
  },
);
```

`import "./components/x-user-card.component.js"` **registers** the component via
`customElements.define`. This is a side effect. Import where the component is needed.

### Data at the right level

Use browser `fetch()` directly for a small one-off request. Add a thin
application helper only when authentication, decoding or error policy is
actually shared.

Use `resource()` for reactive reads that need loading/error state,
cancellation, caching or invalidation. Use `mutation()` for writes whose state
or invalidation belongs in the UI lifecycle:

```ts
// reactive read
const user = resource(() => `/api/users/${id()}`, jsonFetcher());

// tracked write
const save = mutation(api.save, { invalidates: ["/api/users*"] });
```

Resources, mutations and effects created in a page view or component setup are
disposed with that owner. An intentionally standalone resource or mutation
must have an integration owner that eventually calls its idempotent
`dispose()`.

### One way to describe a page

```ts
// src/pages/user-profile.page.ts
import { page, html, resource, jsonFetcher } from "@madojs/mado";

export default page({
  title: ({ id }) => `User #${id}`,
  view: ({ params }) => {
    const user = resource(() => `/api/users/${params.id}`, jsonFetcher());
    return html`...`;
  },
});
```

Keep page-local signals, resources and forms inside `view()`. Module-wide state
is ordinary application code; introduce a service or context only when multiple
owners genuinely share it.

### One way to declare routes

See [`12-routing.md`](./12-routing.md).

## What we do NOT do

- ❌ Do not write components without a hyphen. This is the browser rule for
  custom elements: `user-card` is ok, `usercard` is not.
- `x-*` is only a convention for Mado examples and tests, not a brand standard.
  In production use a domain prefix: `app-*`, `crm-*`, `ticket-*`, `admin-*`.
- ❌ Do not assign `innerHTML` directly. Build structure with ``` html`` ```; use
  `unsafeHTML()` only for content you own or have already sanitized.
- ❌ Do not start timers or raw browser subscriptions without cleanup. Pair them
  with the page/component `onDispose`; an `effect()` may return cleanup for work
  owned by that effect.
- ❌ Do not store global mutable state. Use signals and `context`.
- ❌ Do not add application packages reflexively. Prefer the platform and record
  the measured need; never add a runtime dependency to Mado core.

## When in doubt

If you are asking "what's the best way here?" — that is a signal that:

1. Either there is a built-in helper you don't know about (check `docs/`).
2. Or this is a new situation — discuss it and **record** it in this document
   as one more convention.

"A consistent okay beats a varied ideal."
