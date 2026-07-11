# Forms

`useForm()` adds reactive state to the browser's form and constraint-validation
model. HTML remains the source of truth for `required`, `type`, `min`, `max`,
`minlength`, `maxlength` and `pattern`.

```ts
import { html, useForm } from "@madojs/mado";

const form = useForm({
  initial: { email: "", age: "" as number | "", newsletter: false },
  validate: async (values, { signal }) => {
    const available = await api.emailAvailable(values.email, { signal });
    return available ? null : { email: "Email is already registered" };
  },
});

html`
  <form @submit=${form.onSubmit(async (values, event) => {
    await api.save(values, new FormData(event.currentTarget as HTMLFormElement));
  })}>
    <label>
      Email
      <input name="email" type="email" required
        @input=${form.onInput} @blur=${form.onBlur} />
    </label>
    ${() => form.touched().email && form.errors().email
      ? html`<small role="alert">${form.errors().email}</small>`
      : null}

    <input name="age" type="number" min="18" max="120" @input=${form.onInput} />
    <label><input name="newsletter" type="checkbox" @input=${form.onInput} /> Subscribe</label>
    <button type="submit" ?disabled=${() => form.submitting() || form.validating()}>
      Save
    </button>
  </form>
`;
```

## API

`useForm<T>({ initial, validate? })` returns:

| Member | Meaning |
| --- | --- |
| `values()` | current typed values |
| `errors()` | native and custom errors by field; `$form` is available for form-wide errors |
| `touched()` | fields that have blurred or participated in submit |
| `dirty()` | whether values differ from the current initial values |
| `isValid()` | whether the merged error map is empty |
| `submitting()` / `validating()` | current async activity |
| `setField(name, value)` | update one field programmatically |
| `validate(form?)` | run native and custom validation; returns `Promise<boolean>` |
| `reset(nextInitial?)` | abort validation, clear state and reset native controls |
| `onInput`, `onBlur`, `onSubmit(handler)` | DOM event handlers |

Custom validation receives `{ signal, form }`. Starting another validation or
calling `reset()` aborts the previous run. Treat abort as normal cancellation.

## Native controls

- Checkbox groups produce an array when the initial field value is an array;
  a single checkbox produces a boolean.
- Radio groups produce the checked value.
- `<select multiple>` produces a string array.
- Number/range inputs produce a number, or `""` when empty.
- File inputs produce `File | null`, or `File[]` when `multiple` is present.
- The submit callback receives the native `SubmitEvent`; construct `FormData`
  from its form when the backend expects multipart or repeated fields.

Use a native `<button type="submit">`. A button inside another element's
Shadow DOM is not a submit control for the outer form and keyboard submission
will not discover it.

## Mutations

```ts
const save = mutation((values: Profile) => api.save(values), {
  invalidates: ["/api/profile"],
});
const form = useForm({ initial: { displayName: "" } });

html`<form @submit=${form.onSubmit((values) => save.run(values))}>
  <input name="displayName" required minlength="2" @input=${form.onInput} />
  <button type="submit" ?disabled=${() => form.submitting()}>Save</button>
</form>`;
```

Write failures belong to the mutation; field and cross-field validation belong
to the form. See the [0.12 → 0.13 migration guide](./33-migration-0.12-0.13.md)
for the removed schema and field-array APIs.
