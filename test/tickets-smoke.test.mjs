// Smoke test for examples/tickets/.
// Imports the built example in a minimal linkedom environment.

import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  '<!doctype html><html><head></head><body><div id="app"></div></body></html>',
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

const winListeners = new Map();
const fakeWindow = {
  addEventListener(evt, fn) {
    if (!winListeners.has(evt)) winListeners.set(evt, new Set());
    winListeners.get(evt).add(fn);
  },
  removeEventListener(evt, fn) {
    winListeners.get(evt)?.delete(fn);
  },
  dispatchEvent() {},
};

globalThis.window = fakeWindow;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.HTMLElement = FakeHTMLElement;
globalThis.CSSStyleSheet = FakeCSSStyleSheet;
globalThis.customElements = ce;

const fakeLocation = {
  pathname: "/",
  search: "",
  hash: "",
  origin: "http://localhost",
  href: "http://localhost/",
};
globalThis.location = fakeLocation;
globalThis.history = {
  pushState(_s, _t, url) {
    const u = new URL(url, "http://localhost");
    fakeLocation.pathname = u.pathname;
    fakeLocation.search = u.search;
    fakeLocation.hash = u.hash;
    fakeLocation.href = u.href;
  },
  replaceState(_s, _t, url) {
    this.pushState(_s, _t, url);
  },
};
globalThis.PopStateEvent = class PopStateEvent {
  constructor(type) {
    this.type = type;
  }
};

globalThis.fetch ??= () => Promise.reject(new Error("no fetch in smoke"));
globalThis.matchMedia ??= () => ({ matches: false, addListener() {} });
globalThis.confirm ??= () => true;
globalThis.alert ??= () => {};

const { html, render } = await import("../dist/src/html.js");
const { flushSync } = await import("../dist/src/signal.js");

test("tickets: pages import without exception", async () => {
  await import("../dist/examples/tickets/pages/home.js");
  await import("../dist/examples/tickets/pages/tickets-list.js");
  await import("../dist/examples/tickets/pages/ticket-new.js");
  await import("../dist/examples/tickets/pages/ticket-detail.js");
  await import("../dist/examples/tickets/pages/not-found.js");

  assert.ok(ce.get("x-ticket-shell"), "x-ticket-shell should be registered");
  assert.ok(ce.get("x-ticket-badge"), "x-ticket-badge should be registered");
  assert.ok(ce.get("x-ticket-metric"), "x-ticket-metric should be registered");
  assert.ok(ce.get("x-ticket-home"), "x-ticket-home should be registered");
  assert.ok(ce.get("x-tickets-list"), "x-tickets-list should be registered");
  assert.ok(ce.get("x-ticket-new"), "x-ticket-new should be registered");
  assert.ok(ce.get("x-ticket-detail"), "x-ticket-detail should be registered");
});

test("tickets: routes() creates RouterApi", async () => {
  const routes = await import("../dist/examples/tickets/routes.js");
  assert.ok(routes.default, "routes default export");
  assert.equal(typeof routes.default.view, "function");
  assert.equal(typeof routes.default.dispose, "function");
});

test("tickets: route navigation keeps one page host in #app", async () => {
  const routes = await import("../dist/examples/tickets/routes.js");
  const app = document.getElementById("app");

  render(html`${routes.default.view}`, app);

  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
  };
  const pageHosts = () =>
    [...app.children].filter((el) =>
      [
        "x-ticket-home",
        "x-tickets-list",
        "x-ticket-new",
        "x-ticket-detail",
        "x-ticket-not-found",
      ].includes(el.localName),
    );

  await settle();
  assert.equal(pageHosts().length, 1);

  routes.default.navigate("/tickets/new");
  await settle();
  assert.deepEqual(pageHosts().map((el) => el.localName), ["x-ticket-new"]);

  routes.default.navigate("/tickets");
  await settle();
  assert.deepEqual(pageHosts().map((el) => el.localName), ["x-tickets-list"]);

  routes.default.navigate("/tickets/new");
  await settle();
  assert.deepEqual(pageHosts().map((el) => el.localName), ["x-ticket-new"]);

  routes.default.dispose();
});
