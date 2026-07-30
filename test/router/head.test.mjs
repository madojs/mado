// Tests for runtime <head> management.

import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");

function installDom(pathname = "/") {
  const { window: w } = parseHTML(
    "<!doctype html><html><head><title>App</title></head><body></body></html>",
  );
  const fakeLocation = {
    pathname,
    search: "",
    hash: "",
    origin: "http://localhost",
    href: `http://localhost${pathname}`,
  };

  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
  };
  globalThis.document = w.document;
  globalThis.Node = w.Node;
  globalThis.HTMLElement = w.HTMLElement ?? class {};
  globalThis.Comment = w.Comment ?? class {};
  globalThis.DocumentFragment = w.DocumentFragment ?? class {};
  globalThis.Element = w.Element ?? class {};
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
      const u = new URL(url, "http://localhost");
      fakeLocation.pathname = u.pathname;
      fakeLocation.search = u.search;
      fakeLocation.hash = u.hash;
      fakeLocation.href = u.href;
    },
  };
}

const { applyHead } = await import("../../dist/src/head.js");
const { routes } = await import("../../dist/src/router/manifest.js");
const { router } = await import("../../dist/src/router/navigation.js");
const { html } = await import("../../dist/src/html/template.js");
const { page } = await import("../../dist/src/page.js");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("applyHead({}) removes previous runtime and static head tags", () => {
  installDom("/");
  document.head.innerHTML = `
    <meta name="description" content="static" data-mado-head="static">
    <link rel="canonical" href="/old" data-mado-head="static">
    <meta name="robots" content="index">
  `;

  applyHead({
    title: "First",
    description: "first",
    canonical: "/first",
    jsonLd: { "@type": "Thing" },
  });
  assert.equal(document.head.querySelectorAll("[data-mado-head]").length, 3);

  applyHead({});
  assert.equal(document.head.querySelectorAll("[data-mado-head]").length, 0);
  assert.equal(
    document.head.querySelector('meta[name="robots"]')?.getAttribute("content"),
    "index",
    "unmarked app-authored head tags should stay intact",
  );
});

test("applyHead() replaces known singleton fallbacks from index.html", () => {
  installDom("/");
  document.head.innerHTML = `
    <meta name="description" content="shell">
    <link rel="canonical" href="/shell">
    <meta property="og:title" content="shell">
    <meta property="og:image" content="/shell.png">
    <meta name="twitter:title" content="shell">
  `;

  applyHead({
    description: "page",
    canonical: "/page",
    og: { title: "page og", image: "/page.png" },
    twitter: { title: "page twitter" },
  });

  for (const selector of [
    'meta[name="description" i]',
    'link[rel~="canonical" i]',
    'meta[property="og:title" i]',
    'meta[property="og:image" i]',
    'meta[name="twitter:title" i]',
  ]) {
    assert.equal(
      document.head.querySelectorAll(selector).length,
      1,
      `${selector} stays a singleton at runtime`,
    );
  }
  assert.equal(
    document.head
      .querySelector('meta[name="description"]')
      ?.getAttribute("content"),
    "page",
  );

  applyHead({});
  assert.equal(
    document.head.querySelectorAll(
      'meta[name="description"], link[rel~="canonical" i], ' +
        'meta[property="og:title"], meta[property="og:image"], ' +
        'meta[name="twitter:title"]',
    ).length,
    0,
    "removed shell fallbacks do not leak into a later headless page",
  );
});

test("applyHead() normalizes arbitrary canonical and og:url entries", () => {
  installDom("/docs");
  document.head.innerHTML = `
    <link rel="canonical" href="https://public.example/docs" data-mado-head="static">
    <meta property="og:url" content="https://public.example/docs" data-mado-head="static">
  `;

  applyHead({
    meta: [{ property: "OG:URL", content: "/declared" }],
    link: [{ rel: "alternate CANONICAL", href: "/declared" }],
  });

  assert.equal(
    document.head
      .querySelector('link[rel~="canonical" i]')
      ?.getAttribute("href"),
    "https://public.example/declared",
  );
  assert.equal(
    document.head
      .querySelector('meta[property="og:url" i]')
      ?.getAttribute("content"),
    "https://public.example/declared",
  );
});

test("applyHead() does not reuse an external canonical as the site origin", () => {
  installDom("/article");
  document.head.innerHTML = `
    <link rel="canonical" href="https://legacy.example/article" data-mado-head="static">
    <meta property="og:url" content="https://site.example/article" data-mado-head="static">
  `;

  applyHead({ canonical: "https://legacy.example/article" });
  applyHead({ canonical: "/next", og: { url: "/next" } });

  assert.equal(
    document.head
      .querySelector('link[rel~="canonical" i]')
      ?.getAttribute("href"),
    "https://site.example/next",
  );
  assert.equal(
    document.head
      .querySelector('meta[property="og:url" i]')
      ?.getAttribute("content"),
    "https://site.example/next",
  );
});

test("applyHead() escapes JSON-LD script terminators", () => {
  installDom("/");
  applyHead({
    jsonLd: {
      name: "</script><script>globalThis.PWNED=true</script>",
      separator: "\u2028",
    },
  });

  const script = document.head.querySelector('script[type="application/ld+json"]');
  assert.ok(script);
  assert.doesNotMatch(script.textContent, /<\/script>/i);
  assert.match(script.textContent, /\\u003C\/script\\u003E/);
  assert.match(script.textContent, /\\u2028/);
});

