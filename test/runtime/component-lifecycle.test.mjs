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
const { signal } = await import("../../dist/src/signal.js");
const { render } = await import("../../dist/src/html/template.js");
const { css } = await import("../../dist/src/css.js");

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
    return html`<span>${String(setups)}</span>`;
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
  assert.equal(el.shadowRoot.childNodes.length, 0, "teardown unmounts owned template DOM");

  document.body.appendChild(el);
  el.connectedCallback();
  assert.equal(setups, 2);
  assert.equal(disposes, 1);

  el.remove();
  el.disconnectedCallback();
  await microtasks();
  assert.equal(disposes, 2);
});

test("component(): setup failure rolls back and can retry after reconnect", () => {
  let attempts = 0;
  let cleanups = 0;
  component("x-setup-rollback", (ctx) => {
    attempts++;
    ctx.onDispose(() => cleanups++);
    if (attempts === 1) throw new Error("setup failed");
    return html`<span>ready</span>`;
  });

  const el = document.createElement("x-setup-rollback");
  assert.throws(() => el.connectedCallback(), /setup failed/);
  assert.equal(cleanups, 1);
  assert.equal(el.shadowRoot.childNodes.length, 0);

  el.connectedCallback();
  assert.equal(attempts, 2);
  assert.equal(el.shadowRoot.querySelector("span")?.textContent, "ready");
  el.disconnectedCallback();
});


test("component(): light DOM styles adopt once across instances", () => {
  const sheet = css`button { color: red; }`;

  component(
    "x-style-once",
    () => html`<button>Save</button>`,
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

test("component(): attributes do not clobber host properties", () => {
  component(
    "x-attrs-no-reflect",
    () => html`<span></span>`,
  );

  const el = document.createElement("x-attrs-no-reflect");
  const value = { id: 1 };
  const model = { name: "Ada" };
  el.value = value;
  el.model = model;

  el.setAttribute("value", "attribute value");
  el.setAttribute("model", "attribute model");

  assert.equal(
    el.value,
    value,
    "attribute changes must not overwrite .value set by .prop= bindings",
  );
  assert.equal(
    el.model,
    model,
    "attribute changes must not overwrite custom host state",
  );
});

test("ctx.attr(): reads initial value and updates on external setAttribute", async () => {
  component("x-attr-dynamic", ({ attr }) => {
    const variant = attr("variant", "default");
    return html`<span>${variant}</span>`;
  });

  const el = document.createElement("x-attr-dynamic");
  el.setAttribute("variant", "primary");
  document.body.appendChild(el);
  el.connectedCallback();

  // Initial read should pick up the attribute value set before connect
  assert.equal(el.shadowRoot.querySelector("span")?.textContent, "primary");

  // Simulate external attribute change (like Mado's ?disabled binding)
  el.setAttribute("variant", "danger");

  // MutationObserver fires on microtask in linkedom
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(el.shadowRoot.querySelector("span")?.textContent, "danger",
    "ctx.attr() must react to setAttribute() after connectedCallback — " +
    "this proves the per-instance MutationObserver path works");

  el.disconnectedCallback();
  document.body.removeChild(el);
});

test("ctx.attr(): distinguishes an absent attribute from an empty attribute", async () => {
  let current;
  component("x-attr-nullable", ({ attr }) => {
    current = attr("enabled");
    return html`<span>${() => String(current())}</span>`;
  });

  const el = document.createElement("x-attr-nullable");
  document.body.appendChild(el);
  el.connectedCallback();
  assert.equal(current(), null);

  el.setAttribute("enabled", "");
  await microtasks();
  assert.equal(current(), "");

  el.remove();
  el.disconnectedCallback();
  await microtasks();
});

test("component(): setup runs once and only template slots are reactive", async () => {
  const count = signal(1);
  let setups = 0;

  component("x-slot-reactivity", () => {
    setups++;
    const directSnapshot = count();
    return html`
      <span data-static>${directSnapshot}</span>
      <span data-reactive>${count}</span>
    `;
  });

  const el = document.createElement("x-slot-reactivity");
  document.body.appendChild(el);
  el.connectedCallback();

  assert.equal(setups, 1);
  assert.equal(
    el.shadowRoot.querySelector("[data-static]")?.textContent,
    "1",
  );
  assert.equal(
    el.shadowRoot.querySelector("[data-reactive]")?.textContent,
    "1",
  );

  count.set(2);
  await microtasks();

  assert.equal(setups, 1, "a direct setup read must not re-run setup");
  assert.equal(
    el.shadowRoot.querySelector("[data-static]")?.textContent,
    "1",
    "a direct read is a one-time setup snapshot",
  );
  assert.equal(
    el.shadowRoot.querySelector("[data-reactive]")?.textContent,
    "2",
    "a signal placed in a template slot remains reactive",
  );

  el.remove();
  el.disconnectedCallback();
  await microtasks();
});

test("component(): setup reads do not leak into a parent template tracker", async () => {
  const source = signal("initial");
  let parentSlotRuns = 0;

  component("x-untracked-setup", () => {
    const snapshot = source();
    return html`<span>${snapshot}</span>`;
  });

  const host = document.createElement("div");
  document.body.appendChild(host);
  render(
    html`${() => {
      parentSlotRuns++;
      return html`<x-untracked-setup></x-untracked-setup>`;
    }}`,
    host,
  );

  assert.equal(parentSlotRuns, 1);
  assert.equal(
    host
      .querySelector("x-untracked-setup")
      ?.shadowRoot?.querySelector("span")?.textContent,
    "initial",
  );

  source.set("changed");
  await microtasks();

  assert.equal(
    parentSlotRuns,
    1,
    "a child setup read must not subscribe its parent's reactive slot",
  );
  assert.equal(
    host
      .querySelector("x-untracked-setup")
      ?.shadowRoot?.querySelector("span")?.textContent,
    "initial",
    "the direct read remains a one-time setup snapshot",
  );

  host.remove();
  await microtasks();
});

test("component(): the legacy renderer-function return fails loudly", () => {
  component(
    "x-legacy-renderer",
    () => () => html`<span>legacy</span>`,
  );

  const el = document.createElement("x-legacy-renderer");
  assert.throws(
    () => el.connectedCallback(),
    /setup must return html`...`/,
  );
});
