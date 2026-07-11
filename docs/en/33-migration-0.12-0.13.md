# Migrating from 0.12 to 0.13

0.13 is the final planned pre-v1 breaking release. It narrows the root API and
makes lifecycle, forms, resources and router behaviour explicit.

## Forms

<!-- docs-lint:allow-legacy-mention -->

The 0.12 schema-shaped call:

```ts
useForm({ email: { required: true, type: "email" } });
```

becomes:

```ts
useForm({ initial: { email: "" } });
```

Move `required`, `type`, `min`, `max` and `pattern` to the native controls.
Replace `setValue` with `setField`. The separate field-array helper was removed;
use ordinary array values and `setField`. Custom/async validation now belongs
to `validate(values, { signal, form })` in the options object.

<!-- /docs-lint:allow-legacy-mention -->

## Removed root exports

`lazy`, `list`, `instantiate`, `isHtmlDirective`, `adopt`, `scopeStyles`,
`isPage` and `isLayoutGroup` are no longer root exports. Use dynamic route
imports, `each()`, `render()` and the documented high-level APIs instead.
Only the package root, `/vite` and `/devtools.js` are public subpaths.

## Behaviour changes

- `render()` returns an idempotent disposer; `unmount(container)` explicitly
  releases bindings, events, nested templates and child lifecycles.
- `page.load` is synchronous. Return a value or a `Resource`; returning a
  Promise throws a diagnostic error. Put async work in `resource()`.
- `resource().refresh()` returns `Promise<T>`. `staleTime: 0` deduplicates only
  an in-flight request and never reuses completed data.
- Cache identity includes the fetcher, and `invalidate()` reaches cached and
  uncached live resources.
- Persisted signals separate `dispose()` from explicit storage deletion.
- Context now uses the Web Components `context-request` protocol and cleans up
  subscriptions with the current lifecycle.
- Static capture blocks undeclared external requests and `mado build` writes
  the `out/` artifact consumed by `mado static`.

## Devtools and logging

Import `@madojs/mado/devtools.js` in development and use `Alt+Shift+M`.
`localStorage.madoDebug` is deprecated; use `mado:log-level` or the controller.
CLI automation should prefer `--log-format=json`.
