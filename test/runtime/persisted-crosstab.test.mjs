// C2 — persisted() must not ping-pong across tabs, and destroy() must stop writes.
//
// Two bugs in src/persisted.ts (FABLE_REPORT.md finding #2):
//   (a) the publisher effect posts on every change and the receiver does
//       base.set(e.data); for OBJECT/array values, structured clone produces a
//       new identity each time, so Object.is never suppresses the echo → an
//       unending A↔B loop with a storage write per turn.
//   (b) the effect() disposers are never stored; destroy() only closes the
//       channel and clears storage, so the next base.set() re-writes the key.
//
// These tests model two tabs as two persisted() signals over the same key in
// one process, observed by a third BroadcastChannel.

import test from "node:test";
import assert from "node:assert/strict";

const { signal, flushSync } = await import("../../dist/src/signal.js");

/** Yield to the macrotask queue so BroadcastChannel can deliver. */
function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

// Minimal Map-backed Storage for the destroy() test.
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

test("persisted(): object values do not ping-pong across tabs", async (t) => {
  if (typeof BroadcastChannel === "undefined") {
    t.skip("BroadcastChannel not available");
    return;
  }

  const { persisted } = await import("../../dist/src/persisted.js");

  const channelName = "mado:persisted:c2-theme";
  const seen = [];
  const observer = new BroadcastChannel(channelName);
  observer.onmessage = (e) => seen.push(e.data);

  // Two "tabs" sharing the same key, with OBJECT values.
  const tabA = persisted("c2-theme", signal({ mode: "light" }), {
    syncTabs: true,
  });
  const tabB = persisted("c2-theme", signal({ mode: "light" }), {
    syncTabs: true,
  });

  // Always close channels — otherwise a present echo loop keeps the event loop
  // alive and the process hangs instead of reporting a clean failure.
  try {
    // Let any creation-time traffic settle, then start counting fresh.
    for (let i = 0; i < 6; i++) await tick();
    seen.length = 0;

    // One genuine change in tab A.
    tabA.set({ mode: "dark" });

    // Give a generous window for an echo loop to manifest if present.
    for (let i = 0; i < 10; i++) await tick();

    assert.ok(
      seen.length <= 2,
      `a single change must produce a bounded number of cross-tab messages, ` +
        `got ${seen.length} (echo loop?)`,
    );
    assert.deepEqual(tabA(), { mode: "dark" }, "tab A holds the new value");
    assert.deepEqual(
      tabB(),
      { mode: "dark" },
      "tab B converged to the new value",
    );
  } finally {
    tabA.destroy();
    tabB.destroy();
    observer.close();
  }
});


test("persisted(): destroy() stops further writes to storage", async () => {
  const storage = makeStorage();
  const prevLocal = globalThis.localStorage;
  globalThis.localStorage = storage;

  try {
    const { persisted } = await import("../../dist/src/persisted.js");

    const s = persisted("c2-draft", signal({ n: 1 }), { syncTabs: false });
    flushSync(); // initial write effect

    s.set({ n: 2 });
    flushSync();
    assert.equal(
      storage.getItem("mado:c2-draft"),
      JSON.stringify({ n: 2 }),
      "value is persisted before destroy()",
    );

    s.destroy();
    assert.equal(
      storage.getItem("mado:c2-draft"),
      null,
      "destroy() removes the stored key",
    );

    // The bug: the write effect is still alive, so this re-creates the key.
    s.set({ n: 3 });
    flushSync();
    assert.equal(
      storage.getItem("mado:c2-draft"),
      null,
      "after destroy(), set() must NOT write to storage again",
    );
  } finally {
    if (prevLocal === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevLocal;
  }
});
