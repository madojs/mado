// C5 — stale async field validation must not land on a shifted array index.
//
// fieldRuns (src/forms.ts) guards "last write wins" per STRING path. array()
// .remove()/.write() clears asyncErrors/touched by prefix but does NOT bump the
// in-flight generation for those paths. So a pending validateAsync for
// "items.2.title" still satisfies fieldRuns.get("items.2.title") === run after a
// remove(1) shifts what used to be index 2 down to index 1 — and writes its
// error onto "items.2.title", which now points at a different (or absent) row.
//
// See FABLE_REPORT.md finding #5 and MADO_V1_TRACKER.md C5.

import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);
globalThis.window = w;
globalThis.document = w.document;
globalThis.HTMLInputElement = w.HTMLInputElement ?? class {};
globalThis.HTMLSelectElement = w.HTMLSelectElement ?? class {};
globalThis.HTMLTextAreaElement = w.HTMLTextAreaElement ?? class {};

const { flushSync } = await import("../dist/src/signal.js");
const { useForm } = await import("../dist/src/forms.js");

/** A promise whose resolution we control from the test. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("array().remove() invalidates in-flight async validation for shifted paths", async () => {
  const gate = deferred();

  const f = useForm({
    items: { default: [] },
    "items.*.title": {
      // Only "bad" titles fail, and only after the gate opens — so the test
      // controls exactly when the stale result lands.
      validateAsync: async (value) => {
        await gate.promise;
        return value === "bad" ? "taken" : null;
      },
    },
  });

  const items = f.array("items");
  items.replace([{ title: "a" }, { title: "b" }, { title: "bad" }]);
  flushSync();

  // Begin validating the invalid row at index 2.
  const pending = f.validateField("items.2.title");

  // User removes index 1 → the old index 2 ("bad") shifts down to index 1.
  items.remove(1);
  flushSync();

  // Now let the stale validation for "items.2.title" finish.
  gate.resolve();
  await pending;
  flushSync();

  assert.equal(
    f.errors()["items.2.title"],
    undefined,
    "a stale async result for a removed/shifted path must not write an error",
  );
});
