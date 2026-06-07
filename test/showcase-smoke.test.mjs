// Smoke test: import all showcase pages in a linkedom environment and verify
// that component registration/template parsing runs without exceptions. This
// does not run real browser navigation (that needs Playwright), but catches most
// "build passed, runtime crashed" issues.

import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body><div id=\"app\"></div></body></html>",
);

// linkedom does not provide CustomElementRegistry, so inject a minimal one.
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

// linkedom Window does not provide CSSStyleSheet/HTMLElement base behavior.
class FakeCSSStyleSheet {
  cssRules = [];
  replaceSync(text) {
    this.cssRules = text ? [{ cssText: String(text) }] : [];
  }
}
class FakeHTMLElement extends (w.HTMLElement ?? class {}) {
  attachShadow(opts) {
    // For smoke tests, a shadow root can be a regular fragment.
    const root = w.document.createDocumentFragment();
    Object.defineProperty(this, "shadowRoot", { value: root, writable: false });
    return root;
  }
}

// fakeWindow supports only the methods used by the router.
// linkedom's window does not allow addEventListener assignment reliably, so use
// a small facade.
const winListeners = new Map();
const fakeWindow = {
  addEventListener(evt, fn) {
    if (!winListeners.has(evt)) winListeners.set(evt, new Set());
    winListeners.get(evt).add(fn);
  },
  removeEventListener(evt, fn) {
    winListeners.get(evt)?.delete(fn);
  },
  dispatchEvent() {
    /* no-op in smoke */
  },
};

globalThis.window = fakeWindow;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.HTMLElement = FakeHTMLElement;
globalThis.HTMLInputElement = w.HTMLInputElement ?? FakeHTMLElement;
globalThis.HTMLSelectElement = w.HTMLSelectElement ?? FakeHTMLElement;
globalThis.HTMLTextAreaElement = w.HTMLTextAreaElement ?? FakeHTMLElement;
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

// Prevent api.ts imports from failing when fetch is touched.
globalThis.fetch ??= () => Promise.reject(new Error("no fetch in smoke"));

// Compatibility shims.
globalThis.matchMedia ??= () => ({ matches: false, addListener() {} });
globalThis.confirm ??= () => true;
globalThis.alert ??= () => {};

const { html, render } = await import("../dist/src/html.js");
const { flushSync } = await import("../dist/src/signal.js");
const { createLifecycle, runInLifecycle } = await import("../dist/src/lifecycle.js");
const { resource, mutation } = await import("../dist/src/resource.js");
const { useForm } = await import("../dist/src/forms.js");

test("showcase: routes import without exceptions", async () => {
  // Import all pages directly. This triggers component() registration, html``
  // parsing, style normalization, and similar startup paths. If startup is
  // broken, this test should see it.
  await import("../dist/examples/showcase/pages/home.js");
  await import("../dist/examples/showcase/pages/pricing.js");
  await import("../dist/examples/showcase/pages/blog-list.js");
  await import("../dist/examples/showcase/pages/blog-post.js");
  await import("../dist/examples/showcase/pages/login.js");
  await import("../dist/examples/showcase/pages/dashboard.js");
  await import("../dist/examples/showcase/pages/accounts-list.js");
  await import("../dist/examples/showcase/pages/account-new.js");
  await import("../dist/examples/showcase/pages/account-detail.js");
  await import("../dist/examples/showcase/pages/deals-list.js");
  await import("../dist/examples/showcase/pages/deal-detail.js");
  await import("../dist/examples/showcase/pages/settings.js");
  await import("../dist/examples/showcase/pages/users-list.js");
  await import("../dist/examples/showcase/pages/user-detail.js");
  await import("../dist/examples/showcase/pages/not-found.js");
  await import("../dist/examples/showcase/layouts/app-layout.js");
  await import("../dist/examples/showcase/components/x-data-table.js");
  await import("../dist/examples/showcase/components/x-empty-state.js");
  await import("../dist/examples/showcase/components/x-modal.js");
  await import("../dist/examples/showcase/components/x-status-badge.js");
  await import("../dist/examples/showcase/components/x-toast-stack.js");

  // Verify that representative components are registered.
  assert.ok(ce.get("x-hero"), "x-hero should be registered");
  assert.ok(ce.get("x-features"), "x-features should be registered");
  assert.ok(ce.get("x-pricing"), "x-pricing");
  assert.ok(ce.get("x-blog-list"), "x-blog-list");
  assert.ok(ce.get("x-blog-post"), "x-blog-post");
  assert.ok(ce.get("x-login"), "x-login");
  assert.ok(ce.get("x-dashboard"), "x-dashboard");
  assert.ok(ce.get("x-accounts-list"), "x-accounts-list");
  assert.ok(ce.get("x-account-new"), "x-account-new");
  assert.ok(ce.get("x-account-detail"), "x-account-detail");
  assert.ok(ce.get("x-deals-list"), "x-deals-list");
  assert.ok(ce.get("x-deal-detail"), "x-deal-detail");
  assert.ok(ce.get("x-settings"), "x-settings");
  assert.ok(ce.get("x-data-table"), "x-data-table");
  assert.ok(ce.get("x-status-badge"), "x-status-badge");
  assert.ok(ce.get("x-toast-stack"), "x-toast-stack");
  assert.ok(ce.get("x-app-layout"), "x-app-layout");
});

