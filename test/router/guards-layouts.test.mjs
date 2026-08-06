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
const { navigate, queryParam, router } = await import(
  "../../dist/src/router/navigation.js"
);
const { html } = await import("../../dist/src/html/template.js");
const { page, layout } = await import("../../dist/src/page.js");
const { effect, signal } = await import("../../dist/src/signal.js");

// Tiny helper: wait one microtask tick so redirects scheduled with
// queueMicrotask are observable.
const tick = () => new Promise((r) => setTimeout(r, 0));

function textOf(tpl) {
  if (tpl == null || tpl === false || tpl === true) return "";
  if (typeof tpl === "string" || typeof tpl === "number") return String(tpl);
  if (typeof tpl === "function") return textOf(tpl());
  if (Array.isArray(tpl)) return tpl.map(textOf).join("");
  if (tpl._mado) {
    return tpl.strings.reduce(
      (out, part, index) => out + part + textOf(tpl.values[index]),
      "",
    );
  }
  return String(tpl);
}

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

test("guard redirect to the current pathname and search halts as a loop", async () => {
  setUrl("/self-redirect?scope=one");
  const errors = [];
  const staticStates = [];
  let guardCalls = 0;
  const originalError = console.error;
  const previousStaticRuntime = fakeWindow.__MADO_STATIC__;
  console.error = (...args) => errors.push(args.join(" "));
  fakeWindow.__MADO_STATIC__ = {
    beginRoute() {},
    routeReady(state) {
      staticStates.push(state);
    },
    track(promise) {
      return promise;
    },
    setRouterState() {},
    recordError() {},
  };
  const r = routes({
    "/self-redirect": page({
      guard: () => {
        guardCalls++;
        return { redirect: "/nested/../self-redirect?scope=one#again" };
      },
      view: () => html`<h1>never</h1>`,
    }),
  });

  try {
    void r.view();
    await tick();
    await tick();
    assert.equal(guardCalls, 1);
    assert.equal(fakeLocation.pathname, "/self-redirect");
    assert.equal(fakeLocation.search, "?scope=one");
    assert.equal(fakeLocation.hash, "");
    assert.equal(staticStates.at(-1), "halted");
    assert.ok(
      errors.some((message) =>
        message.includes("redirect targets the current route identity"),
      ),
    );
  } finally {
    console.error = originalError;
    if (previousStaticRuntime === undefined) {
      delete fakeWindow.__MADO_STATIC__;
    } else {
      fakeWindow.__MADO_STATIC__ = previousStaticRuntime;
    }
    r.dispose();
  }
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

test("guard context exposes route params, path, and a router-owned AbortSignal", async () => {
  setUrl("/teams/alpha?mode=edit");
  let context;
  const guarded = page({
    guard: (ctx) => {
      context = ctx;
      return { halt: true };
    },
    view: () => html`<h1>team</h1>`,
  });
  const r = routes({ "/teams/:team": guarded });

  void r.view();
  await tick();
  assert.deepEqual(context.params, { team: "alpha" });
  assert.equal(context.path, "/teams/alpha?mode=edit");
  assert.equal(context.signal instanceof AbortSignal, true);
  assert.equal(context.signal.aborted, false);

  r.dispose();
  assert.equal(context.signal.aborted, true);
});

test("RouterApi.navigate aborts a pending guard and discards its stale verdict", async () => {
  setUrl("/slow");
  let signal;
  let settleGuard;
  let laterGuardCalls = 0;
  let slowViewCalls = 0;
  const slow = page({
    guard: [
      (ctx) => {
        signal = ctx.signal;
        return new Promise((resolve) => {
          settleGuard = resolve;
        });
      },
      () => {
        laterGuardCalls++;
      },
    ],
    view: () => {
      slowViewCalls++;
      return html`<h1>slow</h1>`;
    },
  });
  const other = page({ view: () => html`<h1>other</h1>` });
  const r = routes({ "/slow": slow, "/other": other });

  void r.view();
  await tick();
  assert.equal(signal.aborted, false);

  r.navigate("/other");
  assert.equal(signal.aborted, true, "navigation aborts before it returns");
  const next = r.view();
  await tick();
  assert.match(textOf(next), /other/);

  settleGuard({ redirect: "/stale" });
  await tick();
  assert.equal(fakeLocation.pathname, "/other");
  assert.equal(laterGuardCalls, 0, "cancellation stops the remaining guards");
  assert.equal(slowViewCalls, 0, "a stale guarded page never renders");
  r.dispose();
});

test("query-only navigation aborts and replaces the guard transaction", async () => {
  setUrl("/slow-query?tab=one");
  const transactions = [];
  let viewCalls = 0;
  const guarded = page({
    guard: (ctx) => {
      return new Promise((resolve) => {
        transactions.push({ ctx, resolve });
      });
    },
    view: () => {
      viewCalls++;
      return html`<h1>slow</h1>`;
    },
  });
  const r = routes({ "/slow-query": guarded });

  let current;
  let routeEvaluations = 0;
  const stop = effect(() => {
    current = r.view();
    routeEvaluations++;
  });
  const first = current;
  await tick();
  assert.equal(transactions[0].ctx.path, "/slow-query?tab=one");

  r.navigate("/slow-query?tab=two");
  assert.equal(
    transactions[0].ctx.signal.aborted,
    true,
    "the old query cannot authorize the new URL",
  );
  assert.equal(fakeLocation.search, "?tab=two");

  await tick();
  const second = current;
  assert.equal(transactions.length, 2);
  assert.equal(routeEvaluations, 2, "the observed route restarts automatically");
  assert.equal(transactions[1].ctx.path, "/slow-query?tab=two");

  transactions[0].resolve(true);
  await tick();
  assert.equal(viewCalls, 0, "the stale guard result cannot render");
  assert.doesNotMatch(textOf(first), /slow/);

  transactions[1].resolve(true);
  await tick();
  assert.match(textOf(second), /slow/);
  assert.equal(viewCalls, 1);
  stop();
  r.dispose();
});

test("queryParam.set aborts and replaces a query-dependent guard", async () => {
  setUrl("/tenant?scope=one");
  const scope = queryParam("scope");
  const transactions = [];
  const guarded = page({
    guard: (ctx) =>
      new Promise((resolve) => transactions.push({ ctx, resolve })),
    view: () => html`<h1>tenant</h1>`,
  });
  const r = routes({ "/tenant": guarded });

  void r.view();
  await tick();
  scope.set("two", { push: true });
  assert.equal(transactions[0].ctx.signal.aborted, true);
  assert.equal(fakeLocation.search, "?scope=two");

  const replacement = r.view();
  await tick();
  assert.equal(transactions[1].ctx.path, "/tenant?scope=two");
  transactions[0].resolve(true);
  transactions[1].resolve(true);
  await tick();
  assert.match(textOf(replacement), /tenant/);
  r.dispose();
});

test("query guard replacement disposes old query effects before publishing the new value", async () => {
  setUrl("/scoped?scope=one");
  fakeWindow.dispatchEvent(new PopStateEvent("popstate"));
  const scope = queryParam("scope");
  const transactions = [];
  const events = [];
  const guarded = page({
    guard: (ctx) =>
      new Promise((resolve) => transactions.push({ ctx, resolve })),
    view: ({ onDispose }) => {
      effect(() => {
        events.push(`page:${scope()}`);
      });
      onDispose(() => events.push("dispose"));
      return html`<h1>scoped</h1>`;
    },
  });
  const r = routes({ "/scoped": guarded });
  let current;
  const stopRoute = effect(() => {
    current = r.view();
  });

  await tick();
  transactions[0].resolve(true);
  await tick();
  assert.match(textOf(current), /scoped/);
  assert.deepEqual(events, ["page:one"]);

  scope.set("two", { push: true });
  await tick();
  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].ctx.signal.aborted, true);
  assert.equal(events.includes("page:two"), false);
  assert.deepEqual(events, ["page:one", "dispose"]);

  transactions[1].resolve({ halt: true });
  await tick();
  stopRoute();
  r.dispose();
});

