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

const { component, html } = await import("../dist/src/component.js");
const { css } = await import("../dist/src/css.js");

test("component(): repeated connectedCallback does not duplicate setup", () => {
  let setups = 0;
  let disposes = 0;

  component("x-lifecycle-once", (ctx) => {
    setups++;
    ctx.onDispose(() => {
      disposes++;
    });
    return () => html`<span>${String(setups)}</span>`;
  });

  const el = document.createElement("x-lifecycle-once");

  el.connectedCallback();
  el.connectedCallback();
  assert.equal(setups, 1);
  assert.equal(disposes, 0);

  el.disconnectedCallback();
  assert.equal(disposes, 1);

  el.connectedCallback();
  assert.equal(setups, 2);
  assert.equal(disposes, 1);

  el.disconnectedCallback();
  assert.equal(disposes, 2);
});

test("component(): light DOM styles adopt once across instances", () => {
  const sheet = css`button { color: red; }`;

  component(
    "x-style-once",
    () => () => html`<button>Save</button>`,
    { shadow: false, styles: sheet },
  );

  const before = document.adoptedStyleSheets.length;
  const first = document.createElement("x-style-once");
  const second = document.createElement("x-style-once");
  first.connectedCallback();
  second.connectedCallback();

  assert.equal(document.adoptedStyleSheets.length, before + 1);

  first.disconnectedCallback();
  second.disconnectedCallback();
});

test("component(): observedAttributes reflect into plain properties", () => {
  component(
    "x-observed-plain",
    () => () => html`<span></span>`,
    { observedAttributes: ["status"] },
  );

  const el = document.createElement("x-observed-plain");
  el.attributeChangedCallback("status", null, "open");

  assert.equal(el.status, "open");
});
