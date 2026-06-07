# Shadow DOM vs Light DOM

Mado components use Shadow DOM by default. This is a good default for
self-contained widgets, but it is not the right default for every component in
an application.

## Rule of Thumb

In Mado, layouts are components too. If a file represents a visible reusable
part of the app tree — app shell, sidebar, modal, table, page section — prefer a
Web Component registered with `component()`.

Use plain functions only for small inline template helpers:

```ts
const money = (value: number) => html`<span>${formatMoney(value)}</span>`;
```

Do not use functions for app shells in public examples. They work, but they
hide the browser model instead of teaching it.

Use **Shadow DOM** for leaf widgets:

- buttons, badges, cards, metrics;
- modals, toasts, small visual components;
- embed widgets that should not inherit app CSS accidentally;
- components whose styling should be owned by the component itself.

Use **Light DOM** (`{ shadow: false }`) for app structure that wants to share
global CSS utilities:

- route/page components;
- admin screens with dense table/form layouts;
- data-heavy screens with tables and forms;
- components that intentionally share global layout, form and table utilities;
- places where children should simply remain normal document DOM.

Use **Shadow DOM** for slot-based layouts:

- app shells that render `<slot>`;
- sidebar/content wrappers;
- reusable layout frames that own their own grid/header/sidebar CSS.

`<slot>` is a Shadow DOM feature. In a `shadow: false` component, `<slot>` is
just a normal element and does not move children into that position.

## The Footgun

Global CSS does not cross a Shadow DOM boundary.

```ts
// global.ts
export const globalStyles = css`
  .page-head { display: flex; justify-content: space-between; }
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
`;

// ❌ .page-head and .metric-grid will not apply inside x-dashboard shadowRoot
component("x-dashboard", () => () => html`
  <header class="page-head">...</header>
  <div class="metric-grid">...</div>
`);
```

Fix it by making the route/page component Light DOM:

```ts
component("x-dashboard", () => () => html`
  <header class="page-head">...</header>
  <div class="metric-grid">...</div>
`, {
  shadow: false,
  styles: css`
    x-dashboard { display: block; }
    x-dashboard .panel { padding: 1rem; }
  `,
});
```

Now global utilities and local scoped styles both work.

## How Styles Behave

- `styles: css\`\`` in Shadow DOM is adopted into the component shadowRoot.
- `styles: css\`\`` with `shadow: false` is scoped to the tag name and adopted
  globally.
- CSS custom properties (`--accent`, `--bg`, etc.) cross Shadow DOM boundaries.
- Class selectors like `.btn`, `.form-grid`, `.page-head` do **not** cross
  Shadow DOM boundaries.
- Slotted children keep their own document styles; the shadow component can only
  target them through `::slotted(...)`.
- `<slot>` projects children only in Shadow DOM. In a `shadow: false` component
  it is just a normal `<slot>` element and will not move children into that
  place in your layout.

## Recommended App Shape

```ts
// root and pages: Light DOM
component("x-app", setup, { shadow: false });
component("x-users-page", setup, { shadow: false });

// slot-based layout: Shadow DOM default, because it owns the shell grid
component("x-app-layout", setup);

// leaf widgets: Shadow DOM default
component("x-status-badge", setup);
component("x-stat-card", setup);
component("x-toast-stack", setup);
```

This gives backend-admin screens predictable CSS while preserving encapsulation
for reusable widgets and slot-based shells.

The import model is deliberately browser-native:

```ts
import "./components/app-layout.js";

render(html`<x-app-layout>${router.view}</x-app-layout>`, app);
```

The import registers the custom element with `customElements.define()`. The
template creates an `<x-app-layout>` element. The browser connects the two.
There is no React-style component value being passed around.

If a layout does not need slot projection and should be styled entirely by
global CSS, `shadow: false` can still be a good choice. If it contains
`<slot>`, keep Shadow DOM and put the shell styles in that component.

## Routing and Links

`data-link` works inside Shadow DOM. The router uses `event.composedPath()`, so
click interception and hover-prefetch can see links from open shadow roots.

```ts
component("x-card-link", () => () => html`
  <a href="/app/accounts" data-link>Accounts</a>
`);
```

The link can be in Shadow DOM; navigation still stays SPA.

## Where To Import Components

Custom elements are global after registration, but registration is still an
explicit JavaScript import.

```ts
// main.ts: global app frame
import "./components/app-shell.js";

// pages/tickets.ts: page-owned feature component
import "../components/ticket-list.js";
```

The browser does **not** download `ticket-list.js` just because it sees
`<ticket-list>`. The file must be imported somewhere first. Once imported, it
calls `customElements.define(...)`, and the tag becomes known in the current
document.

Do not bulk-import every component in `main.ts` "just in case". It works for
tiny demos, but it hides ownership and defeats lazy route loading. Prefer:

- global app shell/providers in `main.ts`;
- page-owned components in that page file;
- feature-owned shared components in the feature entry page;
- truly global leaf components in `main.ts` only when they are used everywhere.

## Showcase Lesson

`examples/showcase` uses this split deliberately:

- `x-app` and CRM route pages are Light DOM;
- `x-app-layout` keeps Shadow DOM because it owns a slot-based sidebar/content
  shell;
- table/form/page utilities live in `styles/global.ts`;
- leaf components such as `x-stat-card`, `x-status-badge`, `x-modal`, and
  `x-toast-stack` keep Shadow DOM.

If a page suddenly looks unstyled, check whether it uses global classes inside a
Shadow DOM component. That is usually the issue.
