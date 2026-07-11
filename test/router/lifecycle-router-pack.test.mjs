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
const { html, render } = await import("../../dist/src/html/template.js");
const { page } = await import("../../dist/src/page.js");


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
