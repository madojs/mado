// Resource lifecycle tests:
//   - resource() created inside a component should automatically clean up its
//     effect, abort controller, and invalidator subscription on disconnectedCallback;
//   - outside a component it still works, but prints a dev warning.
//
// These tests were failing before the v0.3/v0.4 hardening work.

import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);
globalThis.window = w;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.HTMLElement = w.HTMLElement ?? class {};
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.CSSStyleSheet =
  w.CSSStyleSheet ??
  class {
    replaceSync() {}
  };
globalThis.customElements = w.customElements ?? {
  define() {},
  get() {
    return undefined;
  },
};

const { component } = await import("../../dist/src/component.js");
const { html } = await import("../../dist/src/html/template.js");
const { resource, _testHooks } = await import("../../dist/src/resource.js");
const { flushSync } = await import("../../dist/src/signal.js");

// Component teardown is deferred to a microtask (C1 / FABLE_REPORT.md #1), so a
// genuine removal disposes only after the microtask queue drains.
async function microtasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("resource inside component cleans up on disconnect", async () => {
  // Fake fetcher with immediate resolution.
  const fetcher = (_key, _signal) => Promise.resolve({ ok: true });

  let resourceRef;
  const tag = "x-test-cleanup-" + Math.random().toString(36).slice(2, 8);
  component(tag, () => {
    resourceRef = resource(() => "/api/x", fetcher);
    return html`<div>x</div>`;
  });

  const before = _testHooks.invalidatorsSize();
  const el = document.createElement(tag);
  document.body.appendChild(el);
  // linkedom may call connectedCallback synchronously on append. If not, call it manually.
  if (typeof el.connectedCallback === "function") el.connectedCallback();
  flushSync();
  assert.ok(resourceRef, "component setup should create the resource");

  const during = _testHooks.invalidatorsSize();
  assert.ok(
    during > before,
    `after mount, an invalidator subscription should be added (before=${before}, during=${during})`,
  );

  // Disconnect. Teardown is deferred to a microtask, so flush both.
  document.body.removeChild(el);
  if (typeof el.disconnectedCallback === "function") el.disconnectedCallback();
  await microtasks();
  flushSync();

  const after = _testHooks.invalidatorsSize();

  assert.equal(
    after,
    before,
    `after disconnect, all invalidator subscriptions should be cleaned up (before=${before}, after=${after})`,
  );
});

test("component disposal aborts a pending resource and fences a late result", async () => {
  let resolveFetch;
  let requestSignal;
  let resourceRef;
  const fetcher = (_key, signal) => {
    requestSignal = signal;
    return new Promise((resolve) => {
      resolveFetch = resolve;
    });
  };

  const tag = "x-test-pending-" + Math.random().toString(36).slice(2, 8);
  component(tag, () => {
    resourceRef = resource(() => "/api/pending", fetcher, {
      staleTime: 60_000,
    });
    return html`<div>pending</div>`;
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  if (typeof el.connectedCallback === "function") el.connectedCallback();
  flushSync();
  assert.equal(resourceRef.loading(), true);
  assert.equal(requestSignal.aborted, false);

  document.body.removeChild(el);
  if (typeof el.disconnectedCallback === "function") el.disconnectedCallback();
  await microtasks();
  flushSync();

  assert.equal(requestSignal.aborted, true);
  assert.equal(resourceRef.loading(), false);
  resolveFetch("late");
  await microtasks();
  assert.equal(resourceRef.data(), undefined);
  assert.equal(resourceRef.error(), null);
  assert.equal(resourceRef.loading(), false);
});

test("standalone resource exposes idempotent explicit disposal", async () => {
  const fetcher = (_k, _s) => Promise.resolve(1);

  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(" "));

  try {
    const before = _testHooks.invalidatorsSize();
    const r = resource(() => "/api/y", fetcher);
    assert.ok(r.data, "resource should return its API even outside a component");
    flushSync();
    assert.equal(_testHooks.invalidatorsSize(), before + 1);
    assert.ok(
      warns.some((m) => m.toLowerCase().includes("resource")),
      "a dev warning about usage outside a component should be printed",
    );

    r.dispose();
    r.dispose();
    assert.equal(
      _testHooks.invalidatorsSize(),
      before,
      "explicit disposal must remove the global invalidator exactly once",
    );
    await assert.rejects(r.refresh(), /resource is disposed/);
    assert.throws(() => r.mutate(2), /resource is disposed/);
  } finally {
    console.warn = origWarn;
  }
});

test("several components clean up only their own subscriptions", async () => {
  const fetcher = () => Promise.resolve(0);


  const tagA = "x-test-cleanup-a-" + Math.random().toString(36).slice(2, 8);
  const tagB = "x-test-cleanup-b-" + Math.random().toString(36).slice(2, 8);

  component(tagA, () => {
    resource(() => "/api/a", fetcher);
    return html`<div>a</div>`;
  });
  component(tagB, () => {
    resource(() => "/api/b", fetcher);
    return html`<div>b</div>`;
  });

  const before = _testHooks.invalidatorsSize();
  const a = document.createElement(tagA);
  const b = document.createElement(tagB);
  document.body.appendChild(a);
  document.body.appendChild(b);
  if (typeof a.connectedCallback === "function") a.connectedCallback();
  if (typeof b.connectedCallback === "function") b.connectedCallback();
  flushSync();

  const during = _testHooks.invalidatorsSize();
  assert.equal(during, before + 2);

  // Disconnect only A. Teardown is deferred to a microtask.
  document.body.removeChild(a);
  if (typeof a.disconnectedCallback === "function") a.disconnectedCallback();
  await microtasks();
  flushSync();

  const middle = _testHooks.invalidatorsSize();
  assert.equal(middle, before + 1, "the subscription from B should remain");

  // Now disconnect B.
  document.body.removeChild(b);
  if (typeof b.disconnectedCallback === "function") b.disconnectedCallback();
  await microtasks();
  flushSync();
  assert.equal(_testHooks.invalidatorsSize(), before);

});
