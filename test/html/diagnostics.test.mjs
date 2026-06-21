import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);

const registry = new Map();
const ce = {
  define(name, ctor) {
    registry.set(name, ctor);
  },
  get(name) {
    return registry.get(name);
  },
  whenDefined() {
    return Promise.resolve();
  },
  upgrade() {},
};

class FakeCSSStyleSheet {
  cssRules = [];
  replaceSync(text) {
    this.cssRules = text ? [{ cssText: String(text) }] : [];
  }
}

class FakeHTMLElement extends (w.HTMLElement ?? class {}) {
  attachShadow() {
    const root = w.document.createDocumentFragment();
    Object.defineProperty(this, "shadowRoot", { value: root, writable: false });
    return root;
  }
}

globalThis.window = w;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.HTMLElement = FakeHTMLElement;
globalThis.CSSStyleSheet = FakeCSSStyleSheet;
globalThis.customElements = ce;
globalThis.AbortController ??= class AbortController {
  signal = { aborted: false };
  abort() {
    this.signal.aborted = true;
  }
};

const { warnOnce, _testHooks } = await import("../../dist/src/diagnostics.js");
const { component } = await import("../../dist/src/component.js");
const { html, render } = await import("../../dist/src/html/template.js");
const { resource } = await import("../../dist/src/resource.js");

function captureWarnings(fn) {
  const orig = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    fn();
  } finally {
    console.warn = orig;
  }
  return warnings;
}

test("warnOnce(): prints once per code", () => {
  _testHooks.resetWarnings();

  const warnings = captureWarnings(() => {
    warnOnce("same-code", "first");
    warnOnce("same-code", "second");
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\[mado:same-code\] first/);
});

test("resource(): outside lifecycle warns once", () => {
  _testHooks.resetWarnings();

  const warnings = captureWarnings(() => {
    resource(() => "/diagnostics-a", () => Promise.resolve("a"));
    resource(() => "/diagnostics-b", () => Promise.resolve("b"));
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /resource-outside-lifecycle/);
});

test("html(): regular disabled/checked attr binding warns", () => {
  _testHooks.resetWarnings();

  const warnings = captureWarnings(() => {
    const div = document.createElement("div");
    render(html`<button disabled=${true} checked=${false}></button>`, div);
  });

  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /boolean-attr-disabled/);
  assert.match(warnings[1], /boolean-attr-checked/);
});

test("html(): boolean binding through ?disabled does not warn", () => {
  _testHooks.resetWarnings();

  const warnings = captureWarnings(() => {
    const div = document.createElement("div");
    render(html`<button ?disabled=${true} ?checked=${false}></button>`, div);
  });

  assert.deepEqual(warnings, []);
});

test("component(): tag without a hyphen warns and does not throw", () => {
  _testHooks.resetWarnings();

  const warnings = captureWarnings(() => {
    component("badtag", () => () => html`<span></span>`);
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /component-invalid-tag-badtag/);
  assert.equal(ce.get("badtag"), undefined);
});

test("component(): duplicate registration with another setup warns", () => {
  _testHooks.resetWarnings();

  component("x-duplicate-warning", () => () => html`<span>a</span>`);
  const warnings = captureWarnings(() => {
    component("x-duplicate-warning", () => () => html`<span>b</span>`);
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /component-duplicate-x-duplicate-warning/);
});

test("render(): container with unmanaged DOM warns", () => {
  _testHooks.resetWarnings();

  const warnings = captureWarnings(() => {
    const div = document.createElement("div");
    div.append("foreign");
    render(html`<span>Mado</span>`, div);
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /render-unmanaged-dom/);
});

test("render(): replaces marked baked DOM without unmanaged warning", () => {
  _testHooks.resetWarnings();

  const div = document.createElement("div");
  div.setAttribute("data-mado-baked", "");
  div.innerHTML = "<main>Baked landing</main>";

  const warnings = captureWarnings(() => {
    render(html`<section>Live app</section>`, div);
  });

  assert.deepEqual(warnings, []);
  assert.equal(div.hasAttribute("data-mado-baked"), false);
  assert.equal(div.querySelector("main"), null);
  assert.equal(div.textContent, "Live app");
});
