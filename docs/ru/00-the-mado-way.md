# The Mado Way

> Один правильный путь. Жёсткие контракты. Никакой магии.

Mado — фреймворк для команд, которые строят админки, внутренние инструменты и
business SPA. Такие приложения должны быть простыми в разработке и скучными в
поддержке. Поэтому Mado задает соглашения, а не предлагает пять равноценных
стилей.

## Принципы

1. **Один способ.** Если пишешь что-то необычное, сначала проверь, нет ли уже
   каноничного helper/API.
2. **Явность над магией.** Никаких file-system scanners, implicit globals и
   скрытых side effects.
3. **Платформа сначала.** Web Components, History API, `<form>`, `fetch` и
   Shadow DOM остаются платформой, а не прячутся под тяжелыми абстракциями.
4. **Strict types.** `tsc --strict --noUncheckedIndexedAccess` всегда.
5. **No runtime dependencies.** Dev/build tooling допустим, runtime Mado
   остается нативным.

## Структура проекта

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

Default starter — каноничная версия этой формы. Если docs и старые примеры
расходятся, starter и `docs/10-app-architecture.md` главнее.

## Один компонент = один файл

```ts
import { component, css, html } from "@madojs/mado";

component("x-user-card", () => () => html`<div class="card"><slot></slot></div>`, {
  styles: css`
    .card { padding: 1rem; }
  `,
});
```

Import component file registers the element. Import it where the tag is used.

## Один способ описать страницу

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
belongs in `*.service.ts`.

## Чего НЕ делаем

- Не используем JSX/Vue/Svelte syntax.
- Не пишем custom elements без дефиса.
- Не читаем signals через `.value`; signal читается как function.
- Не используем `innerHTML` напрямую.
- Не добавляем runtime packages без обсуждения.

Когда сомневаешься, лучше записать один честный рецепт в docs, чем добавить
новый primitive в core.
