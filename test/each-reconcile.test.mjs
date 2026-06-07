// Tests for correct keyed reconciliation in each().
//
// The old implementation:
//   - stored state in a WeakMap keyed by renderFn, so two lists with the same
//     function interfered with each other;
//   - returned an array of TemplateResult values, which renderChild removed and
//     recreated wholesale on change, losing focus and node state.
//
// Target implementation: each() returns a descriptor recognized by renderChild.
// It applies two-pointer keyed reconciliation, reusing existing DOM nodes and
// moving them through insertBefore.
//
// These tests were failing before the v0.3/v0.4 hardening work.
//
// Important: to verify "same DOM node", do not use assert.strictEqual(node, node).
// On failure, node:test calls util.inspect() on the node; linkedom nodes contain
// ownerDocument/parentNode cycles, and inspection can become very expensive.
// Instead, put a sentinel mark on each node before the update and check that the
// node with the same data-id keeps that mark afterwards.

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
const { each } = await import("../dist/src/each.js");
const { signal, flushSync } = await import("../dist/src/signal.js");

/** Return all <li> nodes inside a container. */
function lis(container) {
  return [...container.querySelectorAll("li")];
}

/** Mark nodes with a stable "MARK-<data-id>" value. */
function markByDataId(nodes) {
  for (const n of nodes) {
    n.__madoMark = "MARK-" + n.getAttribute("data-id");
  }
}

/** Verify that nodes preserved a mark matching their data-id. */
function assertMarksPreserved(nodes, label = "") {
  for (const n of nodes) {
    const id = n.getAttribute("data-id");
    assert.equal(
      n.__madoMark,
      "MARK-" + id,
      `${label} node with data-id=${id} should keep its mark (was it recreated?)`,
    );
  }
}

test("each: reuses DOM nodes on reorder", () => {
  const root = document.createElement("div");
  const items = signal([
    { id: 1, name: "a" },
    { id: 2, name: "b" },
    { id: 3, name: "c" },
  ]);

  render(
    html`<ul>${() =>
      each(items(), (t) => t.id, (t) => html`<li data-id=${String(t.id)}>${t.name}</li>`)}</ul>`,
    root,
  );

  const before = lis(root);
  assert.equal(before.length, 3);
  markByDataId(before);

  items.set([
    { id: 3, name: "c" },
    { id: 1, name: "a" },
    { id: 2, name: "b" },
  ]);
  flushSync();

  const after = lis(root);
  assert.equal(after.length, 3);
  assert.deepEqual(
    after.map((li) => li.getAttribute("data-id")),
    ["3", "1", "2"],
  );
  assertMarksPreserved(after, "reorder");
});

test("each: adding at the beginning does not recreate old nodes", () => {
  const root = document.createElement("div");
  const items = signal([
    { id: 1, name: "a" },
    { id: 2, name: "b" },
  ]);

  render(
    html`<ul>${() =>
      each(items(), (t) => t.id, (t) => html`<li data-id=${String(t.id)}>${t.name}</li>`)}</ul>`,
    root,
  );

  markByDataId(lis(root));

  items.set([
    { id: 99, name: "new" },
    { id: 1, name: "a" },
    { id: 2, name: "b" },
  ]);
  flushSync();

  const after = lis(root);
  assert.equal(after.length, 3);
  assert.deepEqual(
    after.map((li) => li.getAttribute("data-id")),
    ["99", "1", "2"],
  );
  // Old nodes keep their marks; the new node has none.
  const li1 = after.find((li) => li.getAttribute("data-id") === "1");
  const li2 = after.find((li) => li.getAttribute("data-id") === "2");
  const li99 = after.find((li) => li.getAttribute("data-id") === "99");
  assert.equal(li1.__madoMark, "MARK-1");
  assert.equal(li2.__madoMark, "MARK-2");
  assert.equal(li99.__madoMark, undefined, "new node should not have a mark");
});

test("each: removing from the middle does not touch neighboring nodes", () => {
  const root = document.createElement("div");
  const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);

  render(
    html`<ul>${() =>
      each(items(), (t) => t.id, (t) => html`<li data-id=${String(t.id)}>${t.id}</li>`)}</ul>`,
    root,
  );
  markByDataId(lis(root));

  items.set([{ id: 1 }, { id: 4 }]);
  flushSync();

  const after = lis(root);
  assert.equal(after.length, 2);
  assertMarksPreserved(after, "middle removal");
});

