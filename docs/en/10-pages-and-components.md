# Pages and Components

> Mado has exactly two framework primitives: `page()` and `component()`.
> The design decision has three outcomes: a URL-owned document is a page,
> an autonomous custom-element boundary is a component, and everything else
> stays native markup or a plain `html` helper.

This is the document that removes the most common Mado design
question. By the end of it you should never again have to think
"should this be a page or a component?", "should this be Shadow DOM
or Light DOM?", "does this need a Mado primitive at all?", or "how do I
share styles across components?". You just write the thing.

---

## The decision

| If the unit is…                                        | Use                                      |
| ------------------------------------------------------ | ---------------------------------------- |
| A URL-owned document (a route, a layout, a 404)        | `page()`                                 |
| An autonomous reusable custom-element boundary         | `component()`                            |
| Neither of the above                                   | Native markup or a plain `html` helper   |

That's it. Mado still has only two framework primitives: the third outcome is
ordinary application code. Pages are the documents your URLs expose.
Components are reusable Web Components. Repeated markup does not automatically
require a component.

A page can render any number of components. A component can never
participate in routing. Pages live in `src/pages/` (universal
starter) or in `src/modules/<name>/pages/` (modular starter).
Components live in `src/components/` or `src/modules/<name>/components/`.

You **never** wrap a page in `component()` — that breaks form
participation, shared CSS and the static snapshot capture. You
**never** route to a `component()` — only `page()` shows up in the
router manifest.

---

## You write the same TypeScript either way

```ts
import { html, page, signal } from "@madojs/mado";

// PAGE — has a URL, owns route + load + head + view
export default page({
  title: "Counter",
  view: () => {
    const n = signal(0);
    return html`
      <main>
        <h1>Counter</h1>
        <button @click=${() => n.set(n() + 1)}>Clicks: ${n}</button>
      </main>
    `;
  },
});
```

```ts
import { component, css, html, signal } from "@madojs/mado";

// COMPONENT — reusable, has no URL
component(
  "x-counter",
  () => {
    const n = signal(0);
    return html`
      <button @click=${() => n.set(n() + 1)}>Clicks: ${n}</button>
    `;
  },
  { styles: css`button { padding: .5rem 1rem; }` },
);
```

Same signals. Same `html\`\`` templates. Same lifecycle. Same data
model (`resource()`, `mutation()`, `useForm()`, `effect()`). The
only thing that changes is *where* the DOM lives.

---

## Native markup and open-code recipes

Not every reusable UI pattern needs a custom element. When native semantics,
form participation or document-level CSS should remain visible, keep the
markup in the page or a plain template helper:

```ts
import { html, type TemplateResult } from "@madojs/mado";

export function disclosure(
  label: string,
  content: TemplateResult,
): TemplateResult {
  return html`
    <details class="disclosure">
      <summary>${label}</summary>
      <div class="disclosure-content">${content}</div>
    </details>
  `;
}
```

The browser owns the disclosure state, keyboard interaction and accessibility
semantics. Its class rules live in a global stylesheet imported by `main.ts`.
A copied UI recipe may likewise combine semantic HTML, an open-code CSS file
and, only when the platform behavior is insufficient, a small binding or
`ref()` helper. This remains ordinary application code, not a third Mado
primitive.

Use `component()` when the unit benefits from an autonomous custom-element
identity, lifecycle and Shadow DOM boundary.

---

## What changes under the hood

| Property                                       | `page()`     | `component()` (default)        |
| ---------------------------------------------- | ------------ | ------------------------------ |
| DOM location                                   | Light DOM    | Open Shadow DOM                |
| Sees global CSS (`shell.css`, `content.css`)   | Yes          | No (Shadow boundary)           |
| Can use `<slot>`                               | No (uses `child`) | Yes                       |
| Participates in a parent `<form>`              | Yes          | No in Shadow DOM; use a native control or intentional `shadow:false` |
| Is captured by `mado static`                   | If `static: true \| { ... }` | Yes (DSD serialised) |
| Has a hyphenated custom-element tag            | No           | Yes (`x-foo`, `my-bar`)        |
| Owns its own CSS isolation                    | No           | Yes (via `css\`\``)            |

That is the entire decision matrix. Anything beyond it is detail.

---

## `{ shadow: false }` — the only escape hatch you need

Sometimes a custom element MUST live in the light DOM. Two real
cases:

1. **Native form participation.** A component that deliberately renders
   real controls into Light DOM so the browser includes them in the parent
   `<form>`.
2. **Host-level CSS that the document must address by tag name**
   (rare; usually solved by passing class attributes instead).

For both, declare `{ shadow: false }`:

```ts
component(
  "x-custom-input",
  () => html`<input name="email" />`,
  { shadow: false, styles: css`x-custom-input input { width: 100%; }` },
);
```

That is the *only* place this option is justified. If you reach for
`shadow: false` because you want to share document-level CSS classes,
**stop** — you wanted a `page()`, not a component.

Page-shaped wrappers (layouts, route shells) are written with
`page({ view: ({ child }) => ... })`. They are not components.

---

## Decision table

