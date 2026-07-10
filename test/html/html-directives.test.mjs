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
globalThis.customElements = w.customElements;

const { html, render, unmount } = await import("../../dist/src/html/template.js");
const {
  unsafeHTML,
  ref,
  classMap,
  styleMap,
} = await import("../../dist/src/html/bindings.js");
const { signal, flushSync } = await import("../../dist/src/signal.js");

function renderIn(tpl) {
  const div = document.createElement("div");
  render(tpl, div);
  return div;
}

test("render(): disposer and unmount release bindings and owned DOM", () => {
  const root = document.createElement("div");
  const value = signal("one");
  let clicks = 0;
  const dispose = render(
    html`<button @click=${() => clicks++}>${value}</button>`,
    root,
  );
  const button = root.querySelector("button");
  assert.ok(button);

  dispose();
  dispose();
  value.set("two");
  flushSync();
  button.click();

  assert.equal(root.childNodes.length, 0);
  assert.equal(clicks, 0);
  unmount(root);
});

test("unsafeHTML(): renders trusted HTML and cleans stale nodes", () => {
  const raw = signal("<strong>One</strong>");
  const root = renderIn(html`<div>${() => unsafeHTML(raw())}</div>`);

  assert.equal(root.querySelector("strong")?.textContent, "One");

  raw.set("<em>Two</em><span>!</span>");
  flushSync();

  assert.equal(root.querySelector("strong"), null);
  assert.equal(root.querySelector("em")?.textContent, "Two");
  assert.equal(root.querySelector("span")?.textContent, "!");
});

test("classMap(): toggles classes from an object", () => {
  const active = signal(true);
  const root = renderIn(html`
    <button class=${() =>
      classMap({
        active: active(),
        hidden: false,
        "size-lg": true,
      })}
    ></button>
  `);
  const button = root.querySelector("button");

  assert.equal(button.classList.contains("active"), true);
  assert.equal(button.classList.contains("hidden"), false);
  assert.equal(button.classList.contains("size-lg"), true);

  active.set(false);
  flushSync();

  assert.equal(button.classList.contains("active"), false);
  assert.equal(button.classList.contains("size-lg"), true);
});

test("classMap(): replaces a previous plain class binding", () => {
  const mapped = signal(false);
  const root = renderIn(html`
    <button class=${() =>
      mapped() ? classMap({ active: true }) : "legacy"}
    ></button>
  `);
  const button = root.querySelector("button");

  assert.equal(button.classList.contains("legacy"), true);

  mapped.set(true);
  flushSync();

  assert.equal(button.classList.contains("legacy"), false);
  assert.equal(button.classList.contains("active"), true);
});

test("styleMap(): applies styles and removes stale keys", () => {
  const color = signal("red");
  const gap = signal("8px");
  const withMargin = signal(true);
  const root = renderIn(html`
    <button
      style=${() =>
        styleMap({
          color: color(),
          marginTop: withMargin() ? "4px" : null,
          "--gap": gap(),
        })}
    ></button>
  `);
  const button = root.querySelector("button");

  assert.equal(button.style.getPropertyValue("color"), "red");
  assert.equal(button.style.getPropertyValue("margin-top"), "4px");
  assert.equal(button.style.getPropertyValue("--gap"), "8px");

  color.set("blue");
  gap.set("12px");
  withMargin.set(false);
  flushSync();

  assert.equal(button.style.getPropertyValue("color"), "blue");
  assert.equal(button.style.getPropertyValue("margin-top") ?? "", "");
  assert.equal(button.style.getPropertyValue("--gap"), "12px");
});

test("ref(): receives the element and is cleaned up on disposal", () => {
  const root = document.createElement("div");
  const calls = [];

  render(
    html`<input ref=${ref((el) => {
      calls.push(el?.tagName ?? null);
      if (el) return () => calls.push("cleanup");
    })}>`,
    root,
  );

  assert.deepEqual(calls, ["INPUT"]);
  assert.equal(root.querySelector("input")?.hasAttribute("ref"), false);

  render(html`<span>gone</span>`, root);

  assert.deepEqual(calls, ["INPUT", "cleanup", null]);
  assert.equal(root.querySelector("input"), null);
});

test("attribute directives throw in child position", () => {
  assert.throws(
    () => renderIn(html`<p>${classMap({ active: true })}</p>`),
    /classMap directive cannot be used in child position/,
  );
});
