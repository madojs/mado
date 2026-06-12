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

const { component, html } = await import("../dist/src/component.js");
const { css } = await import("../dist/src/css.js");

// Teardown is deferred to a microtask (see C1 / FABLE_REPORT.md finding #1):
// a synchronous disconnect→connect pair is treated as a move and preserves
// state, while a genuine removal (element detached) disposes on the microtask.
async function microtasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("component(): repeated connectedCallback does not duplicate setup", async () => {
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
  document.body.appendChild(el);

  el.connectedCallback();
  el.connectedCallback();
  assert.equal(setups, 1);
  assert.equal(disposes, 0);

  // Genuine removal: detach then fire the callback; teardown runs on microtask.
  el.remove();
  el.disconnectedCallback();
  await microtasks();
  assert.equal(disposes, 1);

  document.body.appendChild(el);
  el.connectedCallback();
  assert.equal(setups, 2);
  assert.equal(disposes, 1);

  el.remove();
  el.disconnectedCallback();
  await microtasks();
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

test("component(): observedAttributes do not clobber host properties", () => {
  component(
    "x-observed-no-reflect",
    () => () => html`<span></span>`,
    { observedAttributes: ["title", "value"] },
  );

  const el = document.createElement("x-observed-no-reflect");
  const value = { id: 1 };
  el.value = value;
  el.title = "property title";

  el.attributeChangedCallback("value", null, "attribute value");
  el.attributeChangedCallback("title", null, "attribute title");

  assert.equal(
    el.value,
    value,
    "attribute changes must not overwrite .value set by .prop= bindings",
  );
  assert.equal(
    el.title,
    "property title",
    "attributeChangedCallback must not write through native properties",
  );
});

test("ctx.attr(): reads initial value and updates on external setAttribute", async () => {
  const { signal: sigFn } = await import("../dist/src/signal.js");
  let variantReads = [];

  component("x-attr-dynamic", ({ attr }) => {
    const variant = attr("variant", "default");
    return () => {
      variantReads.push(variant());
      return html`<span>${variant}</span>`;
    };
  });

  const el = document.createElement("x-attr-dynamic");
  el.setAttribute("variant", "primary");
  document.body.appendChild(el);
  el.connectedCallback();

  // Initial read should pick up the attribute value set before connect
  assert.equal(variantReads.at(-1), "primary");

  // Simulate external attribute change (like Mado's ?disabled binding)
  el.setAttribute("variant", "danger");

  // MutationObserver fires on microtask in linkedom
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(variantReads.at(-1), "danger",
    "ctx.attr() must react to setAttribute() after connectedCallback — " +
    "this proves MutationObserver fallback works since observedAttributes " +
    "was empty at define-time");

  el.disconnectedCallback();
  document.body.removeChild(el);
});
