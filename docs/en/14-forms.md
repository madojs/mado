# Forms

> `useForm()` is a thin signal-wrapper around native HTML5 form
> validation. For 90% of cases you write a `<form>`, attach
> `onInput / onBlur / onSubmit` and you are done.

```ts
import { html, page, useForm } from "@madojs/mado";

export default page({
  view: () => {
    const f = useForm({
      email: { required: true, type: "email" },
      age:   { required: true, type: "number", min: 18 },
    });

    return html`
      <form @submit=${f.onSubmit(async (v) => { await api.save(v); f.reset(); })}>
        <input name="email" type="email"
               @input=${f.onInput} @blur=${f.onBlur} />
        ${() =>
          f.touched().email && f.errors().email
            ? html`<small class="err">${f.errors().email}</small>`
            : null}

        <input name="age" type="number" @input=${f.onInput} />

        <button ?disabled=${() => !f.isValid() || f.submitting()}>Save</button>
      </form>
    `;
  },
});
```

## The signals it exposes

| Reader                 | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| `f.values()`           | object of current field values                                   |
| `f.errors()`           | object of `field → error string` (validators + HTML5 constraints)|
| `f.touched()`          | object of `field → boolean` (true after first blur)              |
| `f.isValid()`          | true when `errors()` is empty                                    |
| `f.submitting()`       | true while the `onSubmit` async handler is running               |
| `f.dirty()`            | true when any value differs from initial                         |

Writers: `f.setValue(name, v)`, `f.setError(name, msg)`,
`f.reset(values?)`, `f.touch(name)`.

## Schema

The schema mirrors HTML5 constraints, with a few extras:

```ts
useForm({
  email:    { required: true, type: "email" },
  age:      { type: "number", min: 18, max: 120 },
  name:     { required: true, minLength: 2, maxLength: 80 },
  website:  { type: "url" },
  tags:     { custom: (v) => Array.isArray(v) && v.length > 0 ? null : "pick at least one" },
});
```

For cross-field or async rules use `validate`:

```ts
useForm({
  password: { required: true, minLength: 8 },
  confirm:  { required: true },
}, {
  validate: (values) =>
    values.password !== values.confirm
      ? { confirm: "passwords do not match" }
      : null,
});
```

Return `null` (everything is valid) or a partial `field → error`
object.

## Field arrays

```ts
const f = useForm({ tags: { custom: (v) => v.length > 0 ? null : "required" } });
const tags = f.fieldArray<string>("tags");

tags.append("rust");
tags.remove(0);
tags.move(0, 2);
tags.items();   // current array (signal)
```

## With `mutation()`

Forms compose with `mutation()` for typed write-paths:

```ts
import { mutation, navigate } from "@madojs/mado";

const save = mutation((u: User) => api.save(u), {
  invalidates: ["/api/users*"],
});

// inside view()
const f = useForm({ name: { required: true } });
return html`
  <form @submit=${f.onSubmit(async (v) => {
    await save.run(v);
    navigate("/users");
  })}>
    <input name="name" @input=${f.onInput} />
    <button ?disabled=${() => !f.isValid() || save.loading()}>Create</button>
    ${() => save.error() ? html`<p class="err">${save.error()!.message}</p>` : null}
  </form>
`;
```

`save.loading()` reflects the request; `f.submitting()` reflects the
`onSubmit` handler runtime. Usually only one of them is interesting.

## Shadow DOM inputs — when you need them

Most apps build forms from native `<input>` / `<select>` /
`<textarea>` directly inside the `<form>`. `useForm()` reads
`e.target.name` and `e.target.value` on the events, which works
out-of-the-box for native controls.

You only need a custom Web Component when the input has its own
shadow tree (a date picker, a tag editor, a rich text field, …). Two
browser-level facts make that path slightly different:

1. **Event retargeting** — events that bubble out of an open shadow
   root have their `target` retargeted to the host. `useForm()` reads
   `e.target.name` and `e.target.value` — the host element must
   expose both.
2. **Form association** — a `<button type="submit">` inside a shadow
   root is NOT part of the form-owner algorithm. Clicking it does
   not submit the surrounding `<form>`.

The two patterns below cover both. Reach for them **only** if a real
custom input forces you to. For everything else, see "Light-DOM
inputs" further down.

### Custom input — proxy `name` / `value`

```ts
import { component, html } from "@madojs/mado";

component("x-input", ({ host, attr }) => {
  const type = attr("type", "text");

  // After Shadow DOM retargets e.target from the inner <input> to
  // <x-input>, useForm reads e.target.name / e.target.value. These
  // getters bridge the gap.
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

  return () => html`<input type=${type} />`;
});
```

The inner `input` event already bubbles through the shadow boundary
(`composed: true` by default), so `<form @input=${f.onInput}>` keeps
working.

### Custom submit button — `requestSubmit()`

```ts
import { component, html } from "@madojs/mado";

component("x-button", ({ host, attr }) => {
  const disabled = attr("disabled");

  const onClick = () => {
    const t = host.getAttribute("type");
    if (t === "button" || t === "reset") return;
    if (host.hasAttribute("disabled")) return;
    host.closest("form")?.requestSubmit();
  };

  return () => html`
    <button ?disabled=${() => disabled() !== ""} @click=${onClick}>
      <slot></slot>
    </button>
  `;
});
```

`host.closest("form")` works because the host itself lives in the
light DOM. `requestSubmit()` triggers HTML5 validation and the
`submit` event exactly like a native click.

### Light-DOM input — the simpler alternative

If a custom element is just a styled wrapper around a native control
and does not need style encapsulation, use `{ shadow: false }`. The
native `<input>` is then part of the document; no retargeting, no
proxy properties, no submit bridge.

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

This is the only situation where `shadow: false` is the recommended
default — and even then a `page()` is usually a better fit if the
wrapper is layout-shaped rather than reusable.

## Summary

| Concern                    | Native form                          | Custom component with Shadow DOM         |
| -------------------------- | ------------------------------------ | ----------------------------------------- |
| `useForm` integration      | works out of the box                 | proxy `name` / `value` on the host        |
| Submit button              | `<button type="submit">` works       | `host.closest("form")?.requestSubmit()`   |
| Reactive attributes        | not needed                           | `ctx.attr(name)` returns a Signal         |
| Style encapsulation        | global CSS                           | Shadow DOM CSS via `css\`\``              |

## Further reading

- [10-pages-and-components.md](./10-pages-and-components.md) — when
  to reach for `component({ shadow: false })`.
- [13-data.md](./13-data.md) — `mutation()` for typed writes.
- [21-error-handling.md](./21-error-handling.md) — surfacing form
  errors from network failures.