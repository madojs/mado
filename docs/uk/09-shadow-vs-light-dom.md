# Shadow DOM vs Light DOM

Mado використовує Shadow DOM за замовчуванням. Це хороший default для
самодостатніх widgets, але не для кожного компонента в app.

## Практичне правило

У Mado layout — це теж component. Якщо файл описує видиму reusable частину
UI-дерева — app shell, sidebar, modal, table, page section — за замовчуванням
робіть Web Component через `component()`.

Звичайні функції залишайте для маленьких inline helpers:

```ts
const money = (value: number) => html`<span>${formatMoney(value)}</span>`;
```

Не варто робити app shell функцією в public examples. Це працює, але ховає
browser model замість того, щоб її пояснювати.

Використовуйте **Shadow DOM** для leaf widgets:

- buttons, badges, cards, metrics;
- modals, toasts, small visual components;
- embedded widgets, які не мають випадково успадковувати app CSS;
- components, чиї styles належать самому component.

Використовуйте **Light DOM** (`{ shadow: false }`) для app structure, якій
потрібні global CSS utilities:

- route/page components;
- admin screens з dense table/form layouts;
- data-heavy screens з tables and forms;
- місця, де children мають залишатися normal document DOM.

Використовуйте **Shadow DOM** для slot-based layouts:

- app shells, які render `<slot>`;
- sidebar/content wrappers;
- reusable layout frames, які володіють своїм grid/header/sidebar CSS.

`<slot>` — це feature Shadow DOM. У component з `shadow: false` тег `<slot>` є
звичайним DOM element і не переносить children у це місце layout.

## Як працює import

```ts
import "./components/app-layout.js";

render(html`<x-app-layout>${router.view}</x-app-layout>`, app);
```

Import реєструє custom element через `customElements.define()`. Template створює
`<x-app-layout>` element. Далі browser сам з'єднує tag з component class. Це не
React-style component value, який передається як function.

## Routing and links

`data-link` працює всередині Shadow DOM, бо router використовує
`event.composedPath()`.

```ts
component("x-card-link", () => () => html`
  <a href="/app/accounts" data-link>Accounts</a>
`);
```

Link може бути в Shadow DOM; navigation все одно залишається SPA.

## Де імпортувати компоненти

Custom elements стають global після registration, але registration все одно є
явним JavaScript import.

```ts
// main.ts: global app frame
import "./components/app-shell.js";

// pages/tickets.ts: component, яким володіє ця page
import "../components/ticket-list.js";
```

Browser **не** завантажує `ticket-list.js` лише тому, що побачив
`<ticket-list>`. File має бути imported десь першим. Після import він викликає
`customElements.define(...)`, і tag стає відомим у поточному document.

Не робіть bulk-import усіх components у `main.ts` "just in case". Це працює в
tiny demos, але ховає ownership і ламає lazy route loading. Краще:

- global app shell/providers імпортувати в `main.ts`;
- components, якими володіє одна page, імпортувати в цій page;
- shared feature components імпортувати у feature entry page;
- truly global leaf components імпортувати в `main.ts` лише якщо вони реально
  використовуються всюди.

## Showcase lesson

`examples/showcase` використовує цей split навмисно:

- `x-app` і CRM route pages — Light DOM;
- `x-app-layout` — Shadow DOM, бо він володіє slot-based sidebar/content shell;
- table/form/page utilities живуть у `styles/global.ts`;
- leaf components на кшталт `x-stat-card`, `x-status-badge`, `x-modal`,
  `x-toast-stack` залишають Shadow DOM.

Якщо page раптом виглядає unstyled, перевірте, чи не використовує вона global
classes всередині Shadow DOM component. Зазвичай проблема саме в цьому.