test("hash-only navigation does not restart a pathname+search guard", async () => {
  setUrl("/slow-hash?scope=one");
  let transaction;
  const guarded = page({
    guard: (ctx) =>
      new Promise((resolve) => {
        transaction = { ctx, resolve };
      }),
    view: () => html`<h1>hash-safe</h1>`,
  });
  const r = routes({ "/slow-hash": guarded });

  const pending = r.view();
  await tick();
  r.navigate("/slow-hash?scope=one#details");
  assert.equal(transaction.ctx.signal.aborted, false);
  transaction.resolve(true);
  await tick();
  assert.match(textOf(pending), /hash-safe/);
  r.dispose();
});

test("RouterApi.navigate synchronizes and fences every active manifest router", async () => {
  setUrl("/shared-slow");
  const transactions = [];
  const makeManifest = (name) => ({
    "/shared-slow": page({
      guard: (ctx) =>
        new Promise((resolve) => transactions.push({ name, ctx, resolve })),
      view: () => html`<h1>${name} stale</h1>`,
    }),
    "/other": page({ view: () => html`<h1>${name} other</h1>` }),
  });
  const r1 = routes(makeManifest("one"));
  const r2 = routes(makeManifest("two"));

  void r1.view();
  void r2.view();
  await tick();
  assert.equal(transactions.length, 2);

  r1.navigate("/other");
  assert.equal(transactions[0].ctx.signal.aborted, true);
  assert.equal(transactions[1].ctx.signal.aborted, true);
  assert.equal(r1.path(), "/other");
  assert.equal(r2.path(), "/other");

  const nextOne = r1.view();
  const nextTwo = r2.view();
  for (const transaction of transactions) {
    transaction.resolve({ redirect: "/stale" });
  }
  await tick();
  assert.equal(fakeLocation.pathname, "/other");
  assert.match(textOf(nextOne), /one other/);
  assert.match(textOf(nextTwo), /two other/);
  r1.dispose();
  r2.dispose();
});

