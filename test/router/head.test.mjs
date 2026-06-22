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
