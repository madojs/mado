# Migrating from 0.16 to 0.17

Mado 0.17 makes `mutation()` follow the same ownership rule as the rest of the
reactive runtime: an instance created by a page or component belongs to that
lifecycle.

## Remove manual mutation cleanup

Code written for 0.16 may abort a page-owned mutation explicitly:

```ts
const save = mutation(api.save);
onDispose(save.reset);
```

In 0.17 the active lifecycle registers that cleanup automatically:

```ts
const save = mutation(api.save);
```

Leaving the page or removing the component synchronously aborts every supplied
signal, clears the mutation state and prevents late state updates or cache
invalidation. Pass the mutation fetcher's second `AbortSignal` argument to
`fetch()` so the pending promise can reject promptly; a fetcher that ignores it
remains fenced off but cannot settle until its own work finishes.

## `reset()` and `dispose()` have different ownership semantics

- `reset()` aborts pending runs and clears `loading`, `error` and `data`. The
  mutation remains reusable.
- `dispose()` performs the same cleanup, is idempotent and permanently releases
  the mutation. A later `run()` rejects with
  `[mado:mutation] mutation is disposed`; `reset()` after disposal is a no-op.

Call `dispose()` only from the owner of an intentionally standalone mutation.
Page and component code normally does not call either method for teardown.

## Shared mutations need an explicit longer-lived owner

A mutation created outside an active lifecycle is not tied to navigation. This
is useful for an application service that deliberately coordinates multiple
screens:

```ts
// commands.ts — application-owned, shared state
export const saveDraft = mutation(api.saveDraft);

// application shutdown / integration teardown
saveDraft.dispose();
```

Because its `loading`, `error` and `data` signals are shared too, do not move a
page mutation to module scope merely to avoid cancellation. Give every
standalone instance an owner that eventually calls `dispose()`.

## An aborted write has an unknown server outcome

An `AbortError` means Mado discarded a stale outcome. It does not prove that
the transport stopped or the server rolled the command back: the write may
already have committed. Recover by reading authoritative state or by repeating
the same idempotency key. Do not automatically create a new write command after
an ambiguous abort.

## Further reading

- [13-data.md](./13-data.md) — resources, mutations and invalidation.
- [21-error-handling.md](./21-error-handling.md) — handling `AbortError`.
- [10-pages-and-components.md](./10-pages-and-components.md) — ownership and
  teardown.
