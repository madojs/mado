# Shadow DOM vs Light DOM

Mado components use Shadow DOM by default. This is a good default for
self-contained widgets, but it is not the right default for every component in
an application.

## Rule of Thumb

Use Mado route layouts (`page({ view: ({ child }) => ... })`) for app zones:
auth shells, admin shells, public shells and embedded shells. These live in
`src/layouts/` and are composed from `src/app.routes.ts`.

Use Web Components registered with `component()` for reusable UI elements and
widgets. Use plain functions only for small inline template helpers:

```ts
const money = (value: number) => html`<span>${formatMoney(value)}</span>`;
```

Do not hide app shells inside `main.ts` or generic helper functions. The app
map should show which layout wraps which route group.

Use **Shadow DOM** for leaf widgets:

- buttons, badges, cards, metrics;
- modals, toasts, small visual components;
- embed widgets that should not inherit app CSS accidentally;
- components whose styling should be owned by the component itself.

Use **Light DOM** for app structure that wants to share global CSS:

- route pages and route layouts;
- admin screens with dense table/form layouts;
- data-heavy screens with tables and forms;
- places where children should simply remain normal document DOM.

Route layouts receive `child` from Mado, so they do not need `<slot>`.

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
// app zone: route layout, styled by shared/styles/shell.css
export default page({
  view: ({ child }) => html`<main class="app-main">${child}</main>`,
});

// route page: light DOM, styled by shared/styles/content.css
export default page({
  view: () => html`<section><h1>Users</h1></section>`,
});

// leaf widgets: Shadow DOM default
component("x-status-badge", setup);
component("x-stat-card", setup);
component("x-toast-stack", setup);
```

This gives admin screens predictable CSS while preserving encapsulation for
reusable leaf widgets.

The import model is deliberately browser-native:

```ts
import "./components/app-layout.js";

render(html`<x-app-layout>${router.view}</x-app-layout>`, app);
```

The import registers the custom element with `customElements.define()`. The
template creates an `<x-app-layout>` element. The browser connects the two.
There is no React-style component value being passed around.

If you do need a reusable slot-based frame, keep it as a Shadow DOM component
and put frame styles in that component.

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

## Starter Lesson

The default starter uses this split deliberately:

- route layouts are `page()` files under `src/layouts/`;
- `shell.css` owns app-zone chrome;
- `content.css` owns page-level tables/forms/prose;
- leaf components such as `x-button`, `x-spinner` and badges keep Shadow DOM.

If a page suddenly looks unstyled, check whether it uses global classes inside a
Shadow DOM component. That is usually the issue.
