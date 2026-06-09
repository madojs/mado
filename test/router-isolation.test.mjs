// Tests for router()/routes() isolation and cleanup through dispose().
//
// Previous behavior:
//   - queryBus was global (outside router), with window listeners that had no cleanup;
//   - router() added click/mouseover/mouseout listeners to document without cleanup;
//   - routes() stored moduleCache/pathToFlat/compiledForPrefetch at module level,
//     so two calls interfered with each other.
//
// Target behavior:
//   - router() returns RouterApi with a dispose() method;
//   - after dispose(), document listeners are removed;
//   - after dispose(), window popstate listeners are removed (checked indirectly
//     through behavior invariants).
//
// These tests were failing before the v0.3/v0.4 hardening work.

import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);

// Minimal history + location, because linkedom does not provide them.
const fakeLocation = {
  pathname: "/",
  search: "",
  hash: "",
  origin: "http://localhost",
  href: "http://localhost/",
};
let scrollX = 0;
let scrollY = 0;

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

// Separate bus for window-level listeners. linkedom is awkward to override on
// the actual window object, so use a small facade.
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
  scrollTo(options) {
    scrollCalls.push(options);
    scrollX = options?.left ?? 0;
    scrollY = options?.top ?? 0;
  },
  get scrollX() {
    return scrollX;
  },
  get scrollY() {
    return scrollY;
  },
  get pageXOffset() {
    return scrollX;
  },
  get pageYOffset() {
    return scrollY;
  },
  history: { scrollRestoration: "auto" },
};
const scrollCalls = [];

globalThis.window = fakeWindow;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.HTMLElement = w.HTMLElement ?? class {};
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.location = fakeLocation;
globalThis.history = fakeHistory;
globalThis.PopStateEvent = class PopStateEvent {
  constructor(type) {
    this.type = type;
  }
};

// Intercept document listeners and count active listeners.
const docListenerCount = { click: 0, mouseover: 0, mouseout: 0 };
const origDocAdd = w.document.addEventListener.bind(w.document);
const origDocRemove = w.document.removeEventListener.bind(w.document);
w.document.addEventListener = (evt, fn, opts) => {
  if (evt in docListenerCount) docListenerCount[evt]++;
  return origDocAdd(evt, fn, opts);
};
w.document.removeEventListener = (evt, fn, opts) => {
  if (evt in docListenerCount) docListenerCount[evt]--;
  return origDocRemove(evt, fn, opts);
};

const { navigate, router, routes } = await import("../dist/src/router.js");
const { html } = await import("../dist/src/html.js");
const { page } = await import("../dist/src/page.js");

function snapshot() {
  return { ...docListenerCount };
}

test("router(): returns dispose and removes document listeners after dispose", () => {
  const before = snapshot();

  const r = router({
    "/": () => html`<x-home/>`,
    "/about": () => html`<x-about/>`,
  });

  const during = snapshot();
  assert.ok(
    during.click > before.click,
    `after router(), a click listener should appear (before=${before.click}, during=${during.click})`,
  );
  assert.ok(during.mouseover > before.mouseover, "and mouseover");

  assert.equal(typeof r.dispose, "function", "router() should return dispose()");
  r.dispose();

  const after = snapshot();
  assert.equal(after.click, before.click, "click listener removed");
  assert.equal(after.mouseover, before.mouseover, "mouseover listener removed");
  assert.equal(after.mouseout, before.mouseout, "mouseout listener removed");
});

test("router(): removes window popstate listener after dispose", () => {
  setUrl("/");
  const popBefore = winListeners.get("popstate")?.size ?? 0;

  const r = router({ "/": () => html`<x/>` });
  const popDuring = winListeners.get("popstate")?.size ?? 0;
  assert.equal(
    popDuring,
    popBefore + 1,
    "after router(), a popstate listener should be added",
  );

  r.dispose();
  const popAfter = winListeners.get("popstate")?.size ?? 0;
  assert.equal(popAfter, popBefore, "after dispose(), popstate is removed");
});

test("two independent router() instances do not interfere during navigation", () => {
  setUrl("/");
  const r1 = router({
    "/": () => html`<x-r1-home/>`,
    "/x": () => html`<x-r1-x/>`,
  });
  const r2 = router({
    "/": () => html`<x-r2-home/>`,
    "/y": () => html`<x-r2-y/>`,
  });

  // r1 navigates to /x, so its path should become /x.
  r1.navigate("/x");
  assert.equal(r1.path(), "/x", "r1 should react to its own navigate");

  // r2 listens to popstate separately, and its path also reflects location
  // because pushState changed location. That is expected: both routers observe
  // location. The important part is that each can render its own view.
  assert.ok(r1.view(), "r1.view() does not throw");
  assert.ok(r2.view(), "r2.view() does not throw");

  r1.dispose();
  r2.dispose();
});

