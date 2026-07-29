# Migrating from 0.13 to 0.14

0.14 deliberately removes the component renderer-function layer. Components,
pages and standalone templates now share one rule: reactivity belongs to
dynamic template slots.

## Components return a template directly

Change:

```ts
component("x-counter", () => {
  const count = signal(0);
  return () => html`<button>${count()}</button>`;
});
```

to:

```ts
component("x-counter", () => {
  const count = signal(0);
  return html`<button>${count}</button>`;
});
```

Setup still runs once per connection lifetime. A signal or computed passed as
a slot updates that slot. Use a getter when the slot contains an expression or
changes structure:

```ts
return html`
  <p>${() => `${first()} ${last()}`}</p>
  ${() => expanded() ? html`<section>Details</section>` : null}
`;
```

A direct read such as `${count()}` is an intentional one-time snapshot. 0.14
does not keep the old return-function overload; returning it fails with a
targeted diagnostic.

## Pages no longer leak tracking into the router

`page.load()`, `page.view()` and layout views run outside the router's reactive
tracker. Do not wrap a page view in `untracked()`. Put changing values in
template slots just as you do in a component.

`PageContext.onDispose` is always present. Optional calls such as
`onDispose?.(cleanup)` can become `onDispose(cleanup)`.

The mounted page now owns that lifecycle through its `TemplateResult`.
Navigation, commit rollback and `unmount(root)` release page effects,
resources and callbacks. `routes.dispose()` remains the explicit teardown for
the router's document-level listeners in tests and hot replacement.

## Refs have a commit contract

`ref()` callbacks now run after the complete binding pass and after insertion
into the live container. They can safely inspect final attributes, descendants
and `isConnected`.

An unchanged callback remains attached across unrelated slot updates and keyed
reorders. Cleanup runs once when its element leaves the owned template. Remove
microtask delays that existed only to wait for a ref's element to mount.

Template setup, update and ref commit are transactional: a failed operation
cleans up its partial listeners/effects and restores the last successful
render where possible.

## Standalone resources have explicit ownership

Resources created in a page or component lifecycle still dispose
automatically. A standalone resource must now expose its ownership explicitly:

```ts
const users = resource(() => "/api/users", jsonFetcher<User[]>());

// When the integration that owns it shuts down:
users.dispose();
```

`dispose()` is idempotent, stops key/invalidation tracking and releases the
current request. Calling `refresh()` or `mutate()` afterwards fails loudly.

## Tooling

`mado new component` emits the direct-template contract. Bundle sizes remain
visible through `npm run size`, but size is a report rather than a release
failure while the pre-v1 architecture is still settling.

The design rationale and exact invariants live in
[ADR 0002 — Slot-owned reactivity and template commit](../architecture/adr/0002-slot-owned-reactivity.md).
