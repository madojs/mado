import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = w;
globalThis.document = w.document;
globalThis.CustomEvent = w.CustomEvent;
globalThis.HTMLElement = w.HTMLElement;
globalThis.Event = w.Event;

const { signal, flushSync } = await import("../../dist/src/signal.js");
const { createLifecycle, runInLifecycle } = await import(
  "../../dist/src/lifecycle.js"
);
const { createContext, provide, inject } = await import(
  "../../dist/src/context.js"
);

test("context protocol subscriptions update and clean up with lifecycles", () => {
  const context = createContext("default");
  const provider = document.createElement("section");
  const consumer = document.createElement("span");
  provider.appendChild(consumer);
  document.body.appendChild(provider);
  const source = signal("one");
  const providerLifecycle = createLifecycle();
  const consumerLifecycle = createLifecycle();

  runInLifecycle(providerLifecycle, () => provide(provider, context, source));
  const received = runInLifecycle(consumerLifecycle, () =>
    inject(consumer, context));
  assert.equal(received(), "one");

  source.set("two");
  flushSync();
  assert.equal(received(), "two");

  consumerLifecycle.dispose();
  source.set("three");
  flushSync();
  assert.equal(received(), "two", "disposed consumers unsubscribe");

  providerLifecycle.dispose();
  const fallback = inject(consumer, context);
  assert.equal(fallback(), "default", "disposed providers remove listeners");
});

test("context preserves function-valued values instead of treating them as signals", () => {
  const fallback = () => "fallback";
  const implementation = () => "provided";
  const context = createContext(fallback);
  const provider = document.createElement("section");
  const consumer = document.createElement("span");
  provider.appendChild(consumer);
  const lifecycle = createLifecycle();
  runInLifecycle(lifecycle, () => provide(provider, context, implementation));
  const received = inject(consumer, context);
  assert.equal(received(), implementation);
  assert.equal(received()(), "provided");
  lifecycle.dispose();
});

test("Mado providers interoperate with protocol consumers", () => {
  const context = createContext("default");
  const provider = document.createElement("section");
  const consumer = document.createElement("span");
  provider.appendChild(consumer);
  const lifecycle = createLifecycle();
  runInLifecycle(lifecycle, () => provide(provider, context, "mado"));

  let received;
  consumer.dispatchEvent(new CustomEvent("context-request", {
    detail: {
      context: context.key,
      callback(value) { received = value; },
    },
    bubbles: true,
    composed: true,
  }));
  assert.equal(received, "mado");
  lifecycle.dispose();
});

test("Mado consumers interoperate with protocol providers", () => {
  const context = createContext("default");
  const provider = document.createElement("section");
  const consumer = document.createElement("span");
  provider.appendChild(consumer);
  provider.addEventListener("context-request", (event) => {
    if (event.detail.context !== context.key) return;
    event.stopPropagation();
    event.detail.callback("external");
  });

  assert.equal(inject(consumer, context)(), "external");
});
