# Shadow DOM vs Light DOM

Mado components use Shadow DOM by default. This is good for self-contained
widgets, but app zones and pages usually stay as light DOM templates.

## Rule

Use route layouts for app zones:

```ts
export default page({
  view: ({ child }) => html`<main class="app-main">${child}</main>`,
});
```

These files live in `src/layouts/` and are composed from `src/app.routes.ts`
with `layout()`. They are styled by `src/shared/styles/shell.css`.

Use page files for screens:

```ts
export default page({
  view: () => html`<section><h1>Users</h1></section>`,
});
```

Page-level tables, forms, prose and simple states are styled by
`src/shared/styles/content.css`.

Use Shadow DOM components for leaf widgets:

- buttons, badges, cards, metrics;
- spinners, modals, toasts;
- widgets that should own their CSS.

```ts
component("x-status-badge", ({ attr }) => {
  const status = attr("status", "draft");
  return () => html`<span>${status}</span>`;
}, {
  styles: css`
    :host { display: inline-block; }
    span { color: var(--color-text-muted); }
  `,
});
```

## Style Behavior

- `tokens.css` defines CSS custom properties; `var(...)` crosses Shadow DOM.
- `reset.css`, `shell.css`, `content.css` apply only to document/light DOM.
- Class selectors like `.data`, `.app-main`, `.error` do not cross Shadow DOM.
- Component-local styles live in ``css`...` `` inside `component()` options.
- If a Shadow component accepts children, use `<slot>` and style the frame in
  component styles.

If a page looks unstyled, you probably used global classes inside a Shadow DOM
component. Move markup into a page/layout or move CSS into component styles.
