# Shadow DOM + Forms

Using `useForm()` with custom input components that have Shadow DOM requires
awareness of two browser-level behaviours:

1. **Event retargeting** — events that bubble from Shadow DOM have their
   `e.target` retargeted to the host element. `useForm().onInput` reads
   `e.target.name` and `e.target.value`, but an `<x-input>` host element
   doesn't natively have these properties.

2. **Form association** — a `<button type="submit">` inside a Shadow Root is
   NOT part of the form-owner algorithm for `<form>` in Light DOM. Clicking it
   does not trigger form submit.

Both are spec-level limitations, not Mado bugs. But the framework provides
patterns that make them painless.

## Pattern: Proxy Properties on Input Components

When wrapping `<input>` in a Shadow DOM component, expose `name` and `value`
as DOM properties on the host so that `useForm().onInput` works after event
retargeting:

```ts
import { component, css, html } from "@madojs/mado";

component("x-input", ({ host, attr }) => {
  const name = attr("name", "");
  const type = attr("type", "text");
  const value = attr("value", "");

  // Proxy properties for useForm() compatibility.
  // After Shadow DOM retargets e.target from <input> to <x-input>,
  // useForm reads e.target.name / e.target.value — these getters bridge the gap.
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

  return () => html` <input name=${name} type=${type} .value=${value} /> `;
});
```

The `input` event from the inner `<input>` has `composed: true` by default, so
it will bubble through the shadow boundary. After retargeting, `e.target` is
`<x-input>`, but now it has `.name` and `.value` getters → `useForm` works.

## Pattern: Form Submit from Shadow DOM Buttons

A `<button type="submit">` inside Shadow DOM cannot trigger `<form>` submit in
Light DOM. Bridge it with `requestSubmit()`:

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

`host.closest("form")` works because the host element itself lives in Light DOM
(only its internals are shadowed). `requestSubmit()` triggers validation and the
`submit` event exactly as if the user had clicked a native submit button inside
the form.

## Pattern: Reactive Attributes with ctx.attr()

Since v0.7, `ctx.attr(name, defaultValue?)` returns a `Signal<string>` that
updates automatically when the attribute changes on the host. No more
`MutationObserver` boilerplate:

```ts
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default"); // Signal<string>

  return () =>
    html`<span class=${() => `badge badge-${variant()}`}>
      <slot></slot>
    </span>`;
});
```

The parent can use `?disabled=${() => !form.isValid()}` (boolean attribute) or
`.variant=${"danger"}` — the component re-renders reactively either way.

## Complete Form Example

```ts
import { page, html, useForm, navigate } from "@madojs/mado";
import "../components/x-input.js";
import "../components/x-button.js";

export default page({
  title: "Login",
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
          label="Password"
          required
          @input=${form.onInput}
          @blur=${form.onBlur}
        ></x-input>

        <x-button type="submit" ?disabled=${() => !form.isValid()}>
          Sign in
        </x-button>
      </form>
    `;
  },
});
```

## When to Use Light DOM Instead

If your input component is just a styled wrapper without encapsulation needs,
`shadow: false` avoids both retargeting and form-association issues entirely:

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

With Light DOM, the native `<input>` is part of the document tree, events
are not retargeted, and form submission works natively. The tradeoff: styles
are not encapsulated (you must scope them yourself).

## Summary

| Concern                  | Shadow DOM Solution                     | Light DOM Alternative         |
| ------------------------ | --------------------------------------- | ----------------------------- |
| `useForm` + custom input | Proxy `name`/`value` on host            | Use native `<input>` in slot  |
| Form submit              | `form.requestSubmit()` in click handler | Native button works           |
| Reactive attributes      | `ctx.attr()` → auto-signal              | `ctx.attr()` works everywhere |
| Style encapsulation      | Yes (automatic)                         | Manual `@scope` or BEM        |
