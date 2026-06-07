// Unit tests for signal/computed/effect/batch.
// Run:  node --test test/
//
// No DOM: signal.ts works in plain Node.
//
// Before running: npm run build (tests import dist/).

import test from "node:test";
import assert from "node:assert/strict";

const {
  signal,
  computed,
  effect,
  batch,
  flushSync,
  untracked,
} = await import("../dist/src/signal.js");

test("signal: get/set/update/peek", () => {
  const s = signal(1);
  assert.equal(s(), 1);
  s.set(2);
  assert.equal(s(), 2);
  s.update((n) => n + 10);
  assert.equal(s.peek(), 12);
});

test("signal: Object.is avoids notifying subscribers for the same value", () => {
  const s = signal(1);
  let runs = 0;
  effect(() => {
    s();
    runs++;
  });
  flushSync();
  assert.equal(runs, 1);
  s.set(1); // same value
  flushSync();
  assert.equal(runs, 1);
  s.set(2);
  flushSync();
  assert.equal(runs, 2);
});

test("computed: recomputes when a dependency changes", () => {
  const a = signal(2);
  const b = signal(3);
  const sum = computed(() => a() + b());
  assert.equal(sum(), 5);
  a.set(10);
  flushSync();
  assert.equal(sum(), 13);
});

test("effect: cleanup runs before the next run and on dispose", () => {
  const s = signal(0);
  const log = [];
  const dispose = effect(() => {
    const v = s();
    log.push(`run:${v}`);
    return () => log.push(`cleanup:${v}`);
  });
  flushSync();
  s.set(1);
  flushSync();
  s.set(2);
  flushSync();
  dispose();
  assert.deepEqual(log, [
    "run:0",
    "cleanup:0",
    "run:1",
    "cleanup:1",
    "run:2",
    "cleanup:2",
  ]);
});

test("batch: several sets in one pass produce one run", () => {
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  effect(() => {
    a();
    b();
    runs++;
  });
  flushSync();
  assert.equal(runs, 1);

  batch(() => {
    a.set(1);
    b.set(1);
    a.set(2);
  });
  flushSync();
  assert.equal(runs, 2);
});

test("untracked: reads do not create a subscription", () => {
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  effect(() => {
    a();
    untracked(() => b());
    runs++;
  });
  flushSync();
  assert.equal(runs, 1);

  b.set(1);
  flushSync();
  assert.equal(runs, 1, "changing b should not trigger");

  a.set(1);
  flushSync();
  assert.equal(runs, 2);
});

test("dynamic deps: the dependency branch changes", () => {
  const flag = signal(true);
  const a = signal("A");
  const b = signal("B");
  let last = "";
  effect(() => {
    last = flag() ? a() : b();
  });
  flushSync();
  assert.equal(last, "A");

  // The flag switched: subscribe to b, not a.
  flag.set(false);
  flushSync();
  assert.equal(last, "B");

  // Changing a should no longer trigger.
  let runs = 0;
  effect(() => {
    flag() ? a() : b();
    runs++;
  });
  flushSync();
  runs = 0;
  a.set("A2");
  flushSync();
  assert.equal(runs, 0);
});
