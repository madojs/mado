# Error handling

Mado has three practical error layers: route loading, data loading, and user
actions. Handle each layer where the user can recover.

## Route errors

Use a global `errorPage` in `routes()` for lazy import, `load()` and `view()`
failures.

```ts
export default routes(manifest, {
  errorPage: (err) => html`
    <main>
      <h1>Something went wrong</h1>
      <pre>${err.message}</pre>
      <a data-link href="/">Go home</a>
    </main>
  `,
});
```

For a specific page, `page({ errorView })` wins over the global route boundary.

```ts
export default page({
  load: () => resource(() => "/reports", jsonFetcher<Report[]>()),
  errorView: (err) => html`<x-report-error .error=${err}></x-report-error>`,
  view: ({ data }) => html`<x-report .data=${data}></x-report>`,
});
```

## Resource errors

`resource()` exposes `error()` and `loading()`. Render a retry path near the data.

```ts
const users = resource(() => "/api/users", jsonFetcher<User[]>());

html`
  ${() => users.error()
    ? html`<p role="alert">${users.error()!.message}</p>
         <button @click=${users.refresh}>Retry</button>`
    : null}
`;
```

Use `HttpError` or your own API error type when the UI needs status codes.

## Form and mutation errors

Validation errors belong in `useForm()`. Server errors from writes belong near
the submit button.

```ts
const form = useForm({
  initial: { email: "" },
  validate: (values, { signal }) => api.validateUser(values, { signal }),
});

const save = mutation((values) => api.post("/users", values), {
  invalidates: ["/api/users*"],
});

html`
  <form @submit=${form.onSubmit(async values => {
    await save.run(values);
  })}>
    <input name="email" type="email" required @input=${form.onInput} />
    <button ?disabled=${() => form.validating() || form.submitting()}>
      Save
    </button>
    ${() => save.error() ? html`<p role="alert">${save.error()!.message}</p>` : null}
  </form>
`;
```

## Component cleanup

If you subscribe to external browser APIs, clean them with `ctx.onDispose()`.
Signals, effects and resources created inside setup are lifecycle-aware.

```ts
component("x-online", (ctx) => {
  const online = signal(navigator.onLine);
  const onChange = () => online.set(navigator.onLine);
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  ctx.onDispose(() => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  });
  return () => html`${() => online() ? "Online" : "Offline"}`;
});
```

## Logging rule

Log once at the boundary that owns recovery. Avoid logging the same failure in
the API client, resource, page and component. The user should get one visible
message and developers should get one structured diagnostic. Runtime records
are visible in the devtools Timeline/Errors panel and as `mado:diagnostic`
events; CLI automation can select `--log-format=json`.
