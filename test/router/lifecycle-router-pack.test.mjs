// C8 — lifecycle / router defect pack (FABLE_REPORT.md finding #9).
//
// C8.1 lifecycle: onDispose() registered AFTER dispose() was silently dropped,
//      so async page cleanup that resolves post-navigation never ran. It must
//      run immediately when the lifecycle is already disposed (Solid/Vue).
// C8.2 router: the a[data-link] click interceptor ignored target="_blank" and
//      download, hijacking intentional "open in new tab"/"download" links.
// C8.3 router: same-path #hash navigation updated the URL but never scrolled.
// C8.4 routes: mutually-redirecting guards had no loop detector.
//
import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);
// Minimal location/history stubs — linkedom does not provide them, and the
// router reads location.pathname and uses the History API on construction.
const loc = {
  origin: "https://app.test",
  pathname: "/",
  search: "",
  hash: "",
  get href() {
    return this.origin + this.pathname + this.search + this.hash;
  },
};

const hist = {
  scrollRestoration: "auto",
  pushState(_s, _t, to) {
    applyUrl(to);
  },
  replaceState(_s, _t, to) {
    applyUrl(to);
  },
};
function applyUrl(to) {
  if (typeof to !== "string") return;
  const u = new URL(to, loc.origin);
  loc.pathname = u.pathname;
  loc.search = u.search;
  loc.hash = u.hash;
}

globalThis.window = w;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.HTMLElement = w.HTMLElement ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.URL = URL;
globalThis.location = loc;
w.location = loc;
globalThis.history = hist;
w.history = hist;
globalThis.PopStateEvent = w.PopStateEvent ?? w.Event;
w.addEventListener?.("popstate", () => {});


const { createLifecycle } = await import("../../dist/src/lifecycle.js");
const { routes } = await import("../../dist/src/router/manifest.js");
const { router } = await import("../../dist/src/router/navigation.js");
const { html, render, unmount } = await import("../../dist/src/html/template.js");
const { ref } = await import("../../dist/src/html/bindings.js");
const { page } = await import("../../dist/src/page.js");
const { effect, signal, flushSync } = await import("../../dist/src/signal.js");


test("C8.1: onDispose after dispose() runs the callback immediately", () => {
  const lc = createLifecycle();
  lc.dispose();

  let ran = 0;
  lc.onDispose(() => {
    ran++;
  });
  assert.equal(
    ran,
    1,
    "a cleanup registered after dispose() must run immediately, not be dropped",
  );
});

test("C8.1: onDispose before dispose() still runs once on dispose()", () => {
  const lc = createLifecycle();
  let ran = 0;
  lc.onDispose(() => {
    ran++;
  });
  assert.equal(ran, 0, "not called before dispose()");
  lc.dispose();
  assert.equal(ran, 1, "called once on dispose()");
  lc.dispose();
  assert.equal(ran, 1, "not called again on a second dispose()");
});

test("C8.2: data-link with target=_blank is not hijacked by the router", () => {
  const r = router({ "/": () => html`<p>home</p>`, "*": () => html`<p>x</p>` });
  try {
    const a = document.createElement("a");
    a.setAttribute("data-link", "");
    a.setAttribute("href", "/other");
    a.setAttribute("target", "_blank");
    document.body.appendChild(a);

    let defaultPrevented = false;
    const evt = {
      type: "click",
      target: a,
      button: 0,
      defaultPrevented: false,
      composedPath: () => [a],
      preventDefault() {
        defaultPrevented = true;
      },
    };
    // Drive the document click listener directly (linkedom dispatch is limited).
    document.dispatchEvent(Object.assign(new w.Event("click"), evt));

    assert.equal(
      defaultPrevented,
      false,
      "target=_blank link must keep its native open-in-new-tab behaviour",
    );

  } finally {
    r.dispose();
    document.body.innerHTML = "";
  }
});

