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
| `errors()` | merged native, custom and external errors; `$form` is available for form-wide errors |
| `touched()` | fields that have blurred or participated in submit |
| `dirty()` | whether values differ from the current initial values |
| `isValid()` | whether the merged error map is empty |
| `submitting()` / `validating()` | current async activity |
| `setField(name, value)` | update one field programmatically |
| `setErrors(errors)` | replace normalized errors supplied by a server or another external authority |
| `validate(form?)` | run native and custom validation; returns `Promise<boolean>` |
| `reset(nextInitial?)` | abort validation, clear state and reset native controls |
| `onInput`, `onBlur`, `onSubmit(handler)` | DOM event handlers |

Custom validation receives `{ signal, form }`. Starting another validation or
calling `reset()` aborts the previous run. Treat abort as normal cancellation.

## Server errors

Normalize an application's error response at its API boundary, then pass the
field map to `setErrors()`. Mado deliberately does not infer a response shape:

```ts
const save = mutation((values: Profile) => api.saveProfile(values));
const form = useForm({ initial: { email: "", displayName: "" } });

const submit = form.onSubmit(async (values) => {
  try {
    await save.run(values);
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      form.setErrors(error.formErrors);
      return;
    }
    throw error;
  }
});
```

The map may contain keys from the form values and `$form` for an error about
the submitted value set as a whole. Each call replaces the previous external
map; pass `{}` to clear it. External errors override native or custom errors
with the same key while they are present, and `validate()` returns `false`
while any of them remain.

Changing a field through `setField()` or `onInput` clears that field's
external error. It also clears `$form`, because the form-wide error describes
the previous value snapshot, while errors for other unchanged fields remain.
`setErrors()` does not mark fields as touched, and `reset()` clears every error
source.

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
const save = mutation((values: Profile, signal) =>
  api.save(values, { signal }), {
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