test("applyHead({}) removes static-fallback canonical and og:url markers", () => {
  // The static snapshot pipeline marks the fallback `<link rel=canonical>`
  // and `<meta property=og:url>` it injects with `data-mado-head="static"`
  // so that the first SPA navigation into a page without an explicit
  // head() removes them. Without that marker the previous canonical /
  // og:url would leak into pages that never declared one.
  installDom("/");
  document.head.innerHTML = `
    <link rel="canonical" href="https://example.test/products/foo" data-mado-head="static">
    <meta property="og:url" content="https://example.test/products/foo" data-mado-head="static">
  `;

  applyHead({});

  assert.equal(
    document.head.querySelector('link[rel="canonical"]'),
    null,
    "static canonical fallback must be cleared on SPA navigation to a page without its own canonical",
  );
  assert.equal(
    document.head.querySelector('meta[property="og:url"]'),
    null,
    "static og:url fallback must be cleared on SPA navigation to a page without its own og:url",
  );
});

test("applyHead({}) clears the generated SPA-shell noindex marker", () => {
  installDom("/app");
  document.head.innerHTML =
    '<meta name="robots" content="noindex" data-mado-head="static">';

  applyHead({});

  assert.equal(
    document.head.querySelector('meta[name="robots"]'),
    null,
    "SPA-shell noindex must not leak into later runtime navigation",
  );
});

test("routes(): static wildcard capture is claimed once and forces managed noindex", async () => {
  installDom("/__mado_static_not_found__");
  document.documentElement.setAttribute("data-mado-static-fallback", "");

  let dynamicCalls = 0;
  let fallbackCalls = 0;
  const appRoutes = routes(
    {
      "/:slug": page({
        view: () => {
          dynamicCalls++;
          return html`<h1>dynamic</h1>`;
        },
      }),
      "*": page({
        static: true,
        head: () => ({
          canonical: "/wrong",
          og: { url: "/wrong" },
          meta: [
            { name: "robots", content: "ALL follow" },
            { name: "ROBOTS", content: "index" },
            { property: "og:url", content: "/wrong-again" },
          ],
          link: [{ rel: "canonical", href: "/wrong-again" }],
        }),
        view: () => {
          fallbackCalls++;
          return html`<h1>fallback</h1>`;
        },
      }),
    },
    { loadingDelay: 0 },
  );

  try {
    appRoutes.view();
    await tick();
    appRoutes.view();
    assert.equal(dynamicCalls, 0);
    assert.equal(fallbackCalls, 1);
    assert.equal(
      document.documentElement.hasAttribute("data-mado-static-fallback"),
      false,
      "the application manifest consumes the capture marker",
    );
    assert.equal(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content"),
      "noindex, follow",
      "literal static wildcard pages receive managed noindex metadata",
    );
    assert.equal(
      document.head.querySelectorAll('meta[name="robots" i]').length,
      1,
      "all authored robots entries collapse into one forced singleton",
    );
    assert.equal(document.head.querySelector('link[rel~="canonical" i]'), null);
    assert.equal(document.head.querySelector('meta[property="og:url" i]'), null);

    let rawDynamicCalls = 0;
    let rawFallbackCalls = 0;
    const nested = router({
      "/:slug": () => {
        rawDynamicCalls++;
        return html`<p>nested dynamic</p>`;
      },
      "*": () => {
        rawFallbackCalls++;
        return html`<p>nested fallback</p>`;
      },
    });
    try {
      nested.view();
      assert.equal(rawDynamicCalls, 1);
      assert.equal(rawFallbackCalls, 0);
    } finally {
      nested.dispose();
    }
  } finally {
    appRoutes.dispose();
    document.documentElement.removeAttribute("data-mado-static-fallback");
  }
});

test("routes(): navigating to a page without head clears previous head tags", async () => {
  installDom("/");

  const withHead = page({
    head: () => ({ description: "with head", canonical: "/with" }),
    view: () => html`<h1>with</h1>`,
  });
  const plain = page({
    title: "Plain",
    view: () => html`<h1>plain</h1>`,
  });
  const r = routes({
    "/": withHead,
    "/plain": plain,
  });

  r.view();
  await tick();
  r.view();
  assert.equal(
    document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
    "with head",
  );

  r.navigate("/plain");
  r.view();
  await tick();
  r.view();

  assert.equal(document.head.querySelectorAll("[data-mado-head]").length, 0);
  assert.equal(document.title, "Plain");
  r.dispose();
});

test("routes(): head title honours suffix and untitled routes clear stale title", async () => {
  installDom("/");
  const titled = page({
    title: "Fallback",
    head: () => ({ title: "Head title" }),
    view: () => html`<h1>titled</h1>`,
  });
  const untitled = page({ view: () => html`<h1>untitled</h1>` });
  const r = routes({ "/": titled, "/plain": untitled }, { titleSuffix: " · Mado" });

  r.view();
  await tick();
  r.view();
  assert.equal(document.title, "Head title · Mado");

  r.navigate("/plain");
  r.view();
  await tick();
  r.view();
  assert.equal(document.title, "");
  r.dispose();
});