test("C8.2: data-link with download is not hijacked by the router", () => {
  const r = router({ "/": () => html`<p>home</p>`, "*": () => html`<p>x</p>` });
  try {
    const a = document.createElement("a");
    a.setAttribute("data-link", "");
    a.setAttribute("href", "/file.pdf");
    a.setAttribute("download", "");
    document.body.appendChild(a);

    let defaultPrevented = false;
    const evt = {
      type: "click",
      target: a,
      button: 0,
      defaultPrevented: false,
      composedPath: () => [a],
      preventDefault() {
        defaultPrevented = true;
      },
    };
    document.dispatchEvent(Object.assign(new w.Event("click"), evt));

    assert.equal(
      defaultPrevented,
      false,
      "download link must keep its native download behaviour",
    );
  } finally {
    r.dispose();
    document.body.innerHTML = "";
  }
});

test("C8.3: navigating to the same path with a new #hash scrolls to the anchor", async () => {
  loc.pathname = "/docs";
  loc.search = "";
  loc.hash = "";

  const r = router({ "*": () => html`<p>docs</p>` });
  try {
    const section = document.createElement("section");
    section.setAttribute("id", "intro");
    let scrolled = 0;
    section.scrollIntoView = () => {
      scrolled++;
    };
    document.body.appendChild(section);

    // Same pathname, only the hash changes — signal dedup would swallow this,
    // leaving the anchor unscrolled. The fix must still scroll to the target.
    r.navigate("/docs#intro");
    await Promise.resolve();
    await Promise.resolve();

    assert.ok(
      scrolled >= 1,
      "same-path hash navigation must scroll to the #hash target",
    );
  } finally {
    r.dispose();
    document.body.innerHTML = "";
    loc.hash = "";
  }
});

test("C8.4: mutually-redirecting guards are halted by a loop detector", async () => {
  loc.pathname = "/admin";
  loc.search = "";
  loc.hash = "";

  const app = document.createElement("main");
  document.body.appendChild(app);
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => {
    errors.push(args.join(" "));
  };

  const r = routes(
    {
      "/admin": page({
        guard: () => ({ redirect: "/login" }),
        view: () => html`<h1>admin</h1>`,
      }),
      "/login": page({
        guard: () => ({ redirect: "/admin" }),
        view: () => html`<h1>login</h1>`,
      }),
    },
    { loadingDelay: 0 },
  );

  try {
    render(html`${r.view}`, app);
    for (let i = 0; i < 120; i++) await Promise.resolve();

    assert.ok(
      errors.some((msg) => msg.includes("guard redirect loop detected")),
      "guard redirect loops must be reported and halted",
    );
  } finally {
    console.error = originalError;
    r.dispose();
    document.body.innerHTML = "";
    loc.pathname = "/";
    loc.search = "";
    loc.hash = "";
  }
});

test("router view tracks path without tracking incidental handler reads", () => {
  loc.pathname = "/";
  loc.search = "";
  loc.hash = "";

  const incidental = signal("initial");
  let homeCalls = 0;
  let nextCalls = 0;
  const app = document.createElement("main");
  document.body.appendChild(app);
  const r = router({
    "/": () => {
      homeCalls++;
      const snapshot = incidental();
      return html`<p>${snapshot}</p>`;
    },
    "/next": () => {
      nextCalls++;
      return html`<p>next</p>`;
    },
  });

  try {
    render(html`${r.view}`, app);
    assert.equal(homeCalls, 1);
    assert.equal(app.textContent, "initial");

    incidental.set("changed");
    flushSync();
    assert.equal(
      homeCalls,
      1,
      "a direct handler read must not subscribe the whole router view",
    );
    assert.equal(app.textContent, "initial");

    r.navigate("/next");
    flushSync();
    assert.equal(nextCalls, 1, "the path signal must remain tracked");
    assert.equal(app.textContent, "next");
  } finally {
    r.dispose();
    document.body.innerHTML = "";
    loc.pathname = "/";
    loc.search = "";
    loc.hash = "";
  }
});

