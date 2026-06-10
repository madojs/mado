# Типові помилки LLM у Mado-коді

Цей файл потрібен, щоб AI-агенти не писали React/Vue-код у Mado-проєкті.

## JSX

```ts
// Ні
const view = <button>{count}</button>;

// Так
const view = html`<button>${count}</button>`;
```

## `useState` / `useEffect`

```ts
// Ні
const [count, setCount] = useState(0);

// Так
const count = signal(0);
count.set(1);
```

## Signal `.value`

```ts
// Ні
count.value;

// Так
count();
```

## Нереактивний child binding

```ts
// Нереактивно: count() прочитано один раз
html`<div>${count() * 2}</div>`;

// Реактивно
html`<div>${() => count() * 2}</div>`;
```

## Boolean attributes

```ts
// Ні
html`<button disabled=${loading}>Save</button>`;

// Так
html`<button ?disabled=${loading}>Save</button>`;
```

## Списки

```ts
// Не для динамічного reorder
items().map((item) => html`<li>${item.name}</li>`);

// Так
each(
  items(),
  (item) => item.id,
  (item) => html`<li>${item.name}</li>`,
);
```

## Imports

У browser ESM локальні imports мають мати `.js`:

```ts
import "./components/x-card.js";
```

## `resource()` lifecycle

`resource()` створюй у component setup або всередині явного lifecycle, щоб cleanup
відбувався автоматично.

## Component names

Custom element name має містити дефіс. `x-*` — демо-конвенція; production може
мати `app-*`, `crm-*`, `ticket-*`, `admin-*`.

## `host.getAttribute()` у render — не реактивно

```ts
// Ні: читається один раз, не оновлюється
component("x-badge", ({ host }) => () => {
  const variant = host.getAttribute("variant") ?? "default";
  return html`<span class=${variant}>...</span>`;
});

// Так: ctx.attr() — реактивний Signal
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default");
  return () => html`<span class=${() => `badge-${variant()}`}>...</span>`;
});
```

## Shadow DOM кнопка і submit форми

`<button type="submit">` всередині Shadow DOM не тригерить submit `<form>` у Light DOM.
Використовуйте `form.requestSubmit()` у click handler.

```ts
const handleClick = () => {
  const form = host.closest("form");
  if (form && !host.hasAttribute("disabled")) form.requestSubmit();
};
```

## `useForm()` + Shadow DOM input

Після ретаргетингу `e.target` — це `<x-input>`, у якого немає `.name`/`.value`.
Додайте proxy-властивості на host:

```ts
Object.defineProperty(host, "name", {
  get: () => host.getAttribute("name") ?? "",
});
Object.defineProperty(host, "value", {
  get: () => host.shadowRoot?.querySelector("input")?.value ?? "",
});
```

Детальніше: [`17-shadow-dom-forms.md`](./17-shadow-dom-forms.md).

## Шпаргалка

| React/інше                  | Mado                         |
| --------------------------- | ---------------------------- |
| `useState(0)`               | `signal(0)`                  |
| `useEffect(() => {...})`    | `effect(() => {...})`        |
| `useMemo(() => x)`          | `computed(() => x)`          |
| `useQuery(['key'], fn)`     | `resource(() => 'key', fn)`  |
| `useRouter().push('/')`     | `navigate('/')`              |
| `class extends HTMLElement` | `component('x-name', setup)` |
| `host.getAttribute('x')`    | `ctx.attr('x', default)`     |
| `jsonFetcher()` з auth      | `apiFetcher()`               |
| `setInterval` в page view   | `onDispose(() => clearInterval(id))` |
| читання сигналу в async init | `untracked(() => cursor())`  |