test("router(): intercepts data-link through shadow/composedPath", () => {
  setUrl("/");
  const r = router({
    "/": () => html`<x-home/>`,
    "/shadow": () => html`<x-shadow/>`,
  });

  const host = w.document.createElement("x-host");
  const a = w.document.createElement("a");
  a.href = "http://localhost/shadow";
  a.setAttribute("data-link", "");

  const event = new w.Event("click", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "target", { value: host });
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "composedPath", {
    value: () => [a, host, w.document.body, w.document],
  });

  w.document.dispatchEvent(event);

  assert.equal(r.path(), "/shadow");
  assert.equal(fakeLocation.pathname, "/shadow");
  r.dispose();
});

test("router(): hover-prefetch uses shadow/composedPath", async () => {
  setUrl("/");
  const prefetched = [];
  const r = router(
    {
      "/": () => html`<x-home/>`,
      "/shadow": () => html`<x-shadow/>`,
    },
    {
      prefetch: (pathname) => prefetched.push(pathname),
    },
  );

  const host = w.document.createElement("x-host");
  const a = w.document.createElement("a");
  a.href = "http://localhost/shadow?x=1#frag";
  a.setAttribute("data-link", "");

  const event = new w.Event("mouseover", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "target", { value: host });
  Object.defineProperty(event, "composedPath", {
    value: () => [a, host, w.document.body, w.document],
  });

  w.document.dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 70));

  assert.deepEqual(prefetched, ["/shadow"]);
  r.dispose();
});

test("router(): new navigation scrolls to top", () => {
  setUrl("/");
  scrollCalls.length = 0;
  scrollX = 0;
  scrollY = 250;

  const r = router({
    "/": () => html`<x-home/>`,
    "/next": () => html`<x-next/>`,
  });

  r.navigate("/next");

  assert.deepEqual(scrollCalls, [{ top: 0, left: 0 }]);
  r.dispose();
});

test("router(): popstate restores saved scroll position", () => {
  setUrl("/");
  scrollCalls.length = 0;
  scrollX = 0;
  scrollY = 300;

  const r = router({
    "/": () => html`<x-home/>`,
    "/next": () => html`<x-next/>`,
  });

  r.navigate("/next");
  scrollX = 0;
  scrollY = 900;

  setUrl("/");
  fakeWindow.dispatchEvent(new PopStateEvent("popstate"));

  assert.deepEqual(scrollCalls.at(-1), { top: 300, left: 0 });
  r.dispose();
});

test("navigate(): preserves the previous route scroll before dispatching popstate", () => {
  setUrl("/");
  scrollCalls.length = 0;
  scrollX = 0;
  scrollY = 420;

  const r = router({
    "/": () => html`<x-home/>`,
    "/next": () => html`<x-next/>`,
  });

  navigate("/next");
  scrollX = 0;
  scrollY = 50;

  setUrl("/");
  fakeWindow.dispatchEvent(new PopStateEvent("popstate"));

  assert.deepEqual(scrollCalls.at(-1), { top: 420, left: 0 });
  r.dispose();
});

test("router(): navigation moves focus to the main content landmark", async () => {
  setUrl("/");
  const main = w.document.createElement("main");
  let focused = false;
  main.focus = () => {
    focused = true;
  };
  w.document.body.appendChild(main);

  const r = router({
    "/": () => html`<x-home/>`,
    "/next": () => html`<x-next/>`,
  });

  r.navigate("/next");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(focused, true);
  assert.equal(main.getAttribute("tabindex"), "-1");
  main.remove();
  r.dispose();
});

test("routes(): stale async route result does not change the active head", async () => {
  setUrl("/");
  document.title = "";

  let resolveSlow;
  const slowLoader = () =>
    new Promise((resolve) => {
      resolveSlow = () =>
        resolve({
          default: page({
            title: "Slow",
            view: () => html`<x-slow></x-slow>`,
          }),
        });
    });

  const fastPage = page({
    title: "Fast",
    view: () => html`<x-fast></x-fast>`,
  });

  const r = routes(
    {
      "/slow": slowLoader,
      "/fast": fastPage,
    },
    { loadingDelay: 0 },
  );

  r.navigate("/slow");
  r.view();

  r.navigate("/fast");
  r.view();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(document.title, "Fast");

  resolveSlow();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(document.title, "Fast");
  r.dispose();
});
