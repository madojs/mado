# Mado · LLM pitfalls

> Типичные ошибки, которые AI-ассистенты (Copilot, Claude, ChatGPT, Cursor)
> делают при генерации Mado-кода. И как их исправлять.

Этот документ — для **двух аудиторий**:

1. **AI-агентов в IDE**, которые читают `AGENTS.md` / `.cursorrules` / `.github/copilot-instructions.md`. Здесь больше деталей по типичным граблям.
2. **Людей**, которые получили от AI код с этими ошибками и не понимают, что не так.

---

## Pitfall #1: `${signal()}` вместо `${() => signal()}`

**Симптом:** значение в шаблоне отображается, но не обновляется при изменении сигнала.

```ts
const count = signal(0);

// ❌ AI генерирует это часто
html`<div>Count: ${count() * 2}</div>`;
// → Отрисует "Count: 0", и больше никогда не обновится.
// count() прочитан один раз в момент создания TemplateResult.

// ✅ Правильно — функция-геттер
html`<div>Count: ${() => count() * 2}</div>`;
// → Mado создаст effect() на эту функцию, при изменении count перерисует.

// ✅ Тоже правильно — сам сигнал является функцией
html`<div>Count: ${count}</div>`;
```

**Правило:**

- Если в `${...}` есть **выражение** (что-то делает с сигналом) — оборачивай в `() => ...`.
- Если в `${...}` **сам сигнал** — можно как есть.

Это работает для **child-биндингов** (текст внутри тегов) и для **value-атрибутов** (`@click`, `.prop`, `?attr`, обычных атрибутов).

---

## Pitfall #2: `<button disabled=${loading}>` вместо `?disabled`

**Симптом:** кнопка не disable'ится либо disable'ится всегда.

```ts
const loading = signal(false);

// ❌ Это setAttribute("disabled", "false") — DOM воспринимает это как disabled
html`<button disabled=${loading()}>Save</button>`;

// ✅ Правильно — boolean-биндинг (toggle attribute)
html`<button ?disabled=${loading}>Save</button>`;
```

**Правило для атрибутов:**
| Префикс | Что делает | Когда использовать |
|---|---|---|
| `attr=` | `setAttribute("attr", value)` | строки, числа, URL |
| `.attr=` | `el.attr = value` (DOM property) | объекты, массивы, `.value` инпута |
| `?attr=` | toggle attribute (по truthy) | `disabled`, `hidden`, `checked`, etc |
| `@evt=` | `addEventListener("evt", fn)` | обработчики событий |

---

## Pitfall #3: useState / useEffect-стиль

**Симптом:** AI генерирует React-подобный код, который не работает в Mado.

```ts
// ❌ AI часто это пишет
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => { console.log(count); }, [count]);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// ✅ Правильно в Mado
import { component, signal, effect, html } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);
  effect(() => console.log(count()));  // auto-subscribe, dispose автоматически
  return () => html`
    <button @click=${() => count.update(c => c + 1)}>${count}</button>
  `;
});
```

**Ключевые отличия:**

- Нет хуков, нет правил хуков.
- `signal()` можно создавать где угодно — в setup, в effect, в обработчике.
- `effect()` сам видит, что прочитал — не нужен dependency array.
- Компонент = `component("x-name", setup)`, не JSX-функция.

---

## Pitfall #4: `useEffect(() => { ... return cleanup })`

**Симптом:** AI пишет `return cleanup` в effect, ожидая что это сработает как в React.

```ts
// ❌ AI пытается это написать
component("x-timer", () => {
  effect(() => {
    const id = setInterval(..., 1000);
    return () => clearInterval(id);  // НЕ сработает, нужно через onDispose
  });
  return () => html`...`;
});

// ✅ Правильно: cleanup через ctx.onDispose
component("x-timer", (ctx) => {
  const id = setInterval(..., 1000);
  ctx.onDispose(() => clearInterval(id));
  return () => html`...`;
});
```

