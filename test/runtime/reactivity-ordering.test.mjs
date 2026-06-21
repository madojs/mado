// B9 — public reactivity ordering invariants.
//
// These tests pin the behaviour documented in docs/en/19-reactivity-ordering.md.
// More focused historical regression tests live in:
//   - signal-batch-equals.test.mjs (computed({ equals }) + batch atomicity)
//   - update-nested-reuse.test.mjs (nested template update reuse)
//   - each-component-state.test.mjs (same-tick move teardown deferral)

import test from "node:test";
import assert from "node:assert/strict";

const { signal, effect, batch, flushSync } = await import(
  "../../dist/src/signal.js"
);

test("nested batch effects run once after the outermost batch", () => {
  const a = signal(0);
  const b = signal(0);
  const seen = [];

  const dispose = effect(() => {
    seen.push(`${a()}:${b()}`);
  });
  flushSync();

  seen.length = 0;

  batch(() => {
    a.set(1);
    batch(() => {
      b.set(1);
      a.set(2);
    });
    assert.deepEqual(
      seen,
      [],
      "effects must not flush while the outer batch is still open",
    );
    b.set(2);
  });

  flushSync();
  assert.deepEqual(seen, ["2:2"]);
  dispose();
});