test("each: two lists with the same render function do not interfere", () => {
  const root = document.createElement("div");
  const itemsA = signal([{ id: 1 }, { id: 2 }]);
  const itemsB = signal([{ id: 1 }, { id: 2 }]);
  const renderItem = (t) => html`<li data-id=${String(t.id)}>${t.id}</li>`;

  render(
    html`
      <ul id="a">${() => each(itemsA(), (t) => t.id, renderItem)}</ul>
      <ul id="b">${() => each(itemsB(), (t) => t.id, renderItem)}</ul>
    `,
    root,
  );

  const ulA = root.querySelector("#a");
  const ulB = root.querySelector("#b");
  // Mark A nodes with an A- prefix and B nodes with a B- prefix.
  for (const n of ulA.querySelectorAll("li")) {
    n.__madoMark = "A-" + n.getAttribute("data-id");
  }
  for (const n of ulB.querySelectorAll("li")) {
    n.__madoMark = "B-" + n.getAttribute("data-id");
  }

  itemsA.set([{ id: 2 }, { id: 1 }]);
  flushSync();

  const aAfter = [...ulA.querySelectorAll("li")];
  const bAfter = [...ulB.querySelectorAll("li")];

  assert.deepEqual(
    aAfter.map((li) => li.getAttribute("data-id")),
    ["2", "1"],
  );
  // A nodes should keep their A marks.
  for (const n of aAfter) {
    assert.equal(n.__madoMark, "A-" + n.getAttribute("data-id"));
  }
  // B nodes keep their own B marks; nothing should be overwritten.
  for (const n of bAfter) {
    assert.equal(n.__madoMark, "B-" + n.getAttribute("data-id"));
  }
});

test("each: reverse reuses all nodes", () => {
  const root = document.createElement("div");
  const N = 10;
  const items = signal(
    Array.from({ length: N }, (_, i) => ({ id: i })),
  );

  render(
    html`<ul>${() =>
      each(items(), (t) => t.id, (t) => html`<li data-id=${String(t.id)}>${t.id}</li>`)}</ul>`,
    root,
  );

  markByDataId(lis(root));

  items.set([...items()].reverse());
  flushSync();

  const after = lis(root);
  assert.equal(after.length, N);
  assert.deepEqual(
    after.map((li) => li.getAttribute("data-id")),
    Array.from({ length: N }, (_, i) => String(N - 1 - i)),
  );
  assertMarksPreserved(after, "reverse");
});

test("each: empty list to non-empty list to empty list", () => {
  const root = document.createElement("div");
  const items = signal([]);

  render(
    html`<ul>${() =>
      each(items(), (t) => t.id, (t) => html`<li>${t.id}</li>`)}</ul>`,
    root,
  );

  assert.equal(lis(root).length, 0);

  items.set([{ id: 1 }, { id: 2 }]);
  flushSync();
  assert.equal(lis(root).length, 2);

  items.set([]);
  flushSync();
  assert.equal(lis(root).length, 0);
});

test("each: content update without key changes", () => {
  // Same id means the node is reused and its text is updated.
  const root = document.createElement("div");
  const items = signal([
    { id: 1, name: "a" },
    { id: 2, name: "b" },
  ]);

  render(
    html`<ul>${() =>
      each(items(), (t) => t.id, (t) => html`<li data-id=${String(t.id)}>${t.name}</li>`)}</ul>`,
    root,
  );

  markByDataId(lis(root));

  items.set([
    { id: 1, name: "A!" },
    { id: 2, name: "b" },
  ]);
  flushSync();

  const after = lis(root);
  assertMarksPreserved(after, "update without key changes");
  assert.equal(after[0].textContent.trim(), "A!");
  assert.equal(after[1].textContent.trim(), "b");
});

test("each: switching TemplateResult to each to TemplateResult cleans old state", () => {
  const root = document.createElement("div");
  const mode = signal("template-a");
  const items = signal([{ id: 1 }, { id: 2 }]);

  render(
    html`<main>${() => {
      if (mode() === "template-a") {
        return html`<p data-mode="a">A</p>`;
      }
      if (mode() === "each") {
        return each(
          items(),
          (t) => t.id,
          (t) => html`<span data-id=${String(t.id)}>${String(t.id)}</span>`,
        );
      }
      return html`<strong data-mode="b">B</strong>`;
    }}</main>`,
    root,
  );

  assert.equal(root.querySelectorAll("p[data-mode='a']").length, 1);

  mode.set("each");
  flushSync();
  assert.equal(root.querySelectorAll("p[data-mode='a']").length, 0);
  assert.deepEqual(
    [...root.querySelectorAll("span")].map((el) => el.getAttribute("data-id")),
    ["1", "2"],
  );

  mode.set("template-b");
  flushSync();
  assert.equal(root.querySelectorAll("span").length, 0);
  assert.equal(root.querySelector("strong[data-mode='b']").textContent, "B");
});