**Примечание:** `effect()` действительно поддерживает `return cleanup`, но это **per-run cleanup** (выполнится при следующем прогоне effect'а), а не при unmount. Для unmount-cleanup используй `ctx.onDispose`.

---

## Pitfall #5: Компонент как класс или с декоратором

**Симптом:** AI генерирует Lit-style или vanilla WebComponent класс.

```ts
// ❌ AI: "сделаем как в Lit"
import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement('x-counter')
class XCounter extends LitElement { ... }

// ❌ AI: "сделаем как vanilla"
class XCounter extends HTMLElement {
  connectedCallback() { ... }
}
customElements.define("x-counter", XCounter);

// ✅ Правильно: функциональный component()
import { component, html, signal } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);
  return () => html`<button @click=${() => count.update(n => n + 1)}>${count}</button>`;
});
```

---

## Pitfall #6: импорт без расширения `.js`

**Симптом:** TypeScript компилирует, но в браузере 404.

```ts
// ❌ AI часто опускает расширение
import { foo } from "./bar";
import { Home } from "./pages/home";

// ✅ Правильно: ES-модули в браузере требуют расширение
import { foo } from "./bar.js";
import { Home } from "./pages/home.js";
```

**Почему `.js`, а не `.ts`:** в браузер уходит уже скомпилированный JS. TypeScript достаточно умён, чтобы понимать `./bar.js` как ссылку на `./bar.ts` при компиляции.

---

## Pitfall #7: списки через `.map()` без ключей

**Симптом:** при перестановке элементов теряется фокус инпутов / ломаются CSS-анимации / тормозит на больших списках.

```ts
// ❌ Работает, но не keyed: пересоздаёт DOM на каждое изменение
html`<ul>
  ${() => items().map((t) => html`<li>${t.name}</li>`)}
</ul>`;

// ✅ Правильно: each() с key-функцией
import { each } from "@madojs/mado";
html`<ul>
  ${() =>
    each(
      items(),
      (t) => t.id,
      (t) => html`<li>${t.name}</li>`,
    )}
</ul>`;
```

**Правило:** всегда используй `each()` для списков из массивов с устойчивыми ID. `.map()` оставь только для статичных списков.

---

## Pitfall #8: `signal.value` или `count.get()`

**Симптом:** AI пишет API в стиле Vue или Solid pre-v1.

```ts
const count = signal(0);

// ❌ Нет такого API
count.value;
count.value = 5;
count.get();

// ✅ Правильно
count(); // прочитать
count.set(5); // записать
count.update((n) => n + 1);
count.peek(); // прочитать без подписки
```

---

## Pitfall #9: `provide(ApiCtx, value)` без host

**Симптом:** TypeError при попытке поднять контекст.

```ts
// ❌ AI забывает host
provide(ApiCtx, myApi);
inject(ApiCtx);

// ✅ Правильно: первый аргумент — host (текущий компонент)
component("x-app", ({ host }) => {
  provide(host, ApiCtx, myApi);
  return () => html`...`;
});

component("x-child", ({ host }) => {
  const api = inject(host, ApiCtx); // signal<value>
  return () => html`...`;
});
```

---

## Pitfall #10: ожидание SSR

**Симптом:** AI пишет код, предполагая, что страница пререндерится на сервере.

```ts
// ❌ Это работает только в браузере
const userId = location.pathname.split("/")[2];

// ❌ Это тоже только в браузере
if (typeof window !== "undefined") { ... }  // в Mado window есть ВСЕГДА
```

Mado **не делает SSR с гидрацией**. На сервере код не выполняется — есть только `bake` (статический prerender на build) и edge-prerender. Оба заменяют user code на linkedom-окружение, но это **только** для генерации HTML с meta-тегами, не для выполнения логики страницы.

Это значит:

- ✅ `window`, `document`, `location`, `fetch` — доступны без проверок.
- ❌ Не пиши код, который пытается «универсально работать на сервере и клиенте».
- ❌ Не используй паттерны Next.js (`getServerSideProps`, `headers()`).

---

## Pitfall #11: `useForm()` с zod/yup-резолвером

**Симптом:** AI хочет подключить валидатор.

```ts
// ❌ Нет такого API
const f = useForm({ resolver: zodResolver(schema) });

// ✅ Правильно: HTML5-валидация атрибутами
const f = useForm({
  email: { required: true, type: "email" },
  age: { required: true, type: "number", min: 18 },
});

// ✅ Или кастомная функция, если HTML5 не хватает
const f = useForm(
  { name: { required: true } },
  {
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.name && /\d/.test(values.name as string)) {
        errors.name = "Имя не должно содержать цифры";
      }
      return Object.keys(errors).length ? errors : null;
    },
  },
);
```

---

## Pitfall #12: Tailwind / styled-components / CSS Modules

**Симптом:** AI предлагает стандартные React-CSS-решения.

Mado использует **Shadow DOM + `css\`\`` + CSS variables**. Глобальные UI-фреймворки (Tailwind, Bootstrap-через-классы) **работают только в light DOM** (`shadow: false`):

```ts
// Light-DOM page/screen компонент, Tailwind-классы работают
component(
  "x-admin-page",
  () => () => html`
    <section class="bg-white shadow-lg rounded-lg p-4">...</section>
  `,
  { shadow: false },
);

// Shadow-DOM компонент (default) — Tailwind НЕ работает.
// Используй css`` или ::part() для внешней стилизации.
component("x-button", () => () => html`<button><slot></slot></button>`, {
  styles: css`
    button {
      background: var(--button-bg, #2563eb);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 6px;
    }
  `,
});
```

**Темы и кастомизация — через CSS variables**, а не классы.

---

## Pitfall #13: `import * as Mado from "@madojs/mado"`

**Симптом:** AI хочет namespace-import.

Это работает, но дублирует имена и плохо tree-shake'ится. Лучше named-import:

```ts
// ✅ Канонично
import { signal, html, component, css, page } from "@madojs/mado";

// ⚠️ Работает, но избыточно
import * as Mado from "@madojs/mado";
Mado.signal(0);
```

---

## Pitfall #14: попытка добавить runtime-зависимость

**Симптом:** AI предлагает `npm install lodash` / `npm install date-fns` / etc.

Mado — **zero runtime deps** by design. Если AI хочет добавить:

- **lodash** → используй нативный JS (`Object.entries`, `Array.prototype`, `structuredClone`);
- **date-fns** → используй `Intl.DateTimeFormat` и `Intl.RelativeTimeFormat`;
- **uuid** → `crypto.randomUUID()`;
- **axios** → нативный `fetch` + `jsonFetcher()` из Mado;
- **classnames** → нативный template literal или объект-mапа.

Любая runtime-зависимость — **нарушение принципа фреймворка**. Если без неё реально нельзя — добавляй в пользовательский проект, не в Mado core.

---

## Pitfall #15: inline `<style>` внутри page-шаблонов

**Симптом:** AI кладёт большой `<style>` прямо в `html\`\`` страницы.

```ts
// ❌ Работает, но плохо масштабируется и усложняет cleanup
page({
  view: () => html`
    <style>
      .panel {
        padding: 1rem;
      }
    </style>
    <section class="panel">...</section>
  `,
});

// ✅ Правильно: стили компонента через css``
component(
  "x-admin-panel",
  () => () => html` <section class="panel">...</section> `,
  {
    styles: css`
      .panel {
        padding: 1rem;
      }
    `,
  },
);
```

Для backend-admin route/page экранов часто уместен `shadow: false`, чтобы
глобальные layout/form/table utilities работали как обычная админка. Но если
layout использует `<slot>` для проекции страницы внутрь shell, оставь layout в
Shadow DOM и держи shell-стили в `styles: css\`\``.

---

## Pitfall #16: Shadow DOM links без `data-link`

**Симптом:** ссылка внутри Web Component перезагружает страницу или не
prefetch'ится.

```ts
// ❌ Обычная ссылка: браузер сделает full reload
html`<a href="/tickets/42">Open</a>`;

// ✅ SPA-навигация: router() перехватит click даже через Shadow DOM
html`<a href="/tickets/42" data-link>Open</a>`;
```

Mado ищет ссылку через `event.composedPath()`, поэтому `data-link` работает
и внутри Shadow DOM. Hover-prefetch использует тот же путь; `data-no-prefetch`
отключает prefetch для конкретной ссылки.

---

## Pitfall #17: `resource()` вне component setup

**Симптом:** AI создаёт resource в module scope, чтобы "переиспользовать"
данные между страницами.

```ts
// ❌ Нет lifecycle cleanup, будет dev-warning
const tickets = resource(
  () => "tickets",
  () => api.listTickets(),
);

component("x-tickets", () => {
  return () => html`${() => tickets.data()?.length ?? 0}`;
});

// ✅ Создавай resource внутри setup компонента
component("x-tickets", () => {
  const tickets = resource(
    () => "tickets",
    () => api.listTickets(),
  );
  return () => html`${() => tickets.data()?.length ?? 0}`;
});
```

Так подписки на invalidation, abort controller и effects будут очищены при
disconnect компонента.

---

## Pitfall #18: предположение, что nested templates не требуют cleanup

**Симптом:** AI собирает route outlet или conditional UI из вложенных
`TemplateResult`, а потом старые элементы продолжают жить ниже новой страницы.

```ts
const view = signal(html`<x-home></x-home>`);

// ✅ Нормальный паттерн: вложенный TemplateResult можно возвращать из child-binding
html`${view}`;
```

Начиная с v0.3 это закреплено регрессиями: при замене child-binding Mado
dispose'ит вложенные template instances/effects рекурсивно. Если видишь
накопление страниц в `#app`, это баг ядра, а не "нужно руками чистить DOM".

---

## Pitfall #19: global CSS utilities внутри Shadow DOM

**Симптом:** страница выглядит “без стилей”: `.page-head`, `.btn`,
`.form-grid`, `.metric-grid` не применяются.

```ts
// ❌ .page-head объявлен глобально, но x-dashboard по умолчанию Shadow DOM
component(
  "x-dashboard",
  () => () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
);

// ✅ Page/layout/admin-shell компоненты часто должны быть Light DOM
component(
  "x-dashboard",
  () => () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
  { shadow: false },
);
```

Правило: Shadow DOM — для leaf widgets и slot-based layouts, Light DOM — для
route/page/admin-screen компонентов, которые намеренно используют общие
layout/form/table utilities. Не забывай: `<slot>` проецирует детей только в
Shadow DOM; при `shadow: false` это обычный элемент.
Подробнее: [`09-shadow-vs-light-dom.md`](./09-shadow-vs-light-dom.md).

---

## Pitfall #20: `host.getAttribute()` в render = не реактивно

**Симптом:** внешний вид компонента не обновляется при изменении атрибута родителем.

```ts
// ❌ host.getAttribute() в render-функции читается один раз, но
// render перезапускается только при изменении его собственных сигналов.
// Внешние изменения атрибута не триггерят перерисовку.
component("x-badge", ({ host }) => () => {
  const variant = host.getAttribute("variant") ?? "default";
  return html`<span class=${variant}>...</span>`;
});

// ✅ Правильно: ctx.attr() — возвращает реактивный Signal<string>
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default");
  return () => html`<span class=${() => `badge-${variant()}`}>...</span>`;
});
```

**Правило:** никогда не читайте `host.getAttribute()` или `host.hasAttribute()` внутри
render-функции для значений, которые могут измениться снаружи. Используйте `ctx.attr()` —
он возвращает Signal, который автоматически обновляется через `attributeChangedCallback`.

---

## Pitfall #21: Shadow DOM `<button>` не сабмитит формы

**Симптом:** клик по `<x-button type="submit">` внутри `<form>` ничего не делает.

`<button>` внутри Shadow DOM не участвует в алгоритме form-owner для
`<form>` в Light DOM — это ограничение спецификации, не баг Mado.

```ts
// ❌ Внутренняя <button type="submit"> не может триггерить родительскую <form>
component("x-button", ({ host }) => {
  return () => html`<button type="submit"><slot></slot></button>`;
});

// ✅ Мост через requestSubmit()
component("x-button", ({ host, attr }) => {
  const disabled = attr("disabled");

  const handleClick = () => {
    const typeAttr = host.getAttribute("type");
    if (typeAttr === "button" || typeAttr === "reset") return;
    const form = host.closest("form");
    if (form && !host.hasAttribute("disabled")) form.requestSubmit();
  };

  return () => html`
    <button ?disabled=${() => disabled() !== ""} @click=${handleClick}>
      <slot></slot>
    </button>
  `;
});
```

Подробнее: [`17-shadow-dom-forms.md`](./17-shadow-dom-forms.md).

---

## Pitfall #22: `useForm()` с Shadow DOM кастомными input

**Симптом:** `form.onInput` получает `undefined` для name/value от `<x-input>`.

Когда Shadow DOM input диспатчит `input` событие, браузер ретаргетирует
`e.target` с внутреннего `<input>` на host `<x-input>`. Но `<x-input>`
(HTMLElement) не имеет `.name` или `.value` — поэтому `useForm` ничего не получает.

```ts
// ❌ Нет proxy-свойств — useForm тихо игнорирует события
component("x-input", ({ host, attr }) => {
  const name = attr("name", "");
  return () => html`<input name=${name} />`;
});

// ✅ Добавить proxy-свойства для совместимости с useForm
component("x-input", ({ host, attr }) => {
  const name = attr("name", "");

  Object.defineProperty(host, "name", {
    get: () => host.getAttribute("name") ?? "",
    configurable: true,
  });
  Object.defineProperty(host, "value", {
    get: () => host.shadowRoot?.querySelector("input")?.value ?? "",
    configurable: true,
  });

  return () => html`<input name=${name} />`;
});
```

Подробнее: [`17-shadow-dom-forms.md`](./17-shadow-dom-forms.md).

---

## Cheat-sheet для AI

| Если хочешь сделать…                  | Правильно в Mado                            |
| ------------------------------------- | ------------------------------------------- |
| `useState(0)`                         | `signal(0)`                                 |
| `useEffect(() => {...}, [a, b])`      | `effect(() => {...})` (auto-deps)           |
| `useEffect(() => return cleanup, [])` | `ctx.onDispose(cleanup)`                    |
| `useMemo(() => x, [a])`               | `computed(() => x)`                         |
| `useCallback(fn, [])`                 | обычная функция                             |
| `useContext(Ctx)`                     | `inject(host, Ctx)`                         |
| `useQuery(['key'], fn)`               | `resource(() => 'key', fn)`                 |
| `useMutation(fn)`                     | `mutation(fn, { invalidates: [...] })`      |
| `useRouter().push('/')`               | `navigate('/')`                             |
| `useRouter().query.q`                 | `queryParam('q')`                           |
| `<input value={v} onChange={...}>`    | `<input .value=${v} @input=${...}>`         |
| `{items.map(x => ...)}`               | `${() => each(items, x => x.id, x => ...)}` |
| `useForm({ resolver: zodResolver })`  | `useForm({...}, { validate: (v) => ... })`  |
| `class extends HTMLElement`           | `component('x-name', setup)`                |
| `@customElement('x')`                 | `component('x-name', setup)`                |
| `host.getAttribute('x')` в render     | `ctx.attr('x', default)` (реактивно)        |
| `jsonFetcher()` с авторизацией        | `apiFetcher()` (прикрепляет Bearer токен)   |

Если что-то не подходит из этого списка — открой `src/` и **прочитай 500 строк**. Это серьёзно. Mado специально маленький, чтобы быть читаемым.
