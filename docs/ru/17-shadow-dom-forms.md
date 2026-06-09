# Shadow DOM + формы

Использование `useForm()` с кастомными input-компонентами в Shadow DOM требует
знания двух поведений на уровне браузера:

1. **Ретаргетинг событий** — события, всплывающие из Shadow DOM, получают
   `e.target`, перенаправленный на host-элемент. `useForm().onInput` читает
   `e.target.name` и `e.target.value`, но host-элемент `<x-input>`
   не имеет этих свойств нативно.

2. **Ассоциация с формой** — `<button type="submit">` внутри Shadow Root
   НЕ участвует в алгоритме form-owner для `<form>` в Light DOM. Клик по ней
   не триггерит submit формы.

Оба ограничения — на уровне спецификации, не баги Mado. Но фреймворк предоставляет
паттерны, которые делают их безболезненными.

## Паттерн: Proxy-свойства на input-компонентах

Оборачивая `<input>` в Shadow DOM компонент, экспонируйте `name` и `value`
как DOM-свойства на host, чтобы `useForm().onInput` работал после ретаргетинга:

```ts
import { component, css, html } from "@madojs/mado";

component("x-input", ({ host, attr }) => {
  const name = attr("name", "");
  const type = attr("type", "text");
  const value = attr("value", "");

  // Proxy-свойства для совместимости с useForm().
  // После ретаргетинга Shadow DOM e.target из <input> → <x-input>,
  // useForm читает e.target.name / e.target.value — эти геттеры наводят мост.
  Object.defineProperty(host, "name", {
    get: () => host.getAttribute("name") ?? "",
    configurable: true,
  });
  Object.defineProperty(host, "value", {
    get: () => host.shadowRoot?.querySelector("input")?.value ?? "",
    set: (v: string) => {
      const input = host.shadowRoot?.querySelector("input");
      if (input) input.value = v;
    },
    configurable: true,
  });

  return () => html`<input name=${name} type=${type} .value=${value} />`;
});
```

Событие `input` от внутреннего `<input>` имеет `composed: true` по умолчанию,
поэтому оно всплывает через границу shadow. После ретаргетинга `e.target` —
это `<x-input>`, но теперь у него есть геттеры `.name` и `.value` → `useForm`
работает.

## Паттерн: Submit формы из Shadow DOM кнопок

`<button type="submit">` внутри Shadow DOM не может триггерить submit `<form>`
в Light DOM. Мост через `requestSubmit()`:

```ts
import { component, css, html } from "@madojs/mado";

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

`host.closest("form")` работает, потому что сам host-элемент живёт в Light DOM
(только его внутренности в тени). `requestSubmit()` триггерит валидацию и
событие `submit` точно так, как если бы пользователь кликнул нативную submit-кнопку
внутри формы.

## Паттерн: Реактивные атрибуты через ctx.attr()

С версии 0.7 `ctx.attr(name, defaultValue?)` возвращает `Signal<string>`,
который автоматически обновляется при изменении атрибута на host. Никакого
`MutationObserver` бойлерплейта:

```ts
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default"); // Signal<string>

  return () =>
    html`<span class=${() => `badge badge-${variant()}`}>
      <slot></slot>
    </span>`;
});
```

Родитель может использовать `?disabled=${() => !form.isValid()}` (boolean атрибут)
или `.variant=${"danger"}` — компонент перерендеривается реактивно в любом случае.

## Полный пример формы

```ts
import { page, html, useForm, navigate } from "@madojs/mado";
import "../components/x-input.js";
import "../components/x-button.js";

export default page({
  title: "Вход",
  view: () => {
    const form = useForm({
      email: { required: true, type: "email" },
      password: { required: true, minLength: 6 },
    });

    const handleLogin = async (values) => {
      await api("/auth/login", { method: "POST", json: values });
      navigate("/admin");
    };

    return html`
      <form @submit=${form.onSubmit(handleLogin)}>
        <x-input
          name="email"
          type="email"
          label="Email"
          required
          @input=${form.onInput}
          @blur=${form.onBlur}
        ></x-input>
        ${() =>
          form.errors().email
            ? html`<small class="err">${form.errors().email}</small>`
            : null}

        <x-input
          name="password"
          type="password"
          label="Пароль"
          required
          @input=${form.onInput}
          @blur=${form.onBlur}
        ></x-input>

        <x-button type="submit" ?disabled=${() => !form.isValid()}>
          Войти
        </x-button>
      </form>
    `;
  },
});
```

## Когда использовать Light DOM

Если ваш input-компонент — это просто стилизованная обёртка без нужды в
инкапсуляции, `shadow: false` избегает обеих проблем (ретаргетинг и
form-association):

```ts
component(
  "x-field",
  ({ attr }) => {
    const label = attr("label", "");
    return () => html`
      <label>
        <span>${label}</span>
        <slot></slot>
      </label>
    `;
  },
  { shadow: false },
);
```

С Light DOM нативный `<input>` — часть дерева документа, события не
ретаргетируются, и submit формы работает нативно. Компромисс: стили не
инкапсулированы (нужно скоупить самостоятельно).

## Итого

| Задача                      | Решение Shadow DOM                     | Альтернатива Light DOM      |
| --------------------------- | -------------------------------------- | --------------------------- |
| `useForm` + кастомный input | Proxy `name`/`value` на host           | Нативный `<input>` в slot   |
| Submit формы                | `form.requestSubmit()` в click handler | Нативная кнопка работает    |
| Реактивные атрибуты         | `ctx.attr()` → авто-сигнал             | `ctx.attr()` работает везде |
| Инкапсуляция стилей         | Да (автоматически)                     | Ручной `@scope` или BEM     |
