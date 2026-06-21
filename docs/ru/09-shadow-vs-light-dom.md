# Shadow DOM vs Light DOM

Компоненты Mado по умолчанию используют Shadow DOM. Это хороший дефолт для
самодостаточных виджетов, но не для каждого компонента в приложении.

## Правило большого пальца

В Mado layout — это тоже component. Если файл описывает видимую переиспользуемую
часть UI-дерева — app shell, sidebar, modal, table, page section — по умолчанию
делайте Web Component через `component()`.

Обычные функции оставляйте для маленьких inline helpers:

```ts
const money = (value: number) => html`<span>${formatMoney(value)}</span>`;
```

Не стоит делать app shell функцией в публичных примерах. Это работает, но
прячет browser model вместо того, чтобы её объяснять.

Используйте **Shadow DOM** для leaf-виджетов:

- кнопки, бейджи, карточки, метрики;
- модалы, тосты, маленькие визуальные компоненты;
- embed-виджеты, которые не должны наследовать CSS приложения случайно;
- компоненты, стили которых принадлежат самому компоненту.

Используйте **Light DOM** (`{ shadow: false }`) для структуры приложения,
которая хочет разделять глобальные CSS-утилиты:

- route/page компоненты;
- admin-экраны с плотными таблицами/формами;
- data-heavy экраны с таблицами и формами;
- компоненты, которые намеренно используют глобальные layout/form/table утилиты;
- места, где children должны оставаться обычным document DOM.

Используйте **Shadow DOM** для slot-based layouts:

- app shells с `<slot>`;
- sidebar/content wrappers;
- reusable layout frames, которые владеют своим grid/header/sidebar CSS.

`<slot>` — это feature Shadow DOM. В компоненте с `shadow: false` тег `<slot>`
становится обычным DOM-элементом и не переносит children в это место layout.

## Подвох

Глобальный CSS не пересекает границу Shadow DOM.

```ts
// global.ts
export const globalStyles = css`
  .page-head {
    display: flex;
    justify-content: space-between;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }
`;

// ❌ .page-head и .metric-grid НЕ применятся внутри shadowRoot x-dashboard
component(
  "x-dashboard",
  () => () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
);
```

Решение — сделать route/page компонент Light DOM:

```ts
component(
  "x-dashboard",
  () => () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
  {
    shadow: false,
    styles: css`
      x-dashboard {
        display: block;
      }
      x-dashboard .panel {
        padding: 1rem;
      }
    `,
  },
);
```

Теперь глобальные утилиты и локальные scoped-стили работают вместе.

## Как ведут себя стили

- `styles: css\`\`` в Shadow DOM адоптируется в shadowRoot компонента.
- `styles: css\`\``с`shadow: false` скоупится по имени тега и адоптируется
  глобально.
- CSS custom properties (`--accent`, `--bg` и т.д.) пересекают границу Shadow DOM.
- Селекторы по классу (`.btn`, `.form-grid`, `.page-head`) **не** пересекают
  границу Shadow DOM.
- Slotted-children сохраняют свои стили из документа; shadow-компонент может
  таргетировать их только через `::slotted(...)`.
- `<slot>` проецирует children только в Shadow DOM. В компоненте с `shadow: false`
  это обычный `<slot>` элемент, который не перемещает children в своё место.

## Рекомендованная архитектура

```ts
// root и pages: Light DOM
component("x-app", setup, { shadow: false });
component("x-users-page", setup, { shadow: false });

// slot-based layout: Shadow DOM по умолчанию, потому что владеет shell grid
component("x-app-layout", setup);

// leaf widgets: Shadow DOM по умолчанию
component("x-status-badge", setup);
component("x-stat-card", setup);
component("x-toast-stack", setup);
```

Это даёт backend-admin экранам предсказуемый CSS, сохраняя инкапсуляцию
для переиспользуемых виджетов и slot-based shells.

Import model специально browser-native:

```ts
import "./components/app-layout.js";

render(html`<x-app-layout>${router.view}</x-app-layout>`, app);
```

Import регистрирует custom element через `customElements.define()`. Template
создаёт `<x-app-layout>` элемент. Дальше браузер сам связывает тег с классом
компонента. Тут нет React-style component value, который передаётся как функция.

Если layout не нуждается в slot projection и должен стилизоваться полностью
глобальным CSS, `shadow: false` — хороший выбор. Если он содержит `<slot>`,
оставьте Shadow DOM и поместите стили shell в этот компонент.

## Маршрутизация и ссылки

`data-link` работает внутри Shadow DOM. Роутер использует `event.composedPath()`,
поэтому перехват кликов и hover-prefetch видят ссылки из open shadow roots.

```ts
component(
  "x-card-link",
  () => () => html` <a href="/app/accounts" data-link>Accounts</a> `,
);
```

Ссылка может быть внутри Shadow DOM — навигация всё равно остаётся SPA.

## Где импортировать компоненты

Custom elements становятся глобальными после регистрации, но регистрация всё
равно остаётся явным JavaScript import.

```ts
// main.ts: global app frame
import "./components/app-shell.js";

// pages/tickets.ts: component, которым владеет эта page
import "../components/ticket-list.js";
```

Браузер **не** скачивает `ticket-list.js` только потому, что увидел
`<ticket-list>`. Файл должен быть где-то импортирован. После import он вызывает
`customElements.define(...)`, и тег становится известен текущему document.

Не стоит bulk-import всех компонентов в `main.ts` «на всякий случай». Для маленьких
demo это работает, но прячет ownership и ломает lazy route loading. Лучше:

- global app shell/providers импортировать в `main.ts`;
- components, которыми владеет одна page, импортировать в этой page;
- shared components feature-а импортировать в feature entry page;
- truly global leaf components импортировать в `main.ts` только если они реально
  используются везде.

## Урок из больших примеров

Большие примеры используют это разделение намеренно:

- `x-app` и CRM route pages — Light DOM;
- `x-app-layout` остаётся в Shadow DOM, потому что владеет slot-based
  sidebar/content shell;
- table/form/page утилиты живут в `styles/global.ts`;
- leaf-компоненты типа `x-stat-card`, `x-status-badge`, `x-modal` и
  `x-toast-stack` остаются в Shadow DOM.

Если страница внезапно выглядит без стилей, проверьте — не используете ли вы
глобальные классы внутри Shadow DOM компонента. Обычно проблема именно в этом.
