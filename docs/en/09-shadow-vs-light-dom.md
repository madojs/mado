# Shadow DOM vs Light DOM

Mado components use Shadow DOM by default. This is a good default for
self-contained widgets, but it is not the right default for every component in
an application.

## Rule of Thumb

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
