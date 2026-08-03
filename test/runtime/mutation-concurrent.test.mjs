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
// counter.

import test from "node:test";
import assert from "node:assert/strict";

const { mutation, resource } = await import("../../dist/src/resource.js");
const { createLifecycle, runInLifecycle } = await import("../../dist/src/lifecycle.js");
const { installDevtoolsHook } = await import("../../dist/src/devtools-hook.js");

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("two concurrent run() calls both complete and both invalidate", async () => {
  const gateA = deferred();
  const gateB = deferred();
  const lifecycle = createLifecycle();
  let callsA = 0;
  let callsB = 0;

  try {
    const entityA = runInLifecycle(lifecycle, () =>
      resource(
        () => "entity/a",
        async (key) => {
          callsA++;
          return key;
        },
        { staleTime: 60_000 },
      ),
    );
    const entityB = runInLifecycle(lifecycle, () =>
      resource(
        () => "entity/b",
        async (key) => {
          callsB++;
          return key;
        },
        { staleTime: 60_000 },
      ),
    );
    await wait(0);
    assert.equal(callsA, 1);
    assert.equal(callsB, 1);

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
    await wait(0);

    assert.deepEqual(rA, { ok: "a" }, "first mutation must complete, not abort");
    assert.deepEqual(rB, { ok: "b" }, "second mutation completes");
    assert.equal(callsA, 2, "entity/a resource should refetch after invalidation");
    assert.equal(callsB, 2, "entity/b resource should refetch after invalidation");
    assert.equal(entityA.data(), "entity/a");
    assert.equal(entityB.data(), "entity/b");
  } finally {
    lifecycle.dispose();
  }
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

test("reset isolates later runs from promises started before reset", async () => {
  const oldGate = deferred();
  const newGate = deferred();
  const save = mutation(async (name) => {
    await (name === "old" ? oldGate.promise : newGate.promise);
    return name;
  });

  const oldRun = save.run("old");
  save.reset();
  const newRun = save.run("new");
  oldGate.resolve();
  await assert.rejects(oldRun, (err) => err?.name === "AbortError");
  assert.equal(save.loading(), true, "old settlement must not clear new loading state");
  newGate.resolve();
  assert.equal(await newRun, "new");
  assert.equal(save.loading(), false);
  assert.equal(save.data(), "new");
});

test("the complete invalidation phase is best-effort after success", async () => {
  let throwWhileIterating = true;
  const reports = [];
  const originalError = console.error;
  const invalidates = new Proxy([], {
    get(target, property, receiver) {
      if (property === Symbol.iterator && throwWhileIterating) {
        return () => {
          throw new Error("broken invalidation iterator");
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const save = mutation(async (value) => value, { invalidates });

  try {
    console.error = (...args) => reports.push(args);
    assert.equal(await save.run("first"), "first");
    assert.equal(save.data(), "first");
    assert.equal(save.error(), null);
    assert.equal(save.loading(), false);

    throwWhileIterating = false;
    assert.equal(await save.run("second"), "second");
    assert.equal(save.loading(), false, "the second run must settle back to idle");
  } finally {
    console.error = originalError;
  }

  assert.equal(reports.length, 1);
  assert.match(String(reports[0]?.[0]), /mutation-invalidates/);
});

test("disposal from an invalidation diagnostic still wins over success", async () => {
  const originalError = console.error;
  const brokenPatterns = new Proxy([], {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        return () => {
          throw new Error("broken invalidation iterator");
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const save = mutation(async () => "committed", {
    invalidates: brokenPatterns,
  });
  const uninstall = installDevtoolsHook({
    version: 1,
    emit(event) {
      if (
        event.kind === "diagnostic:error" &&
        event.data?.code === "mutation-invalidates"
      ) {
        save.dispose();
      }
    },
  });

  try {
    console.error = () => {};
    await assert.rejects(save.run(undefined), (error) =>
      error?.name === "AbortError"
    );
  } finally {
    console.error = originalError;
    uninstall();
  }

  assert.equal(save.loading(), false);
  assert.equal(save.error(), null);
  assert.equal(save.data(), undefined);
});

test("lifecycle disposal aborts a mutation and suppresses late state and invalidation", async () => {
  const gate = deferred();
  const lifecycle = createLifecycle();
  let invalidations = 0;
  let capturedSignal;

  const targetLifecycle = createLifecycle();
  const target = runInLifecycle(targetLifecycle, () =>
    resource(
      () => "lifecycle/target",
      async (key) => {
        invalidations++;
        return key;
      },
      { staleTime: 60_000 },
    ),
  );
  await wait(0);
  assert.equal(invalidations, 1);

  const save = runInLifecycle(lifecycle, () =>
    mutation(
      async (_value, signal) => {
        capturedSignal = signal;
        await gate.promise;
        return "late result";
      },
      { invalidates: ["lifecycle/*"] },
    ),
  );

  const pending = save.run("value");
  assert.equal(save.loading(), true);
  assert.equal(capturedSignal?.aborted, false);

  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(capturedSignal?.aborted, true);
  assert.equal(save.loading(), false);
  assert.equal(save.error(), null);
  assert.equal(save.data(), undefined);

  gate.resolve();
  await assert.rejects(pending, (error) => error?.name === "AbortError");
  await wait(0);
  assert.equal(invalidations, 1, "a disposed mutation must not invalidate");
  assert.equal(target.data(), "lifecycle/target");
  await assert.rejects(save.run("again"), {
    message: "[mado:mutation] mutation is disposed",
  });

  targetLifecycle.dispose();
});

test("module-scoped mutations stay detached when run inside another lifecycle", async () => {
  const gate = deferred();
  const targetLifecycle = createLifecycle();
  let invalidations = 0;
  const target = runInLifecycle(targetLifecycle, () =>
    resource(
      () => "detached/target",
      async (key) => {
        invalidations++;
        return key;
      },
      { staleTime: 60_000 },
    ),
  );
  await wait(0);

  let capturedSignal;
  const shared = mutation(
    async (value, signal) => {
      capturedSignal = signal;
      await gate.promise;
      return value * 2;
    },
    { invalidates: ["detached/*"] },
  );
  const unrelatedLifecycle = createLifecycle();
  const pending = runInLifecycle(unrelatedLifecycle, () => shared.run(4));

  unrelatedLifecycle.dispose();
  assert.equal(capturedSignal?.aborted, false);
  gate.resolve();
  assert.equal(await pending, 8);
  await wait(0);
  assert.equal(invalidations, 2, "the detached run still invalidates normally");
  assert.equal(target.data(), "detached/target");

  shared.reset();
  assert.equal(await shared.run(5), 10);
  shared.dispose();
  shared.dispose();
  assert.equal(shared.loading(), false);
  assert.equal(shared.error(), null);
  assert.equal(shared.data(), undefined);
  targetLifecycle.dispose();
});

test("dispose aborts every concurrent run and is terminal", async () => {
  const gates = [deferred(), deferred()];
  const signals = [];
  const save = mutation(async (index, signal) => {
    signals[index] = signal;
    await gates[index].promise;
    return index;
  });

  const first = save.run(0);
  const second = save.run(1);
  assert.equal(save.loading(), true);

  save.dispose();
  save.dispose();
  assert.deepEqual(signals.map((signal) => signal.aborted), [true, true]);
  assert.equal(save.loading(), false);
  assert.equal(save.error(), null);
  assert.equal(save.data(), undefined);

  gates[0].resolve();
  gates[1].resolve();
  await assert.rejects(first, (error) => error?.name === "AbortError");
  await assert.rejects(second, (error) => error?.name === "AbortError");
  save.reset();
  await assert.rejects(save.run(2), {
    message: "[mado:mutation] mutation is disposed",
  });
});

test("a mutation created inside an already disposed lifecycle is terminal", async () => {
  const lifecycle = createLifecycle();
  lifecycle.dispose();
  let calls = 0;

  const save = runInLifecycle(lifecycle, () =>
    mutation(async () => {
      calls++;
      return "unexpected";
    }),
  );

  await assert.rejects(save.run(undefined), {
    message: "[mado:mutation] mutation is disposed",
  });
  assert.equal(calls, 0);
  assert.equal(save.loading(), false);
});
