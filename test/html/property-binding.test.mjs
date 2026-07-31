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
const { each } = await import("../../dist/src/each.js");
const { flushSync, signal } = await import("../../dist/src/signal.js");

// Linkedom exposes a getter-only select.value. This small model reproduces the
// platform behaviour relevant to the regression: an unmatched assignment does
// not survive, and the options inserted by each() acquire a fallback selection.
function installSelectValueModel() {
  const prototype = w.HTMLSelectElement.prototype;
  const original = Object.getOwnPropertyDescriptor(prototype, "value");
  const selected = new WeakMap();
  const optionValue = (option) => String(option.value);

  Object.defineProperty(prototype, "value", {
    configurable: true,
    get() {
      const options = [...this.querySelectorAll("option")];
      const selectedValue = selected.get(this);
      const selectedOption = options.find(
        (option) => optionValue(option) === selectedValue,
      );
      if (selectedOption) return optionValue(selectedOption);
      const fallback = options.at(-1);
      return fallback ? optionValue(fallback) : "";
    },
    set(next) {
      const value = String(next);
      const hasOption = [...this.querySelectorAll("option")].some(
        (option) => optionValue(option) === value,
      );
      if (hasOption) selected.set(this, value);
      else selected.delete(this);
    },
  });

  return () => {
    if (original) Object.defineProperty(prototype, "value", original);
    else delete prototype.value;
  };
}

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

test("select .value is preserved when each() mounts its initial options", () => {
  const restore = installSelectValueModel();

  try {
    const root = document.createElement("div");
    const selected = signal("b");
    const options = ["a", "b", "c"];

    render(
      html`
        <select .value=${selected}>
          ${each(
            options,
            (value) => value,
            (value) => html`<option value=${value}>${value}</option>`,
          )}
        </select>
      `,
      root,
    );

    assert.equal(root.querySelector("select")?.value, "b");
  } finally {
    restore();
  }
});

test("select .value is preserved when each() receives options later", () => {
  const restore = installSelectValueModel();

  try {
    const root = document.createElement("div");
    const selected = signal("b");
    const options = signal([]);

    render(
      html`
        <select .value=${selected}>
          ${() =>
            each(
              options(),
              (value) => value,
              (value) => html`<option value=${value}>${value}</option>`,
            )}
        </select>
      `,
      root,
    );

    options.set(["a", "b", "c"]);
    flushSync();

    assert.equal(selected(), "b");
    assert.equal(root.querySelector("select")?.value, "b");
  } finally {
    restore();
  }
});

test("select .value is restored when a reactive option value becomes available", () => {
  const restore = installSelectValueModel();

  try {
    const root = document.createElement("div");
    const selected = signal("b");
    const optionValue = signal("x");

    render(
      html`
        <select .value=${selected}>
          ${each(
            [{ id: "dynamic" }],
            (item) => item.id,
            () => html`<option value=${optionValue}>dynamic</option>`,
          )}
          <option value="c">fallback</option>
        </select>
      `,
      root,
    );

    optionValue.set("b");
    flushSync();

    assert.equal(selected(), "b");
    assert.equal(root.querySelector("select")?.value, "b");
  } finally {
    restore();
  }
});

test("select .value is restored after a reactive option .value update", () => {
  const restore = installSelectValueModel();

  try {
    const root = document.createElement("div");
    const selected = signal("b");
    const optionValue = signal("x");

    render(
      html`
        <select .value=${selected}>
          ${each(
            [{ id: "dynamic" }],
            (item) => item.id,
            () => html`<option .value=${optionValue}>dynamic</option>`,
          )}
          <option value="c">fallback</option>
        </select>
      `,
      root,
    );

    optionValue.set("b");
    flushSync();

    assert.equal(root.querySelector("select")?.value, "b");
  } finally {
    restore();
  }
});

test("select .value remains authoritative over reactive ?selected", () => {
  const restore = installSelectValueModel();

  try {
    const root = document.createElement("div");
    const selected = signal("b");
    const selectFirst = signal(false);

    render(
      html`
        <select .value=${selected}>
          <option value="a" ?selected=${selectFirst}>first</option>
          <option value="b">second</option>
        </select>
      `,
      root,
    );

    const select = root.querySelector("select");
    assert.ok(select);
    select.value = "a";
    assert.equal(select.value, "a");

    selectFirst.set(true);
    flushSync();

    assert.equal(selected(), "b");
    assert.equal(select.value, "b");
  } finally {
    restore();
  }
});

test("option value rollback remains recoverable when select reapply throws", () => {
  const restore = installSelectValueModel();
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);

  try {
    const root = document.createElement("div");
    const selected = signal("b");
    const optionValue = signal("x");

    render(
      html`
        <select .value=${selected}>
          <option value=${optionValue}>dynamic</option>
          <option value="c">fallback</option>
        </select>
      `,
      root,
    );

    const select = root.querySelector("select");
    const option = root.querySelector("option");
    const descriptor = Object.getOwnPropertyDescriptor(
      w.HTMLSelectElement.prototype,
      "value",
    );
    assert.ok(select && option && descriptor?.get && descriptor.set);

    let throwNext = true;
    Object.defineProperty(select, "value", {
      configurable: true,
      get: () => descriptor.get.call(select),
      set: (next) => {
        if (throwNext) {
          throwNext = false;
          throw new Error("select value write failed");
        }
        descriptor.set.call(select, next);
      },
    });

    optionValue.set("b");
    flushSync();
    assert.equal(option.getAttribute("value"), "x");
    assert.ok(
      errors.some((args) => String(args[0]).includes("effect-run")),
      "the failed reapply is reported",
    );

    optionValue.set("c");
    flushSync();
    optionValue.set("b");
    flushSync();
    assert.equal(option.getAttribute("value"), "b");
    assert.equal(select.value, "b");
  } finally {
    console.error = originalError;
    restore();
  }
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
