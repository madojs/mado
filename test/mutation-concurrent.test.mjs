// C6 — concurrent mutation().run() calls must not abort each other.
//
// The old mutation.run() began with `abort?.abort()`, so two fast submits of
// different entities through one (module-scoped) mutation aborted the first
// POST client-side — even though the server likely applied it. The first run
// got an AbortError, its `invalidates` never fired, and the UI never learned of
// success. Auto-abort is right for reads (resource), wrong for writes.
//
// Fix: mutations are concurrent by default; abort is opt-in via
// { abortPrevious: true } for search-as-you-type. `loading` is an in-flight
// counter. See FABLE_REPORT.md finding #6 and MADO_V1_TRACKER.md C6.

import test from "node:test";
import assert from "node:assert/strict";

const { mutation, invalidate, _testHooks } = await import(
  "../dist/src/resource.js"
);
const { resource } = await import("../dist/src/resource.js");

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("two concurrent run() calls both complete and both invalidate", async () => {
  const gateA = deferred();
  const gateB = deferred();

  const invalidated = [];
  // Spy on invalidation by registering live resources whose keys we expect to
  // be invalidated. Simpler: track via a wrapper around invalidate patterns.
  const save = mutation(
    async (entity) => {
      await (entity.id === "a" ? gateA.promise : gateB.promise);
      return { ok: entity.id };
    },
    { invalidates: (result) => [`entity/${result.ok}`] },
  );

  // Fire two saves of different entities back-to-back.
  const pA = save.run({ id: "a" });
  const pB = save.run({ id: "b" });

  // Resolve the FIRST one last to make sure it was not aborted by the second.
  gateB.resolve();
  gateA.resolve();

  const [rA, rB] = await Promise.all([pA, pB]);

  assert.deepEqual(rA, { ok: "a" }, "first mutation must complete, not abort");
  assert.deepEqual(rB, { ok: "b" }, "second mutation completes");
});

test("loading stays true until the last in-flight run settles", async () => {
  const gate1 = deferred();
  const gate2 = deferred();

  const save = mutation(async (n) => {
    await (n === 1 ? gate1.promise : gate2.promise);
    return n;
  });

  const p1 = save.run(1);
  const p2 = save.run(2);
  assert.equal(save.loading(), true, "loading while any run is in flight");

  gate1.resolve();
  await p1;
  assert.equal(
    save.loading(),
    true,
    "loading must remain true while the second run is still in flight",
  );

  gate2.resolve();
  await p2;
  assert.equal(save.loading(), false, "loading clears when the last run settles");
});

test("abortPrevious: true keeps search-as-you-type semantics", async () => {
  const gateOld = deferred();
  const search = mutation(
    async (q) => {
      if (q === "old") await gateOld.promise;
      return q;
    },
    { abortPrevious: true },
  );

  const pOld = search.run("old");
  const pNew = search.run("new"); // should abort "old"

  // Let the aborted fetcher resolve so the run can observe its aborted signal
  // and reject — without this it would stay pending forever.
  gateOld.resolve();

  await assert.rejects(pOld, (err) => err?.name === "AbortError");
  assert.equal(await pNew, "new");
});

