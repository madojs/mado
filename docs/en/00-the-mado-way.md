# The Mado Way

> One right way. Strict contracts. No magic.

Mado is not just a framework — it is a **set of conventions**. If you follow them,
the project stays understandable even with 200 screens and 5 developers. If you
break them — types and the linter will tell you immediately.

## Principles

1. **One way.** For every task there is one right path, not five. If you write
   something unusual — ask yourself whether an idiomatic helper already exists.
2. **Explicitness over magic.** No file-system scanners, no implicit globals, no
   hidden side-effects. Everything the framework does can be read in a single file.
3. **Platform first.** If the browser already has a feature — use it directly.
   No custom abstractions over `fetch`, `<form>`, the History API, or Shadow DOM.
4. **Strict types.** `tsc --strict --noUncheckedIndexedAccess` always. If
   something cannot be typed — that is a signal the API is wrong.
5. **No runtime dependencies.** Every dependency is a years-long commitment; the
   Web Components ecosystem does not require it.

## Conventions

### Project structure

```
src/
├── routes.ts         ← route manifest, one file per project
├── main.ts           ← entry point: providers + mount <x-app>
├── pages/            ← one page = one file = `export default page({...})`
├── components/       ← reusable components, side-effect registration
├── lib/              ← contexts, API clients, business logic without UI
└── styles/           ← shared styles (if needed), .ts files with css``
```

This is **mandatory**, not optional. If a project has 10 developers — they must
all write the same way.

### One component = one file

```ts
// src/components/user-card.ts
import { component, html, css } from '@madojs/mado';

component('x-user-card', () => {
  return () => html`<div class="card"><slot/></div>`;
}, {
  styles: css`.card { padding: 1rem; }`,
});
```

`import './components/user-card.js'` **registers** the component via
`customElements.define`. This is a side effect. Import where the component is needed.

### One way to load data

❌ Do not call `fetch()` directly from a component. Always use:

```ts
// reading → resource
const user = resource(() => `/api/users/${id()}`, jsonFetcher());

// writing → mutation
const save = mutation(api.save, { invalidates: ['/api/users*'] });
```

This provides caching, cancellation, error handling, and auto-invalidation.

### One way to describe a page

```ts
// src/pages/user-profile.ts
import { page, html, resource, jsonFetcher } from '@madojs/mado';

export default page({
  title: ({ id }) => `User #${id}`,
  view:  ({ params }) => html`...`,
});
```

Three slots — `title`, `load`, `view`. No others. Want something else — that is
a component or a helper.

### One way to declare routes

See [`01-routing.md`](./01-routing.md).

## What we do NOT do

- ❌ Do not write components without a hyphen. This is the browser rule for
  custom elements: `user-card` is ok, `usercard` is not.
- `x-*` is only a convention for Mado examples and tests, not a brand standard.
  In production use a domain prefix: `app-*`, `crm-*`, `ticket-*`, `admin-*`.
- ❌ Do not use `innerHTML` directly. Only via `html\`\``.
- ❌ Do not call `setTimeout`/`setInterval` without cleanup. Only inside `effect()`.
- ❌ Do not store global mutable state. Use signals and `context`.
- ❌ Do not add packages without discussion. Every dependency is a commitment.

## When in doubt

If you are asking "what's the best way here?" — that is a signal that:
1. Either there is a built-in helper you don't know about (check `docs/`).
2. Or this is a new situation — discuss it and **record** it in this document
   as one more convention.

"A consistent okay beats a varied ideal."
