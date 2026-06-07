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
count.value

// Так
count()
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
each(items(), (item) => item.id, (item) => html`<li>${item.name}</li>`);
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
