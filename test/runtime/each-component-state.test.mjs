// C1 — each() reorder must not destroy custom-element state.
//
// Per the Custom Elements spec, moving a connected node (which each()'s
// reconciler does via parent.insertBefore) fires disconnectedCallback()
// immediately followed by connectedCallback() — synchronously, in the same
// tick. The old MadoElement.disconnectedCallback did a full, synchronous
// teardown (#effectDispose() + #lifecycle.dispose()), so a move re-ran setup()
// and wiped every signal/resource/timer plus focus and <input> values.
//
// linkedom does not auto-fire custom-element reactions on insertBefore, so we
// model a "move" faithfully: a synchronous disconnect→connect pair. The fix
// defers teardown to a microtask and skips it if the element is still
// connected, so a same-tick re-insert preserves state and does NOT re-run
// setup(). A genuine removal still disposes (on the next microtask).
//
import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);

class FakeCSSStyleSheet {
  cssRules = [];
  replaceSync(text) {
    this.cssRules = text ? [{ cssText: String(text) }] : [];
  }
}

const origAttachShadow = w.HTMLElement.prototype.attachShadow;
w.HTMLElement.prototype.attachShadow = function attachShadow(init) {
  const root = origAttachShadow.call(this, init);
  root.adoptedStyleSheets ??= [];
  return root;
};

globalThis.window = w;
globalThis.document = w.document;
globalThis.document.adoptedStyleSheets = [];
globalThis.Node = w.Node;
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.HTMLElement = w.HTMLElement;
globalThis.CSSStyleSheet = FakeCSSStyleSheet;
globalThis.customElements = w.customElements;
globalThis.MutationObserver = w.MutationObserver;

const { component, html } = await import("../../dist/src/component.js");
const { signal, flushSync } = await import("../../dist/src/signal.js");

/** Flush the microtask queue so deferred teardown has a chance to run. */
async function microtasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("each move (sync disconnect→connect) preserves component state", async () => {
  let setups = 0;
  let draft; // captured per-setup signal — a fresh setup() would reset it

  component("x-c1-row", () => {
    setups++;
    const local = signal("initial-" + setups);
    draft = local;
    return () => html`<input .value=${local} />`;
  });

  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const el = document.createElement("x-c1-row");
  parent.appendChild(el);
  el.connectedCallback();

  assert.equal(setups, 1, "setup runs once on first connect");

  // User edits state.
  draft.set("user-typed");
  flushSync();

  // Model a keyed move: the browser fires disconnect→connect synchronously
  // when each() relocates the node via insertBefore.
  el.disconnectedCallback();
  el.connectedCallback();

  assert.equal(
    setups,
    1,
    "moving a connected component must NOT re-run setup()",
  );
  assert.equal(
    draft(),
    "user-typed",
    "component state must survive a same-tick move",
  );

  // The deferred teardown microtask sees the element still connected → skip.
  await microtasks();
  assert.equal(setups, 1, "deferred teardown must not fire for a live element");
  assert.equal(draft(), "user-typed");

  el.remove();
  el.disconnectedCallback();
  await microtasks();
});

test("genuine removal still disposes the component (next microtask)", async () => {
  let disposed = 0;

  component("x-c1-gone", (ctx) => {
    ctx.onDispose(() => {
      disposed++;
    });
    return () => html`<span>gone</span>`;
  });

  const el = document.createElement("x-c1-gone");
  document.body.appendChild(el);
  el.connectedCallback();

  assert.equal(disposed, 0);

  // Real removal: detach so isConnected becomes false, then fire the callback.
  el.remove();
  el.disconnectedCallback();

  await microtasks();
  assert.equal(
    disposed,
    1,
    "a component removed for good must still run its cleanup",
  );
});
