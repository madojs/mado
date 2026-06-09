// Cycle detection for effects.
//
// A self-updating effect should not be able to keep the scheduler in an
// infinite loop forever. Mado cuts the loop, reports a clear diagnostic, and
// leaves the process alive.

import test from "node:test";
import assert from "node:assert/strict";

const { signal, effect, flushSync } = await import("../dist/src/signal.js");

test("effect: self-triggering cycle is detected and stopped", () => {
  const n = signal(0);
  let runs = 0;
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.join(" "));

  try {
    effect(() => {
      runs++;
      n.set(n() + 1);
    });

    flushSync();
  } finally {
    console.error = origError;
  }

  assert.ok(runs > 1, "the effect should have retried before being cut off");
  assert.ok(runs <= 101, "cycle detection should stop runaway effect reruns");
  assert.ok(
    errors.some((msg) => msg.includes("effect cycle detected")),
    "cycle detection should emit a clear diagnostic",
  );
});
