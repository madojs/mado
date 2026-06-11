// C7 — parser must fail loudly instead of silently dropping bindings.
//
// Two silent failures in src/html/parser.ts (FABLE_REPORT.md finding #7):
//   (a) a ${} slot inside a RAW_TEXT element (<textarea>/<title>/<style>/
//       <script>) was silently ignored — an LLM naturally writes
//       <textarea>${draft}</textarea> and gets neither an error nor a render.
//   (b) a nested html`<path .../>` for <svg> is instantiated via top-level
//       <template>.innerHTML → HTML namespace → an invisible element.
//
// "Silently doesn't work" is the worst failure mode for a framework selling
// predictability and LLM-friendliness, so the parser now throws a clear,
// fixable error in both cases. See MADO_V1_TRACKER.md C7.

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

const { html, render } = await import("../dist/src/html.js");

function renderIn(tpl) {
  const div = document.createElement("div");
  render(tpl, div);
  return div;
}

test("slot inside <textarea> throws a clear, fixable error", () => {
  assert.throws(
    () => renderIn(html`<textarea>${"draft"}</textarea>`),
    (err) => {
      assert.match(err.message, /textarea/i);
      assert.match(err.message, /\.value=/); // points at the fix
      return true;
    },
    "a ${} slot in a RAW_TEXT element must throw, not be silently dropped",
  );
});

test("slot inside <style> throws instead of being silently dropped", () => {
  assert.throws(
    () => renderIn(html`<style>${".a{color:red}"}</style>`),
    /style/i,
  );
});

test("nested SVG-child template throws a namespace error", () => {
  assert.throws(
    () => renderIn(html`<svg>${html`<circle r="5"></circle>`}</svg>`),
    (err) => {
      assert.match(err.message, /svg/i);
      return true;
    },
    "a nested template whose root is an SVG-only element renders in the wrong " +
      "namespace and must throw a clear error",
  );
});

test("a self-contained <svg> in one template still works", () => {
  const el = renderIn(
    html`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle></svg>`,
  );
  assert.ok(el.querySelector("svg"), "single-template svg renders fine");
});
