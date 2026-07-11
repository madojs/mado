import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML("<!doctype html><html><body></body></html>");
const storage = new Map();
globalThis.window = w;
globalThis.document = w.document;
globalThis.HTMLElement = w.HTMLElement;
globalThis.Element = w.Element;
globalThis.Node = w.Node;
globalThis.customElements = w.customElements;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const { devtools } = await import("../../dist/src/devtools.js");
const { signal, effect, flushSync } = await import("../../dist/src/signal.js");

test("devtools controller captures reactivity and manages the overlay", () => {
  devtools.clear();
  devtools.open();
  const host = document.getElementById("mado-devtools");
  assert.ok(host?.shadowRoot, "devtools uses an isolated Shadow DOM overlay");

  const count = signal(0);
  const dispose = effect(() => count());
  count.set(1);
  flushSync();
  dispose();

  const snapshot = devtools.snapshot();
  assert.equal(snapshot.version, 1);
  assert.ok(snapshot.records.some((record) => record.kind === "signal:create"));
  assert.ok(snapshot.records.some((record) => record.kind === "signal:set"));
  assert.ok(snapshot.records.some((record) => record.kind === "effect:run"));
  assert.ok(snapshot.records.some((record) => record.kind === "effect:dispose"));

  devtools.setLogLevel("debug");
  assert.equal(storage.get("mado:log-level"), "debug");
  devtools.close();
  assert.equal(host.hidden, true);
  devtools.toggle();
  assert.equal(host.hidden, false);
  devtools.clear();
  assert.equal(devtools.snapshot().records.length, 0);
});
