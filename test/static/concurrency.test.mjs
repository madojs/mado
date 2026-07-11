import test from "node:test";
import assert from "node:assert/strict";

const { mapConcurrent } = await import("../../scripts/static/browser.mjs");

test("static capture scheduler is bounded and preserves route order", async () => {
  let active = 0;
  let peak = 0;
  const result = await mapConcurrent(
    Array.from({ length: 25 }, (_, index) => index),
    4,
    async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value % 3));
      active--;
      return value * 2;
    },
  );
  assert.equal(peak, 4);
  assert.deepEqual(result, Array.from({ length: 25 }, (_, index) => index * 2));
});