| You are writing…                              | Reach for                                     |
| --------------------------------------------- | --------------------------------------------- |
| A landing page                                | `page({ static: true, view })`                |
| A dynamic SEO page (`/product/:slug`)         | `page({ static: { paths, initialData } })`    |
| An app screen behind auth                     | `page({ view })` (no `static`)                |
| A shared shell that wraps several pages       | `page({ view: ({ child }) => html\`...\` })`  |
| A native UI recipe (button, card, dialog)    | semantic markup, CSS or an `html` helper      |
| An autonomous encapsulated widget            | `component("x-foo", setup, { styles })`       |
| A custom form input                          | `component("x-input", setup, { shadow: false })` |
| A small inline render helper (no state)       | a plain `(arg) => html\`...\`` function      |

When in doubt: a URL-owned document is a page; an autonomous reusable DOM
boundary is a component; everything else can stay native markup or a plain
template helper.

---

## Anti-patterns

These are the four mistakes Mado generators and AI assistants tend
to produce. Avoid them.

### 1. Page inside a `component()`

```ts
// ❌ Don't
component(
  "x-home-page",
  () => html`<h1>Home</h1><p>...</p>`,
);

// ✅ Do
export default page({
  static: true,
  title: "Home",
  view: () => html`<h1>Home</h1><p>...</p>`,
});
```

Why: the page becomes invisible to the router, the static snapshot
pipeline cannot find it, and shared CSS (`content.css`) does not
cross the Shadow boundary.

## Synchronous `page.load`

`page.load(params, seed)` must return a value or a `Resource` synchronously.
Returning a Promise is rejected because navigation commit and rollback need a
clear lifecycle owner. Put asynchronous work in `resource()` and render its
`loading()`, `error()` and `data()` signals. Guards may remain async; head/title
are committed only after guards succeed.

### 2. Component used as a route

```ts
// ❌ Don't
import "./components/billing-screen.component.js";
const manifest = { "/billing": () => html`<x-billing-screen/>` };

// ✅ Do
import billing from "./pages/billing.page.js";
const manifest = { "/billing": billing };
```

Why: the router gives you `page.head()`, `page.load()`, the static
snapshot pipeline, the `data-mado-head` lifecycle and the seed
contract. A component does not.

### 3. `shadow: false` to "fix" CSS in a route layout

```ts
// ❌ Don't — this is a page wearing the wrong hat
component(
  "x-app-shell",
  () => ({ child }) => html`<header>...</header><main>${child}</main>`,
  { shadow: false, styles: css`...` },
);

// ✅ Do
export default page({
  view: ({ child }) => html`<header>...</header><main>${child}</main>`,
});
```

Why: light-DOM components do not get the route `child`, are not
recognised by `layout()`, and the manifest cannot wrap them.

### 4. Route-id state in layout view locals

```ts
// ❌ Don't — `current` is shared across every page rendered by this layout
const current = signal<User | null>(null);
export default page({
  view: ({ child }) => {
    effect(() => loadUser(routePath()).then(current.set));
    return html`<x-shell .user=${current}>${child}</x-shell>`;
  },
});

// ✅ Do — put the resource in the page that needs it
const user = resource(() => `/api/users/${userId()}`, jsonFetcher<User>());
```

Layouts are stateless wrappers. Per-page state belongs in the page
itself or in a `resource()` whose key is the page's identity.

---

## What about styles?

- `page()` lives in the light DOM. Use `content.css` / `shell.css`
  from `src/styles/` (universal starter) or `src/shared/styles/`
  (modular starter). Class selectors work normally.
- `component()` carries its own `css\`\``. CSS custom properties
  (`--accent`, `--bg`) cross the Shadow boundary; class selectors
  from the document do not.
- The shared design tokens (colours, spacing, type) live in
  `tokens.css`. They are CSS custom properties and reach both pages
  and components through `var(--...)`.

For the long form on style boundaries, see
[20-deployment.md](./20-deployment.md) (production tuning) and the
starter README files.

---

## What about routing and links?

Internal navigation is base-aware. Always use `routeUrl()` and
`data-link`:

```ts
import { html, routeUrl } from "@madojs/mado";

html`<a data-link href=${routeUrl("/billing/invoices")}>Invoices</a>`;
html`<a data-link href=${routeUrl("/")}>Home</a>`;     // → "/mado/" under base
```

`data-link` opts the anchor into SPA navigation. A bare `<a href>`
performs a full document load — that is intentional for foreign
links and downloads. The router intercepts links inside Shadow DOM
too (it uses `event.composedPath()`).

Full router contract: [12-routing.md](./12-routing.md).

---

## Further reading

- [11-templates-and-signals.md](./11-templates-and-signals.md) — the
  `html\`\`` parser, signals, `each`, reactive bindings.
- [12-routing.md](./12-routing.md) — `routes()`, layouts, guards,
  `routeUrl`, `navigate`, prefetch.
- [15-static-snapshots.md](./15-static-snapshots.md) — when to mark
  a page `static: true`.
- [14-forms.md](./14-forms.md) — `useForm()` + the only Shadow DOM
  case where `shadow: false` is right.