test("page view incidental reads do not rerun it; template slots stay reactive", async () => {
  loc.pathname = "/";
  loc.search = "";
  loc.hash = "";

  const status = signal("idle");
  let viewCalls = 0;
  let pollCalls = 0;
  const poll = async () => {
    pollCalls++;
    // This synchronous read used to require untracked() because page.view()
    // inherited the router binding's tracker.
    status();
    await Promise.resolve();
  };
  const app = document.createElement("main");
  document.body.appendChild(app);
  const r = routes(
    {
      "/": page({
        view: () => {
          viewCalls++;
          void poll();
          return html`<p>${status}</p>`;
        },
      }),
    },
    { loadingDelay: 0 },
  );

  try {
    render(html`${r.view}`, app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();

    assert.equal(viewCalls, 1);
    assert.equal(pollCalls, 1);
    assert.equal(app.textContent, "idle");

    status.set("ready");
    flushSync();
    await Promise.resolve();

    assert.equal(
      viewCalls,
      1,
      "an incidental page setup read must not rerun page.view()",
    );
    assert.equal(pollCalls, 1, "user code no longer needs untracked() here");
    assert.equal(
      app.textContent,
      "ready",
      "the signal passed as a template slot remains reactive",
    );
  } finally {
    r.dispose();
    document.body.innerHTML = "";
    loc.pathname = "/";
    loc.search = "";
    loc.hash = "";
  }
});

test("page lifecycle rolls back when its template ref commit fails", async () => {
  const source = signal(0);
  let effectRuns = 0;
  let effectCleanups = 0;
  let pageCleanups = 0;

  const broken = page({
    view: ({ onDispose }) => {
      onDispose(() => pageCleanups++);
      effect(() => {
        source();
        effectRuns++;
        return () => effectCleanups++;
      });
      return html`
        <main
          ref=${ref((element) => {
            if (element) throw new Error("page ref commit failed");
          })}
        >
          broken
        </main>
      `;
    },
  });
  const r = routes(
    { "/": broken, "*": broken },
    {
      loadingDelay: 0,
      viewTransitions: false,
      scrollRestoration: false,
      focusManagement: false,
    },
  );
  const app = document.createElement("div");
  document.body.append(app);

  try {
    // Warm the eager route cache without mounting its idle TemplateResult so
    // the next view enters the synchronous page/commit path.
    void r.view();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.throws(
      () => render(html`${r.view}`, app),
      /page ref commit failed/,
    );
    assert.equal(app.childNodes.length, 0, "failed root commit rolls DOM back");
    assert.equal(pageCleanups, 1, "failed commit releases the page lifecycle");
    assert.equal(effectCleanups, 1, "lifecycle-owned effects are disposed");

    source.set(1);
    flushSync();
    assert.equal(effectRuns, 1, "an invisible failed page has no live effect");

    // All later ownership paths see the same already-disposed lifecycle.
    unmount(app);
    r.navigate("/after-failure");
    void r.view();
    r.dispose();
    r.dispose();
    assert.equal(pageCleanups, 1);
    assert.equal(effectCleanups, 1);
  } finally {
    r.dispose();
    unmount(app);
    app.remove();
    loc.pathname = "/";
    loc.search = "";
    loc.hash = "";
  }
});

test("root unmount releases the mounted page lifecycle without router dispose", async () => {
  const source = signal(0);
  let effectRuns = 0;
  let effectCleanups = 0;
  let pageCleanups = 0;

  const home = page({
    view: ({ onDispose }) => {
      onDispose(() => pageCleanups++);
      effect(() => {
        source();
        effectRuns++;
        return () => effectCleanups++;
      });
      return html`<main>mounted</main>`;
    },
  });
  const r = routes(
    { "/": home, "*": home },
    {
      loadingDelay: 0,
      viewTransitions: false,
      scrollRestoration: false,
      focusManagement: false,
    },
  );
  const app = document.createElement("div");
  document.body.append(app);

  try {
    void r.view();
    await new Promise((resolve) => setTimeout(resolve, 0));
    render(html`${r.view}`, app);

    assert.equal(effectRuns, 1);
    assert.equal(pageCleanups, 0);
    unmount(app);
    assert.equal(pageCleanups, 1);
    assert.equal(effectCleanups, 1);

    source.set(1);
    flushSync();
    assert.equal(effectRuns, 1, "unmounted page effects stay disposed");

    r.navigate("/after-unmount");
    void r.view();
    r.dispose();
    r.dispose();
    assert.equal(pageCleanups, 1, "navigation/dispose remain idempotent");
    assert.equal(effectCleanups, 1);
  } finally {
    r.dispose();
    unmount(app);
    app.remove();
    loc.pathname = "/";
    loc.search = "";
    loc.hash = "";
  }
});

test("same-template navigation transfers ownership to the latest page lifecycle", async () => {
  loc.pathname = "/a";
  loc.search = "";
  loc.hash = "";

  const source = signal(0);
  const cleanups = [];
  let effectRuns = 0;
  const sharedView = (label) => html`<main>${label}</main>`;
  const sharedPage = page({
    view: ({ params, onDispose }) => {
      onDispose(() => cleanups.push(params.id));
      effect(() => {
        source();
        effectRuns++;
      });
      return sharedView(params.id);
    },
  });
  const r = routes(
    { "/:id": sharedPage, "*": sharedPage },
    {
      loadingDelay: 0,
      viewTransitions: false,
      scrollRestoration: false,
      focusManagement: false,
    },
  );
  const app = document.createElement("div");
  document.body.append(app);

  try {
    render(html`${r.view}`, app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
    assert.equal(app.textContent, "a");
    assert.equal(effectRuns, 1);

    r.navigate("/b");
    flushSync();
    assert.equal(app.textContent, "b");
    assert.deepEqual(cleanups, ["a"]);
    assert.equal(effectRuns, 2);

    unmount(app);
    assert.deepEqual(
      cleanups,
      ["a", "b"],
      "root unmount releases the owner adopted by same-template reuse",
    );
    source.set(1);
    flushSync();
    assert.equal(effectRuns, 2);

    r.dispose();
    r.dispose();
    assert.deepEqual(cleanups, ["a", "b"]);
  } finally {
    r.dispose();
    unmount(app);
    app.remove();
    loc.pathname = "/";
    loc.search = "";
    loc.hash = "";
  }
});

test("sync metadata failure releases a page lifecycle whose view was discarded", async () => {
  const source = signal(0);
  let effectRuns = 0;
  let effectCleanups = 0;
  let pageCleanups = 0;
  const brokenTitle = page({
    title: () => {
      throw new Error("title failed");
    },
    view: ({ onDispose }) => {
      onDispose(() => pageCleanups++);
      effect(() => {
        source();
        effectRuns++;
        return () => effectCleanups++;
      });
      return html`<main>never committed</main>`;
    },
  });
  const r = routes(
    { "/": brokenTitle, "*": brokenTitle },
    {
      loadingDelay: 0,
      viewTransitions: false,
      scrollRestoration: false,
      focusManagement: false,
    },
  );
  const app = document.createElement("div");
  document.body.append(app);

  try {
    // Cache the eager page through the cold path. Metadata fails before its
    // view is evaluated there; the mounted call below exercises sync order.
    void r.view();
    await new Promise((resolve) => setTimeout(resolve, 0));
    render(html`${r.view}`, app);

    assert.match(app.textContent, /title failed/);
    assert.equal(effectRuns, 1);
    assert.equal(effectCleanups, 1);
    assert.equal(pageCleanups, 1);

    source.set(1);
    flushSync();
    assert.equal(effectRuns, 1, "discarded view effects do not survive");

    unmount(app);
    r.dispose();
    r.dispose();
    assert.equal(effectCleanups, 1);
    assert.equal(pageCleanups, 1);
  } finally {
    r.dispose();
    unmount(app);
    app.remove();
    loc.pathname = "/";
    loc.search = "";
    loc.hash = "";
  }
});