test("showcase: routes() is created without errors", async () => {
  // routes() creates router() and registers listeners, so this also exercises
  // the router startup path.
  const routes = await import("../dist/examples/showcase/routes.js");
  assert.ok(routes.default, "routes should export the default RouterApi");
  assert.equal(typeof routes.default.view, "function");
  assert.equal(typeof routes.default.dispose, "function");
});

test("showcase: navigation keeps one active app page host", async () => {
  const routes = await import("../dist/examples/showcase/routes.js");
  const app = document.getElementById("app");

  render(html`${routes.default.view}`, app);

  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
  };
  const activeHosts = () =>
    [...app.querySelectorAll(
      "x-dashboard,x-accounts-list,x-account-new,x-account-detail,x-deals-list,x-deal-detail,x-settings,x-login,x-hero,x-features",
    )];

  await settle();
  assert.equal(activeHosts().length, 2, "landing has hero + features");

  routes.default.navigate("/app/login");
  await settle();
  assert.deepEqual(activeHosts().map((el) => el.localName), ["x-login"]);

  routes.default.navigate("/app/dashboard");
  await settle();
  assert.deepEqual(activeHosts().map((el) => el.localName), ["x-dashboard"]);

  routes.default.navigate("/app/accounts");
  await settle();
  assert.deepEqual(activeHosts().map((el) => el.localName), ["x-accounts-list"]);

  routes.default.navigate("/app/accounts/new");
  await settle();
  assert.deepEqual(activeHosts().map((el) => el.localName), ["x-account-new"]);

  routes.default.navigate("/app/accounts/101");
  await settle();
  assert.deepEqual(activeHosts().map((el) => el.localName), ["x-account-detail"]);

  routes.default.dispose();
});

test("showcase: API/form/resource smoke covers CRM mutations", async () => {
  const { api } = await import("../dist/examples/showcase/lib/api.js");
  const lifecycle = createLifecycle();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const accounts = runInLifecycle(lifecycle, () =>
    resource(
      () => "showcase-smoke-accounts",
      () => api.listAccounts({ pageSize: 100 }),
    ),
  );

  await wait(260);
  const before = accounts.data()?.total ?? 0;
  assert.ok(before > 0);

  const createAccount = mutation(
    (input) => api.createAccount(input),
    { invalidates: ["showcase-smoke-accounts", "/api/stats"] },
  );
  const created = await createAccount.run({
    name: "Smoke Test Industries",
    domain: "smoke.example",
    status: "lead",
    plan: "growth",
    mrr: 3100,
    ownerId: 1,
    notes: "Created by showcase smoke test.",
  });
  assert.ok(created.id);

  await wait(360);
  assert.equal(accounts.data()?.total, before + 1);

  const editAccount = mutation(
    (patch) => api.updateAccount(created.id, patch),
    { invalidates: ["showcase-smoke-accounts", `account:${created.id}`] },
  );
  const edited = await editAccount.run({ status: "active", mrr: 4500 });
  assert.equal(edited.status, "active");
  assert.equal(edited.mrr, 4500);

  const createDeal = mutation(
    (input) => api.createDeal(input),
    { invalidates: ["deals*", `account:${created.id}:deals`] },
  );
  const deal = await createDeal.run({
    accountId: created.id,
    title: "Smoke renewal",
    stage: "new",
    priority: "normal",
    value: 54000,
    closeDate: "2026-09-01",
    ownerId: 1,
    notes: "Deal created by resource smoke.",
  });
  assert.equal(deal.accountId, created.id);

  api.failNext("accounts");
  accounts.refresh();
  await wait(260);
  assert.match(accounts.error()?.message ?? "", /Controlled API failure/);

  const form = useForm({
    name: { required: true, minLength: 3 },
    mrr: { required: true, type: "number", min: 0 },
  });
  const input = document.createElement("input");
  input.name = "name";
  input.value = "CRM";
  form.onInput({ target: input });
  assert.equal(form.values().name, "CRM");

  lifecycle.dispose();
});
