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
const { flushSync, signal } = await import("../../dist/src/signal.js");

test("initial property binding still invokes a setter for undefined", () => {
  const writes = [];
  Object.defineProperty(HTMLElement.prototype, "madoinitialprobe", {
    configurable: true,
    get: () => undefined,
    set: (next) => writes.push(next),
  });

  try {
    const root = document.createElement("div");
    render(html`<div .madoinitialprobe=${undefined}></div>`, root);
    assert.deepEqual(writes, [undefined]);
  } finally {
    delete HTMLElement.prototype.madoinitialprobe;
  }
});

test("reactive .value skips a setter when the DOM already has the value", () => {
  const root = document.createElement("div");
  const value = signal("initial value");

  render(html`<input .value=${value} minlength="6">`, root);
  const input = root.querySelector("input");
  assert.ok(input);

  // Model the browser after a user edit: the DOM property already contains
  // the too-short value that the input handler is about to write into form
  // state. Reassigning it would clear Chromium's user-interaction validity.
  let domValue = "short";
  let setterCalls = 0;
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => domValue,
    set: (next) => {
      setterCalls++;
      domValue = next;
    },
  });

  value.set("short");
  flushSync();

  assert.equal(
    setterCalls,
    0,
    "the same-value signal update must preserve browser interaction validity",
  );
  assert.equal(input.value, "short");

  value.set("changed again");
  flushSync();

  assert.equal(setterCalls, 1, "a genuine property change still uses the setter");
  assert.equal(input.value, "changed again");
});

test("a throwing property getter does not block reactive writes", () => {
  const writes = [];
  const value = signal("first");
  Object.defineProperty(HTMLElement.prototype, "madothrowingprobe", {
    configurable: true,
    get: () => {
      throw new Error("write-only property");
    },
    set: (next) => writes.push(next),
  });

  try {
    const root = document.createElement("div");
    render(html`<div .madothrowingprobe=${value}></div>`, root);
    assert.deepEqual(writes, ["first"]);

    value.set("second");
    flushSync();
    assert.deepEqual(writes, ["first", "second"]);
  } finally {
    delete HTMLElement.prototype.madothrowingprobe;
  }
});
