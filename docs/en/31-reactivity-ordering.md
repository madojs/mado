# Reactivity ordering

> The small set of ordering guarantees Mado treats as public behaviour.

Mado's reactivity is synchronous for reads and scheduled for side effects. The
goal is boring, predictable UI updates rather than a large scheduling model.

## Signals

`signal(value)` returns a getter function. Calling `set(next)` changes the value
immediately unless `Object.is(previous, next)` is true.

```ts
const count = signal(0);
count.set(1);
count(); // 1, immediately
```

Computed values are marked before effects run, so an effect that reads a
computed value observes the current dependencies, not stale cached data.

## Effects

`effect(fn)` runs once immediately. Later dependency changes schedule one effect
run in a microtask. Tests can call `flushSync()` to drain that queue
synchronously.

If an effect returns a cleanup function, Mado runs that cleanup before the next
effect run and again when the effect disposer is called.

```ts
const stop = effect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
});

stop();
```

An initial effect failure is synchronous and leaves no subscription behind.
After the effect has completed at least once, a failed run is reported but
keeps the dependencies read by that run. A later valid value can therefore
wake and recover the effect instead of silently leaving a dead UI slot.

In components and pages, prefer `ctx.onDispose()` / page `onDispose()` for
unmount cleanup. Effect cleanup is per-run cleanup.

## Batch

`batch(fn)` groups signal writes into one subscriber pass. Effects do not run
until the outermost batch exits, including nested batches.

```ts
batch(() => {
  first.set("Ada");
  batch(() => last.set("Lovelace"));
});
// effects see only the final pair
```

Observed `computed({ equals })` values also preserve batch atomicity: they
recompute once after the outermost batch, on the fully applied state. They must
not observe a half-applied batch such as `(new x, old y)`.

## DOM updates

`render(result, container)` reuses the existing template instance when the next
render has the same template strings. For child bindings that return a nested
`html```, Mado applies the same rule: same template strings update in place,
different template strings rebuild that branch.

This means unrelated signal changes do not recreate an `<input>` inside a
stable nested template, so focus, DOM state and listeners survive.

Bindings keep independent state. Refs commit only after the complete template
is connected and remain stable across unrelated slot updates. If binding or
ref work throws, Mado cleans up the failed work and restores the last
successful tree; cleanup continues across all owned nodes even when one user
cleanup also throws.

Lists should use `each(items, key, renderItem)`. Keys define DOM identity.
Duplicate keys warn in development and fall back to a positional suffix so every
item still renders, but duplicate keys are a data bug.

## Component teardown

Custom elements may receive `disconnectedCallback()` followed by
`connectedCallback()` during a same-tick move. Mado defers component teardown to
a microtask and cancels it when the element is reconnected, so keyed reorders
preserve component state. A genuine removal still runs lifecycle cleanup on the
next microtask.

## Not guaranteed

Mado does not guarantee the exact number of internal scheduler microtasks, the
order of independent effects that do not share dependencies, generated bundle
shape, or internal module layout. Those are implementation details.

The invariant tests for this contract live in:

- `test/runtime/reactivity-ordering.test.mjs`
- `test/runtime/signal-batch-equals.test.mjs`
- `test/html/update-nested-reuse.test.mjs`
- `test/runtime/each-component-state.test.mjs`
- `test/html/template-commit.test.mjs`