test("raw RouterApi preflights manifest guards before a delayed ViewTransition", async () => {
  setUrl("/raw-slow");
  let applyTransition;
  let transaction;
  let guardedViewCalls = 0;
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    applyTransition = apply;
    return { ready: Promise.resolve() };
  };
  try {
    const raw = router({
      "/raw-slow": () => html`<h1>raw slow</h1>`,
      "/other": () => html`<h1>raw other</h1>`,
    });
    const guarded = routes({
      "/raw-slow": page({
        guard: (ctx) =>
          new Promise((resolve) => {
            transaction = { ctx, resolve };
          }),
        view: () => {
          guardedViewCalls++;
          return html`<h1>guarded slow</h1>`;
        },
      }),
      "/other": page({ view: () => html`<h1>guarded other</h1>` }),
    });

    void guarded.view();
    await tick();
    raw.navigate("/other");
    assert.equal(transaction.ctx.signal.aborted, true);
    assert.equal(fakeLocation.pathname, "/raw-slow");

    transaction.resolve(true);
    await tick();
    assert.equal(guardedViewCalls, 0);

    applyTransition();
    assert.equal(fakeLocation.pathname, "/other");
    assert.equal(raw.path(), "/other");
    assert.equal(guarded.path(), "/other");
    raw.dispose();
    guarded.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("delayed navigation fences guards hidden behind a pending lazy module", async () => {
  setUrl("/lazy-guard");
  let resolveModule;
  let applyTransition;
  let guardCalls = 0;
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    applyTransition = apply;
    return { ready: Promise.resolve() };
  };
  try {
    const lazy = () =>
      new Promise((resolve) => {
        resolveModule = () =>
          resolve({
            default: page({
              guard: () => {
                guardCalls++;
                return { redirect: "/stale-lazy-redirect" };
              },
              view: () => html`<h1>lazy guarded</h1>`,
            }),
          });
      });
    const r = routes({
      "/lazy-guard": lazy,
      "/lazy-away": page({ view: () => html`<h1>away</h1>` }),
    });
    let current;
    const stop = effect(() => {
      current = r.view();
    });

    await tick();
    r.navigate("/lazy-away");
    resolveModule();
    await tick();
    assert.equal(guardCalls, 0, "a superseded lazy module cannot start its guard");
    assert.equal(fakeLocation.pathname, "/lazy-guard");

    applyTransition();
    await tick();
    assert.equal(fakeLocation.pathname, "/lazy-away");
    assert.match(textOf(current), /away/);
    stop();
    r.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("imperative view evaluation cannot revive a route superseded by a delayed write", async () => {
  setUrl("/manual-fence");
  const transactions = [];
  let applyTransition;
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    applyTransition = apply;
    return { ready: Promise.resolve() };
  };
  try {
    const r = routes({
      "/manual-fence": page({
        guard: (ctx) =>
          new Promise((resolve) => transactions.push({ ctx, resolve })),
        view: () => html`<h1>manual current</h1>`,
      }),
      "/manual-away": page({ view: () => html`<h1>manual away</h1>` }),
    });

    void r.view();
    await tick();
    r.navigate("/manual-away");
    assert.equal(transactions[0].ctx.signal.aborted, true);
    assert.equal(textOf(r.view()), "");
    await tick();
    assert.equal(transactions.length, 1);

    transactions[0].resolve({ redirect: "/stale-manual-redirect" });
    await tick();
    assert.equal(fakeLocation.pathname, "/manual-fence");
    applyTransition();
    assert.equal(fakeLocation.pathname, "/manual-away");
    r.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("disposing the owner of a delayed write restores the current guard authority", async () => {
  setUrl("/dispose-transition");
  const transactions = [];
  let applyTransition;
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    applyTransition = apply;
    return { ready: Promise.resolve() };
  };
  try {
    const raw = router({
      "/dispose-transition": () => html`<h1>raw current</h1>`,
      "/away": () => html`<h1>raw away</h1>`,
    });
    const guarded = routes({
      "/dispose-transition": page({
        guard: (ctx) =>
          new Promise((resolve) => transactions.push({ ctx, resolve })),
        view: () => html`<h1>guarded current</h1>`,
      }),
      "/away": page({ view: () => html`<h1>guarded away</h1>` }),
    });
    let current;
    const stop = effect(() => {
      current = guarded.view();
    });

    await tick();
    raw.navigate("/away");
    assert.equal(transactions[0].ctx.signal.aborted, true);
    raw.dispose();
    await tick();
    assert.equal(transactions.length, 2);
    assert.equal(transactions[1].ctx.path, "/dispose-transition");

    applyTransition();
    transactions[0].resolve({ redirect: "/stale-dispose-transition" });
    transactions[1].resolve(true);
    await tick();
    assert.equal(fakeLocation.pathname, "/dispose-transition");
    assert.match(textOf(current), /guarded current/);
    stop();
    guarded.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("a reentrant RouterApi navigation retains delayed-write ownership", async () => {
  setUrl("/router-reentrant-current");
  const transitions = [];
  const transactions = [];
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    transitions.push(apply);
    return { ready: Promise.resolve() };
  };
  try {
    const raw = router({
      "/router-reentrant-current": () => html`<h1>raw current</h1>`,
      "/router-reentrant-outer": () => html`<h1>raw outer</h1>`,
      "/router-reentrant-winner": () => html`<h1>raw winner</h1>`,
    });
    const guarded = routes({
      "/router-reentrant-current": page({
        guard: (ctx) => {
          ctx.signal.addEventListener(
            "abort",
            () => raw.navigate("/router-reentrant-winner"),
            { once: true },
          );
          return new Promise((resolve) =>
            transactions.push({ ctx, resolve }),
          );
        },
        view: () => html`<h1>guarded current</h1>`,
      }),
      "/router-reentrant-outer": page({ view: () => html`<h1>outer</h1>` }),
      "/router-reentrant-winner": page({ view: () => html`<h1>winner</h1>` }),
    });
    let current;
    const stop = effect(() => {
      current = guarded.view();
    });

    await tick();
    raw.navigate("/router-reentrant-outer");
    assert.equal(transactions[0].ctx.signal.aborted, true);
    assert.equal(
      transitions.length,
      1,
      "the superseded outer call cannot register a second transition",
    );

    raw.dispose();
    await tick();
    assert.equal(transactions.length, 2);
    assert.equal(transactions[1].ctx.path, "/router-reentrant-current");

    transitions[0]();
    transactions[0].resolve({ redirect: "/router-reentrant-stale" });
    transactions[1].resolve(true);
    await tick();
    assert.equal(fakeLocation.pathname, "/router-reentrant-current");
    assert.match(textOf(current), /guarded current/);
    stop();
    guarded.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("disposing a RouterApi during preflight restores route authority", async () => {
  setUrl("/router-preflight-dispose");
  const transactions = [];
  const raw = router(
    {
      "/router-preflight-dispose": () => html`<h1>raw current</h1>`,
      "/router-preflight-away": () => html`<h1>raw away</h1>`,
    },
    { viewTransitions: false },
  );
  const guarded = routes({
    "/router-preflight-dispose": page({
      guard: (ctx) => {
        ctx.signal.addEventListener("abort", () => raw.dispose(), {
          once: true,
        });
        return new Promise((resolve) => transactions.push({ ctx, resolve }));
      },
      view: () => html`<h1>guarded current</h1>`,
    }),
    "/router-preflight-away": page({ view: () => html`<h1>away</h1>` }),
  });
  let current;
  const stop = effect(() => {
    current = guarded.view();
  });

  await tick();
  raw.navigate("/router-preflight-away");
  assert.equal(transactions[0].ctx.signal.aborted, true);
  assert.equal(fakeLocation.pathname, "/router-preflight-dispose");

  await tick();
  assert.equal(transactions.length, 2);
  assert.equal(transactions[1].ctx.path, "/router-preflight-dispose");
  transactions[0].resolve({ redirect: "/router-preflight-stale" });
  transactions[1].resolve(true);
  await tick();
  assert.equal(fakeLocation.pathname, "/router-preflight-dispose");
  assert.match(textOf(current), /guarded current/);

  stop();
  guarded.dispose();
});

test("same-URL popstate restores authority after cancelling a delayed write", async () => {
  setUrl("/same-url-pop-current");
  const transactions = [];
  let applyTransition;
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    applyTransition = apply;
    return { ready: Promise.resolve() };
  };
  try {
    const raw = router({
      "/same-url-pop-current": () => html`<h1>raw current</h1>`,
      "/same-url-pop-away": () => html`<h1>raw away</h1>`,
    });
    const guarded = routes({
      "/same-url-pop-current": page({
        guard: (ctx) =>
          new Promise((resolve) => transactions.push({ ctx, resolve })),
        view: () => html`<h1>guarded current</h1>`,
      }),
      "/same-url-pop-away": page({ view: () => html`<h1>away</h1>` }),
    });
    let current;
    const stop = effect(() => {
      current = guarded.view();
    });

    await tick();
    raw.navigate("/same-url-pop-away");
    assert.equal(transactions[0].ctx.signal.aborted, true);
    assert.equal(fakeLocation.pathname, "/same-url-pop-current");

    fakeWindow.dispatchEvent(new PopStateEvent("popstate"));
    await tick();
    assert.equal(transactions.length, 2);
    assert.equal(transactions[1].ctx.path, "/same-url-pop-current");

    applyTransition();
    transactions[0].resolve({ redirect: "/same-url-pop-stale" });
    transactions[1].resolve(true);
    await tick();
    assert.equal(fakeLocation.pathname, "/same-url-pop-current");
    assert.match(textOf(current), /guarded current/);
    stop();
    raw.dispose();
    guarded.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("delayed query navigation invalidates the old guard before its URL commits", async () => {
  setUrl("/query-transition?scope=one");
  const transitions = [];
  const transactions = [];
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    transitions.push(apply);
    return { ready: Promise.resolve() };
  };
  try {
    const guarded = page({
      guard: (ctx) =>
        new Promise((resolve) => transactions.push({ ctx, resolve })),
      view: () => html`<h1>guarded query</h1>`,
    });
    const r = routes({ "/query-transition": guarded });
    let current;
    const stop = effect(() => {
      current = r.view();
    });

    await tick();
    r.navigate("/query-transition?scope=two");
    assert.equal(transactions[0].ctx.signal.aborted, true);
    assert.equal(fakeLocation.search, "?scope=one");

    transactions[0].resolve({ redirect: "/stale-query-transition" });
    await tick();
    assert.equal(fakeLocation.pathname, "/query-transition");
    assert.equal(fakeLocation.search, "?scope=one");

    transitions[0]();
    await tick();
    assert.equal(fakeLocation.search, "?scope=two");
    assert.equal(transactions.length, 2);
    assert.equal(transactions[1].ctx.path, "/query-transition?scope=two");
    transactions[1].resolve(true);
    await tick();
    assert.match(textOf(current), /guarded query/);
    stop();
    r.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("a newer same-current navigation restores guard authority after cancelling a delayed write", async () => {
  setUrl("/authority");
  const transitions = [];
  const transactions = [];
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    transitions.push(apply);
    return { ready: Promise.resolve() };
  };
  try {
    const guarded = page({
      guard: (ctx) =>
        new Promise((resolve) => transactions.push({ ctx, resolve })),
      view: () => html`<h1>authority</h1>`,
    });
    const r = routes({
      "/authority": guarded,
      "/away": page({ view: () => html`<h1>away</h1>` }),
    });
    let current;
    const stop = effect(() => {
      current = r.view();
    });

    await tick();
    r.navigate("/away");
    assert.equal(transactions[0].ctx.signal.aborted, true);
    r.navigate("/authority");
    await tick();
    assert.equal(transactions.length, 2);
    assert.equal(transactions[1].ctx.signal.aborted, false);

    transitions[0]();
    transitions[1]();
    assert.equal(fakeLocation.pathname, "/authority");
    transactions[0].resolve({ redirect: "/stale-authority" });
    transactions[1].resolve(true);
    await tick();
    assert.equal(fakeLocation.pathname, "/authority");
    assert.match(textOf(current), /authority/);
    stop();
    r.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("a synchronous query write restores authority after cancelling a delayed route write", async () => {
  setUrl("/scoped-authority?scope=one");
  fakeWindow.dispatchEvent(new PopStateEvent("popstate"));
  const scope = queryParam("scope");
  const transactions = [];
  const events = [];
  let applyAway;
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = (apply) => {
    applyAway = apply;
    return { ready: Promise.resolve() };
  };
  try {
    const guarded = page({
      guard: (ctx) =>
        new Promise((resolve) => transactions.push({ ctx, resolve })),
      view: ({ onDispose }) => {
        effect(() => events.push(`page:${scope()}`));
        onDispose(() => events.push("dispose"));
        return html`<h1>scoped authority</h1>`;
      },
    });
    const r = routes({
      "/scoped-authority": guarded,
      "/away": page({ view: () => html`<h1>away</h1>` }),
    });
    let current;
    const stop = effect(() => {
      current = r.view();
    });

    await tick();
    transactions[0].resolve(true);
    await tick();
    assert.match(textOf(current), /scoped authority/);
    assert.deepEqual(events, ["page:one"]);

    r.navigate("/away");
    assert.equal(transactions[0].ctx.signal.aborted, true);
    scope.set("two", { push: true });
    await tick();
    assert.equal(fakeLocation.search, "?scope=two");
    assert.equal(transactions.length, 2);
    assert.deepEqual(events, ["page:one", "dispose"]);
    assert.equal(events.includes("page:two"), false);

    applyAway();
    assert.equal(
      fakeLocation.pathname,
      "/scoped-authority",
      "the superseded delayed write cannot replace the recovered route",
    );
    transactions[1].resolve(true);
    await tick();
    assert.match(textOf(current), /scoped authority/);
    assert.deepEqual(events, ["page:one", "dispose", "page:two"]);
    stop();
    r.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("a queued old-page effect cannot observe a new guarded query identity", async () => {
  setUrl("/queued-scope?scope=one");
  fakeWindow.dispatchEvent(new PopStateEvent("popstate"));
  const scope = queryParam("scope");
  const trigger = signal(0);
  const transactions = [];
  const events = [];
  const guarded = page({
    guard: (ctx) =>
      new Promise((resolve) => transactions.push({ ctx, resolve })),
    view: ({ onDispose }) => {
      effect(() => events.push(`page:${scope()}:${trigger()}`));
      onDispose(() => events.push("dispose"));
      return html`<h1>queued scope</h1>`;
    },
  });
  const r = routes({ "/queued-scope": guarded });
  let current;
  const stop = effect(() => {
    current = r.view();
  });

  await tick();
  transactions[0].resolve(true);
  await tick();
  assert.match(textOf(current), /queued scope/);
  assert.deepEqual(events, ["page:one:0"]);

  trigger.set(1);
  scope.set("two", { push: true });
  await tick();
  assert.equal(transactions.length, 2);
  assert.equal(
    events.some((event) => event.startsWith("page:two:")),
    false,
  );
  assert.equal(events.at(-1), "dispose");

  transactions[1].resolve({ halt: true });
  await tick();
  stop();
  r.dispose();
});

test("a cached destination page starts with the destination query identity", async () => {
  setUrl("/cached-query-target?scope=warm");
  fakeWindow.dispatchEvent(new PopStateEvent("popstate"));
  const scope = queryParam("scope");
  const targetReads = [];
  const target = page({
    view: () => {
      targetReads.push(scope());
      return html`<h1>cached target</h1>`;
    },
  });
  const source = page({ view: () => html`<h1>source</h1>` });
  const r = routes({
    "/cached-query-target": target,
    "/cached-query-source": source,
  });
  let current;
  const stop = effect(() => {
    current = r.view();
  });

  await tick();
  assert.match(textOf(current), /cached target/);
  assert.deepEqual(targetReads, ["warm"]);

  r.navigate("/cached-query-source?scope=one");
  await tick();
  assert.match(textOf(current), /source/);
  targetReads.length = 0;

  r.navigate("/cached-query-target?scope=two");
  await tick();
  assert.match(textOf(current), /cached target/);
  assert.deepEqual(
    targetReads,
    ["two"],
    "cached setup observes the same query identity as the committed pathname",
  );

  stop();
  r.dispose();
});

test("a guard abort listener can supersede global navigation and query writes", async () => {
  for (const mode of ["navigate", "query"]) {
    setUrl(`/abort-reentrant-${mode}?scope=one`);
    fakeWindow.dispatchEvent(new PopStateEvent("popstate"));
    const scope = queryParam("scope");
    let settle;
    const current = page({
      guard: ({ signal }) => {
        signal.addEventListener(
          "abort",
          () => navigate(`/abort-winner-${mode}`),
          { once: true },
        );
        return new Promise((resolve) => {
          settle = resolve;
        });
      },
      view: () => html`<h1>current</h1>`,
    });
    const r = routes({
      [`/abort-reentrant-${mode}`]: current,
      [`/abort-outer-${mode}`]: page({ view: () => html`<h1>outer</h1>` }),
      [`/abort-winner-${mode}`]: page({ view: () => html`<h1>winner</h1>` }),
    });

    void r.view();
    await tick();
    if (mode === "navigate") navigate(`/abort-outer-${mode}`);
    else scope.set("two", { push: true });
    assert.equal(fakeLocation.pathname, `/abort-winner-${mode}`);
    assert.equal(fakeLocation.search, "");
    settle({ redirect: `/abort-stale-${mode}` });
    await tick();
    assert.equal(fakeLocation.pathname, `/abort-winner-${mode}`);
    r.dispose();
  }
});

test("failed global History writes restore the unchanged route authority", async () => {
  for (const mode of ["navigate", "query"]) {
    setUrl(`/history-failure-${mode}?scope=one`);
    fakeWindow.dispatchEvent(new PopStateEvent("popstate"));
    const scope = queryParam("scope");
    const transactions = [];
    const guarded = page({
      guard: (ctx) =>
        new Promise((resolve) => transactions.push({ ctx, resolve })),
      view: () => html`<h1>history current</h1>`,
    });
    const r = routes({
      [`/history-failure-${mode}`]: guarded,
      [`/history-away-${mode}`]: page({ view: () => html`<h1>away</h1>` }),
    });
    const stop = effect(() => {
      void r.view();
    });
    await tick();

    const method = mode === "navigate" ? "pushState" : "replaceState";
    const originalWrite = fakeHistory[method];
    fakeHistory[method] = () => {
      throw new Error("history denied");
    };
    try {
      assert.throws(
        () => {
          if (mode === "navigate") navigate(`/history-away-${mode}`);
          else scope.set("two");
        },
        /history denied/,
      );
    } finally {
      fakeHistory[method] = originalWrite;
    }

    await tick();
    assert.equal(fakeLocation.pathname, `/history-failure-${mode}`);
    assert.equal(fakeLocation.search, "?scope=one");
    assert.equal(transactions[0].ctx.signal.aborted, true);
    assert.equal(transactions.length, 2);
    assert.equal(transactions[1].ctx.signal.aborted, false);
    transactions[0].resolve({ redirect: `/history-stale-${mode}` });
    transactions[1].resolve(true);
    await tick();
    assert.equal(fakeLocation.pathname, `/history-failure-${mode}`);
    stop();
    r.dispose();
  }
});

test("normalized same-route navigation does not strand the active guard", async () => {
  setUrl("/normalized-slow");
  let transaction;
  const guarded = page({
    guard: (ctx) =>
      new Promise((resolve) => {
        transaction = { ctx, resolve };
      }),
    view: () => html`<h1>normalized</h1>`,
  });
  const r = routes({ "/normalized-slow": guarded });

  const pending = r.view();
  await tick();
  r.navigate("/nested/../normalized-slow");
  assert.equal(fakeLocation.pathname, "/normalized-slow");
  assert.equal(transaction.ctx.signal.aborted, false);
  transaction.resolve(true);
  await tick();
  assert.match(textOf(pending), /normalized/);
  r.dispose();
});

test("different-path navigation aborts before a ViewTransition applies the URL", async () => {
  setUrl("/slow-transition");
  let signal;
  let settleGuard;
  const previousStartViewTransition = document.startViewTransition;
  document.startViewTransition = () => ({ ready: Promise.resolve() });
  try {
    const guarded = page({
      guard: (ctx) => {
        signal = ctx.signal;
        return new Promise((resolve) => {
          settleGuard = resolve;
        });
      },
      view: () => html`<h1>never</h1>`,
    });
    const r = routes({
      "/slow-transition": guarded,
      "/after-transition": page({ view: () => html`<h1>after</h1>` }),
    });

    void r.view();
    await tick();
    r.navigate("/after-transition");
    assert.equal(signal.aborted, true);
    assert.equal(
      fakeLocation.pathname,
      "/slow-transition",
      "the transition callback has deliberately not applied the URL yet",
    );

    settleGuard(true);
    await tick();
    assert.equal(fakeLocation.pathname, "/slow-transition");
    r.dispose();
  } finally {
    if (previousStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = previousStartViewTransition;
    }
  }
});

test("global navigate() aborts the active manifest guard", async () => {
  setUrl("/slow-global");
  let signal;
  let settleGuard;
  const slow = page({
    guard: (ctx) => {
      signal = ctx.signal;
      return new Promise((resolve) => {
        settleGuard = resolve;
      });
    },
    view: () => html`<h1>slow</h1>`,
  });
  const other = page({ view: () => html`<h1>other</h1>` });
  const r = routes({ "/slow-global": slow, "/other-global": other });

  void r.view();
  await tick();
  navigate("/other-global");
  assert.equal(signal.aborted, true, "popstate cancellation is synchronous");
  void r.view();
  settleGuard({ redirect: "/stale-global" });
  await tick();
  assert.equal(fakeLocation.pathname, "/other-global");
  r.dispose();
});

test("dispose aborts a pending guard and makes an ignored abort verdict stale", async () => {
  setUrl("/slow-dispose");
  let signal;
  let settleGuard;
  const guarded = page({
    guard: (ctx) => {
      signal = ctx.signal;
      return new Promise((resolve) => {
        settleGuard = resolve;
      });
    },
    view: () => html`<h1>never</h1>`,
  });
  const r = routes({ "/slow-dispose": guarded });

  void r.view();
  await tick();
  r.dispose();
  assert.equal(signal.aborted, true);
  settleGuard({ redirect: "/after-dispose" });
  await tick();
  assert.equal(fakeLocation.pathname, "/slow-dispose");
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

test("navigation disposes the old page before an async guard settles", async () => {
  setUrl("/from");
  let disposed = 0;
  let settleGuard;
  const from = page({
    view: ({ onDispose }) => {
      onDispose(() => disposed++);
      return html`<h1>from</h1>`;
    },
  });
  const blocked = page({
    guard: () => new Promise((resolve) => { settleGuard = resolve; }),
    view: () => html`<h1>blocked</h1>`,
  });
  const r = routes({ "/from": from, "/blocked": blocked }, { loadingDelay: 0 });

  const initial = r.view();
  await tick();
  textOf(initial);
  assert.equal(disposed, 0);

  r.navigate("/blocked");
  const pending = r.view();
  assert.equal(disposed, 1, "old page is disposed at navigation start");
  await tick();
  assert.equal(typeof settleGuard, "function");
  settleGuard({ halt: true });
  await tick();
  assert.equal(textOf(pending), "", "halt removes an immediate loading view");
  r.dispose();
});

test("cached pages with async page guards take the async path", async () => {
  setUrl("/guarded");
  let guardCalls = 0;
  const guarded = page({
    guard: async () => {
      guardCalls++;
      await Promise.resolve();
    },
    view: () => html`<h1>guarded ready</h1>`,
  });
  const other = page({ view: () => html`<h1>other</h1>` });
  const r = routes({ "/guarded": guarded, "/other": other });

  let view = r.view();
  await tick();
  assert.match(textOf(view), /guarded ready/);
  r.navigate("/other");
  view = r.view();
  await tick();
  textOf(view);
  r.navigate("/guarded");
  view = r.view();
  await tick();
  assert.match(textOf(view), /guarded ready/);
  assert.equal(guardCalls, 2);
  r.dispose();
});
