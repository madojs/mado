# Shadow DOM vs Light DOM

Mado components используют Shadow DOM по умолчанию. Это хороший default для
самодостаточных виджетов, но app zones и страницы обычно должны оставаться
простыми light DOM templates.

## Правило

Используйте route layouts для app zones:

```ts
export default page({
  view: ({ child }) => html`<main class="app-main">${child}</main>`,
});
```

Такие файлы живут в `src/layouts/` и подключаются в `src/app.routes.ts` через
`layout()`. Они стилизуются обычным CSS из `src/shared/styles/shell.css`.

Используйте page files для screens:

```ts
export default page({
  view: () => html`<section><h1>Users</h1></section>`,
});
```

Page-level tables, forms, prose and simple states стилизуются из
`src/shared/styles/content.css`.

Используйте Shadow DOM components для leaf widgets:

- buttons, badges, cards, metrics;
- spinners, modals, toasts;
- widgets, которые должны владеть своим CSS.

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

## Как ведут себя стили

- `tokens.css` задает CSS custom properties; `var(...)` проходит через Shadow
  DOM.
- `reset.css`, `shell.css`, `content.css` применяются только к document/light
  DOM.
- Class selectors вроде `.data`, `.app-main`, `.error` не проходят внутрь
  Shadow DOM.
- Component-local styles пишутся в ``css`...` `` внутри `component()` options.
- Если Shadow component принимает children, используйте `<slot>` и стилизуйте
  frame внутри component styles.

Если page выглядит без стилей, почти всегда вы использовали global classes
внутри Shadow DOM component. Вынесите markup в page/layout или перенесите CSS в
component styles.
