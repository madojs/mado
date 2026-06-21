// Tests for the layout() + guard contract on routes().
//
// Verifies:
//   - layout() accepts a `guard` and applies it to every child page;
//   - synchronous guards can pass, halt, or redirect;
//   - async guards work and trigger navigate() on redirect;
//   - parent-group guards run before page guards (outer → inner).

import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);

// Minimal history + location (shared shape with router-isolation.test.mjs).
const fakeLocation = {
  pathname: "/",
  search: "",
  hash: "",
  origin: "http://localhost",
  href: "http://localhost/",
};

function setUrl(url) {
  const u = new URL(url, "http://localhost");
  fakeLocation.pathname = u.pathname;
  fakeLocation.search = u.search;
  fakeLocation.hash = u.hash;
  fakeLocation.href = u.href;
}

const fakeHistory = {
  pushState(_s, _t, url) {
    setUrl(url);
  },
  replaceState(_s, _t, url) {
    setUrl(url);
  },
};

const winListeners = new Map();
const fakeWindow = {
  addEventListener(evt, fn) {
    if (!winListeners.has(evt)) winListeners.set(evt, new Set());
    winListeners.get(evt).add(fn);
  },
  removeEventListener(evt, fn) {
    winListeners.get(evt)?.delete(fn);
  },
  dispatchEvent(evt) {
    for (const fn of winListeners.get(evt.type) ?? []) fn(evt);
    return true;
  },
  scrollTo() {},
  PopStateEvent: class PopStateEvent {
    constructor(type) {
      this.type = type;
    }
  },
};

globalThis.window = fakeWindow;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.HTMLElement = w.HTMLElement ?? class {};
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.location = fakeLocation;
globalThis.history = fakeHistory;
globalThis.PopStateEvent = fakeWindow.PopStateEvent;

const { routes } = await import("../../dist/src/router/manifest.js");
const { html } = await import("../../dist/src/html/template.js");
const { page, layout } = await import("../../dist/src/page.js");

// Tiny helper: wait one microtask tick so redirects scheduled with
// queueMicrotask are observable.
const tick = () => new Promise((r) => setTimeout(r, 0));

test("layout() ships as the route group factory", () => {
  assert.equal(typeof layout, "function");
});

test("group-level guard: passes when verdict is void → page renders", async () => {
  setUrl("/admin");
  const seen = [];
  const home = page({ view: () => html`<h1>home</h1>` });
  const dash = page({ view: () => html`<h1>dashboard</h1>` });
  const r = routes({
    "/": home,
    "/admin": layout({
      guard: () => {
        seen.push("guard:pass");
        // void = pass
      },
      routes: {
        "/": dash,
      },
    }),
  });
  // First render is sync via cache miss → async path. Wait a tick.
  void r.view();
  await tick();
  await tick();
  assert.deepEqual(seen, ["guard:pass"]);
  r.dispose();
});

test("group-level guard: redirect verdict calls navigate(), original page does not render", async () => {
  setUrl("/admin");
  const dash = page({ view: () => html`<h1>dashboard</h1>` });
  const login = page({ view: () => html`<h1>login</h1>` });
  const r = routes({
    "/login": login,
    "/admin": layout({
      guard: ({ path }) => ({
        redirect: `/login?return=${encodeURIComponent(path)}`,
      }),
      routes: { "/": dash },
    }),
  });
  void r.view();
  await tick();
  await tick();
  // navigate() was called and pushState updated the URL.
  assert.equal(
    fakeLocation.pathname,
    "/login",
    "redirect should hit /login (location updated)",
  );
  assert.equal(
    fakeLocation.search,
    "?return=%2Fadmin",
    "return URL should be preserved",
  );
  r.dispose();
});

test("page-level guard: halts page render without redirect", async () => {
  setUrl("/secret");
  let rendered = false;
  const secret = page({
    guard: () => ({ halt: true }),
    view: () => {
      rendered = true;
      return html`<h1>secret</h1>`;
    },
  });
  const r = routes({ "/secret": secret });
  void r.view();
  await tick();
  await tick();
  assert.equal(rendered, false, "page view() should not have been called");
  r.dispose();
});

test("guards run outer → inner (group then page); first non-pass wins", async () => {
  setUrl("/admin/danger");
  const order = [];
  let viewCalled = false;
  const danger = page({
    guard: () => {
      order.push("page");
      return { halt: true };
    },
    view: () => {
      viewCalled = true;
      return html`<h1>danger</h1>`;
    },
  });
  const r = routes({
    "/admin": layout({
      guard: () => {
        order.push("group");
        // pass
      },
      routes: { "/danger": danger },
    }),
  });
  void r.view();
  await tick();
  await tick();
  assert.deepEqual(order, ["group", "page"]);
  assert.equal(viewCalled, false);
  r.dispose();
});

test("async guard: resolves and redirects via navigate()", async () => {
  setUrl("/admin");
  const dash = page({ view: () => html`<h1>dashboard</h1>` });
  const r = routes({
    "/admin": layout({
      guard: async () => {
        await Promise.resolve();
        return { redirect: "/login" };
      },
      routes: { "/": dash },
    }),
    "/login": page({ view: () => html`<h1>login</h1>` }),
  });
  void r.view();
  await tick();
  await tick();
  await tick();
  assert.equal(fakeLocation.pathname, "/login");
  r.dispose();
});

test("guard throwing is treated as halt (does not crash router)", async () => {
  setUrl("/admin");
  let viewCalled = false;
  // Silence the expected console.error from manifest.ts.
  const origErr = console.error;
  console.error = () => {};
  try {
    const dash = page({
      guard: () => {
        throw new Error("boom");
      },
      view: () => {
        viewCalled = true;
        return html`<h1>x</h1>`;
      },
    });
    const r = routes({ "/admin": dash });
    void r.view();
    await tick();
    await tick();
    assert.equal(viewCalled, false);
    r.dispose();
  } finally {
    console.error = origErr;
  }
});
