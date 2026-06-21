// C4 — computed({ equals }) must keep batch() atomic.
//
// signal.set() runs sync subscribers immediately, even inside batch()
// (src/signal.ts). For a plain computed that is just a dirty flag, but the
// `equals` branch did an EAGER recompute() inside set(): in
// batch(() => { x.set(2); y.set(2) }) an equals-computed reading x and y
// recomputed on (new x, old y) — observing inconsistent intermediate state,
// possibly notifying with it, and running O(number of sets) times.
//
// The fix defers an observed equals-computed's recompute+compare to the end of
// the batch, so it runs once on fully-applied state. Crucially, the equals
// optimisation must still hold inside a batch (no notify when the value is
// unchanged).

import test from "node:test";
import assert from "node:assert/strict";

const { signal, computed, effect, batch, flushSync } = await import(
  "../../dist/src/signal.js"
);

test("equals-computed in a batch runs once and never sees mixed state", () => {
  const x = signal(1);
  const y = signal(1); // invariant maintained by every batch: x === y

  let runs = 0;
  let sawMixed = false;

  const sum = computed(
    () => {
      runs++;
      const xv = x();
      const yv = y();
      if (xv !== yv) sawMixed = true; // intermediate (new x, old y) state
      return xv + yv;
    },
    { equals: (a, b) => a === b },
  );

  // Keep the computed observed so the `equals` branch is exercised.
  const dispose = effect(() => {
    sum();
  });
  flushSync();

  runs = 0;
  sawMixed = false;

  batch(() => {
    x.set(2);
    y.set(2);
  });
  flushSync();

  assert.equal(
    sawMixed,
    false,
    "computed must never observe a half-applied batch (new x, old y)",
  );
  assert.equal(sum(), 4, "final value reflects the whole batch");
  assert.equal(runs, 1, `computed should recompute once per batch, got ${runs}`);

  dispose();
});

test("equals-computed still suppresses notifications inside a batch", () => {
  const x = signal(1);
  const parity = computed(() => x() % 2, { equals: (a, b) => a === b });

  let effectRuns = 0;
  const dispose = effect(() => {
    parity();
    effectRuns++;
  });
  flushSync();

  effectRuns = 0;

  // 1 → 3: parity 1 → 1, unchanged → effect must NOT run.
  batch(() => x.set(3));
  flushSync();
  assert.equal(
    effectRuns,
    0,
    "equals must suppress the effect when the value is unchanged, even in a batch",
  );

  // 3 → 4: parity 1 → 0, changed → effect runs once.
  batch(() => x.set(4));
  flushSync();
  assert.equal(effectRuns, 1, "effect runs once when the value actually changes");

  dispose();
});
