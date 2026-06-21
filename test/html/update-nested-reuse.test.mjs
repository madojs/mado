// C3 — update() must reuse a nested template instead of recreating its DOM.
//
// renderChild (src/html/bindings.ts) always did clearCurrent() + instantiate()
// for a single TemplateResult in child position — unlike each() and render(),
// which compare _strings and reuse the instance. So any signal read by a
// renderer that returns a nested html`` rebuilt the whole subtree on every
// change: a focused <input> inside a conditional form block was recreated,
// losing focus and its value, and listeners were re-attached.
//
// We assert DOM-node identity via a sentinel mark (the same technique as
// each-reconcile.test.mjs) plus a preserved .value, rather than focus, because
// linkedom does not model document focus. See FABLE_REPORT.md finding #3.

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

const { html, render } = await import("../../dist/src/html/template.js");
const { signal, flushSync } = await import("../../dist/src/signal.js");

test("renderChild reuses a nested template when its strings are unchanged", () => {
  const root = document.createElement("div");
  // A signal read by the renderer, but NOT bound to the nested <input>.
  const tick = signal(0);

  render(
    html`<div>
      ${() => {
        tick(); // subscribe the child effect to an unrelated signal
        return html`<input id="f" />`;
      }}
    </div>`,
    root,
  );

  const input1 = root.querySelector("#f");
  assert.ok(input1, "input rendered initially");
  input1.__madoMark = "KEEP";
  input1.value = "user-typed"; // simulate user input held in the DOM node

  // Change the unrelated signal → the child effect re-runs renderChild with a
  // fresh TemplateResult that has the SAME strings identity.
  tick.set(1);
  flushSync();

  const input2 = root.querySelector("#f");
  assert.ok(input2, "input still present after update");
  assert.equal(
    input2.__madoMark,
    "KEEP",
    "the nested <input> must be the SAME node, not recreated",
  );
  assert.equal(
    input2.value,
    "user-typed",
    "user-entered value must survive an unrelated re-render",
  );
});

test("renderChild still rebuilds when the nested template strings differ", () => {
  const root = document.createElement("div");
  const mode = signal("a");

  render(
    html`<section>
      ${() =>
        mode() === "a"
          ? html`<p data-mode="a">A</p>`
          : html`<strong data-mode="b">B</strong>`}
    </section>`,
    root,
  );

  assert.equal(root.querySelectorAll("p[data-mode='a']").length, 1);
  assert.equal(root.querySelectorAll("strong[data-mode='b']").length, 0);

  mode.set("b");
  flushSync();

  assert.equal(
    root.querySelectorAll("p[data-mode='a']").length,
    0,
    "old branch removed",
  );
  assert.equal(
    root.querySelector("strong[data-mode='b']").textContent,
    "B",
    "new branch rendered",
  );
});
