// Tests for lazy computed.
//
// computed used to be implemented through an effect that writes into a signal:
// the function recomputed eagerly on every dependency change, even when nobody
// read the result. That caused:
//   1. CPU work without a reader;
//   2. surprising behavior for developers expecting Solid/Angular-like semantics.
//
// Target behavior (dirty-flag lazy computed):
//   - computed(fn) does not call fn before the first read;
//   - repeated reads without dependency changes do not call fn again;
//   - dependency changes mark the computed as dirty, but do not recompute;
//   - the next read calls fn once and refreshes the cache;
//   - several set() calls between reads still produce one recomputation.
//
// These tests were failing before the v0.3/v0.4 hardening work.

import test from "node:test";
import assert from "node:assert/strict";

const { signal, computed, effect, flushSync } = await import(
  "../dist/src/signal.js"
);

test("computed without a reader does not call fn", () => {
  let calls = 0;
  const a = signal(1);
  const c = computed(() => {
    calls++;
    return a() * 2;
  });
  // Wait a microtask; an eager version would have computed by now.
  flushSync();
  assert.equal(
    calls,
    0,
    "computed without readers should not recompute (lazy)",
  );
  // void keeps the variable intentionally referenced.
  void c;
});

test("computed: repeated reads without changes call fn once", () => {
  let calls = 0;
  const a = signal(10);
  const c = computed(() => {
    calls++;
    return a() + 1;
  });
  assert.equal(c(), 11);
  assert.equal(c(), 11);
  assert.equal(c(), 11);
  assert.equal(calls, 1, "fn should be called only once");
});

test("computed: dependency changes recompute only on next read", () => {
  let calls = 0;
  const a = signal(1);
  const c = computed(() => {
    calls++;
    return a() * 100;
  });

  // First read.
  assert.equal(c(), 100);
  assert.equal(calls, 1);

  // Change the dependency: this should not recompute immediately.
  a.set(2);
  assert.equal(calls, 1, "after set() without a read, fn should not run");

  // Read: recompute.
  assert.equal(c(), 200);
  assert.equal(calls, 2);
});

test("computed: several sets between reads produce one recomputation", () => {
  let calls = 0;
  const a = signal(1);
  const c = computed(() => {
    calls++;
    return a();
  });

  assert.equal(c(), 1);
  assert.equal(calls, 1);

  a.set(2);
  a.set(3);
  a.set(4);
  assert.equal(calls, 1, "before reading, there should be no recomputation");

  assert.equal(c(), 4);
  assert.equal(calls, 2, "reading should produce exactly one recomputation");
});

test("computed inside effect recomputes when a dependency changes", () => {
  let calls = 0;
  let seen = -1;
  const a = signal(1);
  const c = computed(() => {
    calls++;
    return a() * 10;
  });

  effect(() => {
    seen = c();
  });

  assert.equal(seen, 10);
  assert.equal(calls, 1);

  a.set(5);
  flushSync();
  assert.equal(seen, 50, "effect should react to changes through computed");
});

test("computed: computed to computed chain", () => {
  let aCalls = 0;
  let bCalls = 0;
  const x = signal(1);
  const a = computed(() => {
    aCalls++;
    return x() + 1;
  });
  const b = computed(() => {
    bCalls++;
    return a() * 10;
  });

  assert.equal(b(), 20);
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 1);

  x.set(2);
  // Neither a nor b should recompute without a read.
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 1);

  assert.equal(b(), 30);
  assert.equal(aCalls, 2);
  assert.equal(bCalls, 2);
});
