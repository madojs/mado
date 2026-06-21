// Tests for routes() error boundaries.

import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);

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
globalThis.history = fakeHistory;

const { routes } = await import("../../dist/src/router/manifest.js");
const { html } = await import("../../dist/src/html/template.js");
const { page } = await import("../../dist/src/page.js");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function textOf(tpl) {
  if (tpl == null || tpl === false || tpl === true) return "";
  if (typeof tpl === "string" || typeof tpl === "number") return String(tpl);
  if (typeof tpl === "function") return textOf(tpl());
  if (Array.isArray(tpl)) return tpl.map(textOf).join("");
  if (tpl._mado) {
    let out = "";
    for (let i = 0; i < tpl.strings.length; i++) {
      out += tpl.strings[i];
      if (i < tpl.values.length) out += textOf(tpl.values[i]);
    }
    return out;
  }
  return String(tpl);
}

test("routes(): errorPage handles lazy loader errors", async () => {
  setUrl("/broken");
  const r = routes(
    {
      "/broken": async () => {
        throw new Error("chunk failed");
      },
    },
    {
      loadingDelay: 0,
      errorPage: (err) => html`<x-error>${err.message}</x-error>`,
    },
  );

  const view = r.view();
  await tick();

  assert.match(textOf(view), /chunk failed/);
  r.dispose();
});

test("routes(): errorPage handles load/view errors when page has no local errorView", async () => {
  setUrl("/boom");
  const r = routes(
    {
      "/boom": page({
        view: () => {
          throw new Error("view failed");
        },
      }),
    },
    {
      errorPage: (err) => html`<x-error>${err.message}</x-error>`,
    },
  );

  const view = r.view();
  await tick();

  assert.match(textOf(view), /view failed/);
  r.dispose();
});

test("routes(): page.errorView wins over global errorPage", async () => {
  setUrl("/local");
  const r = routes(
    {
      "/local": page({
        view: () => {
          throw new Error("view failed");
        },
        errorView: (err) => html`<x-local>${err.message}</x-local>`,
      }),
    },
    {
      errorPage: () => html`<x-global>global</x-global>`,
    },
  );

  const view = r.view();
  await tick();

  assert.match(textOf(view), /view failed/);
  assert.doesNotMatch(textOf(view), /global/);
  r.dispose();
});
