# Shadow DOM + форми

Використання `useForm()` з кастомними input-компонентами у Shadow DOM потребує
знання двох поведінок на рівні браузера:

1. **Ретаргетинг подій** — події, що спливають із Shadow DOM, мають
   `e.target`, перенаправлений на host-елемент. `useForm().onInput` читає
   `e.target.name` та `e.target.value`, але host-елемент `<x-input>`
   не має цих властивостей нативно.

2. **Асоціація з формою** — `<button type="submit">` всередині Shadow Root
   НЕ бере участі в алгоритмі form-owner для `<form>` у Light DOM. Клік по ній
   не тригерить submit форми.

Обидва обмеження — на рівні специфікації, не баги Mado. Але фреймворк надає
патерни, що роблять їх безболісними.

## Патерн: Proxy-властивості на input-компонентах

Обгортаючи `<input>` у Shadow DOM компонент, експонуйте `name` та `value`
як DOM-властивості на host, щоб `useForm().onInput` працював після ретаргетингу:

```ts
import { component, css, html } from "@madojs/mado";

component("x-input", ({ host, attr }) => {
  const name = attr("name", "");
  const type = attr("type", "text");
  const value = attr("value", "");

  // Proxy-властивості для сумісності з useForm().
  // Після ретаргетингу Shadow DOM e.target з <input> → <x-input>,
  // useForm читає e.target.name / e.target.value — ці геттери будують міст.
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

Подія `input` від внутрішнього `<input>` має `composed: true` за замовчуванням,
тому вона спливає через межу shadow. Після ретаргетингу `e.target` —
це `<x-input>`, але тепер у нього є геттери `.name` та `.value` → `useForm`
працює.

## Патерн: Submit форми з Shadow DOM кнопок

`<button type="submit">` всередині Shadow DOM не може тригерити submit `<form>`
у Light DOM. Міст через `requestSubmit()`:

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

`host.closest("form")` працює, бо сам host-елемент живе в Light DOM
(тільки його внутрішні елементи у тіні). `requestSubmit()` тригерить валідацію
та подію `submit` точно так, ніби користувач клікнув нативну submit-кнопку
всередині форми.

## Патерн: Реактивні атрибути через ctx.attr()

З версії 0.7 `ctx.attr(name, defaultValue?)` повертає `Signal<string>`,
який автоматично оновлюється при зміні атрибута на host. Ніякого
`MutationObserver` бойлерплейту:

```ts
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default"); // Signal<string>

  return () =>
    html`<span class=${() => `badge badge-${variant()}`}>
      <slot></slot>
    </span>`;
});
```

Батько може використовувати `?disabled=${() => !form.isValid()}` (boolean атрибут)
або `.variant=${"danger"}` — компонент перерендерюється реактивно в обох випадках.

## Повний приклад форми

```ts
import { page, html, useForm, navigate } from "@madojs/mado";
import "../components/x-input.js";
import "../components/x-button.js";

export default page({
  title: "Вхід",
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
          Увійти
        </x-button>
      </form>
    `;
  },
});
```

## Коли використовувати Light DOM

Якщо ваш input-компонент — це просто стилізована обгортка без потреби в
інкапсуляції, `shadow: false` уникає обох проблем (ретаргетинг та
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

З Light DOM нативний `<input>` — частина дерева документа, події не
ретаргетуються, і submit форми працює нативно. Компроміс: стилі не
інкапсульовані (треба скоупити самостійно).

## Підсумок

| Задача                      | Рішення Shadow DOM                     | Альтернатива Light DOM     |
| --------------------------- | -------------------------------------- | -------------------------- |
| `useForm` + кастомний input | Proxy `name`/`value` на host           | Нативний `<input>` у slot  |
| Submit форми                | `form.requestSubmit()` у click handler | Нативна кнопка працює      |
| Реактивні атрибути          | `ctx.attr()` → авто-сигнал             | `ctx.attr()` працює скрізь |
| Інкапсуляція стилів         | Так (автоматично)                      | Ручний `@scope` або BEM    |
