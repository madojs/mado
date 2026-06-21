# Шлях Mado

> Один зрозумілий шлях. Жорсткі контракти. Мінімум магії.

Mado — framework для команд, що будують admin panels, internal tools і
business SPA. Такі apps мають бути простими у розробці та нудними в підтримці,
тому Mado обирає чіткі conventions замість п'яти рівноправних стилів.

## Principles

1. **One way.** If code feels unusual, first check whether a canonical helper/API
   already exists.
2. **Explicit over magic.** No file-system scanners, implicit globals or hidden
   side effects.
3. **Platform first.** Web Components, History API, `<form>`, `fetch` and Shadow
   DOM stay visible.
4. **Strict types.** `tsc --strict --noUncheckedIndexedAccess` always.
5. **No runtime dependencies.** Dev/build tooling is fine; Mado runtime stays
   native.

## Project Structure

```txt
src/
├── main.ts           ← boot: global CSS/providers + render router
├── app.routes.ts     ← readable app map, exports `manifest` + default routes()
├── layouts/          ← app-zone wrappers (`page({ view: ({ child }) => ... })`)
├── shared/           ← UI bricks, http client, pure lib, global CSS
└── modules/          ← bounded contexts
    └── billing/
        ├── billing.routes.ts
        ├── billing.public.ts
        ├── billing.types.ts
        ├── pages/
        ├── data/
        ├── api/
        └── _contracts/
```

The default starter is the canonical version of this shape.

## One Component = One File

```ts
import { component, css, html } from "@madojs/mado";

component("x-user-card", () => () => html`<div class="card"><slot></slot></div>`, {
  styles: css`
    .card { padding: 1rem; }
  `,
});
```

Importing the component file registers the element. Import it where the tag is
used.

## One Way To Describe A Page

```ts
import { html, page, resource, jsonFetcher } from "@madojs/mado";

export default page({
  title: ({ id }) => `User #${id}`,
  view: ({ params }) => {
    const user = resource(() => `/api/users/${params.id}`, jsonFetcher());
    return html`...`;
  },
});
```

Page-local signals, resources and forms live inside `view()`. Module-wide state
lives in `*.service.ts`.

## What We Do Not Do

- No JSX/Vue/Svelte syntax.
- No custom elements without a hyphen.
- No signal `.value`; a signal is a function.
- No direct `innerHTML`.
- No runtime packages without discussion.

When in doubt, document one clear recipe instead of adding a new core primitive.
