// Unit tests for the runtime base-path helpers.
//
// These exercise the pure routeUrl/withBase/stripBase paths against a
// non-trivial base ("/mado/"). They run without a DOM: they import the
// already-compiled module from `dist/src/router/base.js`, which reads
// `import.meta.env.BASE_URL` once via a try/catch — outside Vite the
// value is undefined and the helpers fall back to "/". The tests below
// pass an explicit base argument to avoid relying on the env.

import test from "node:test";
import assert from "node:assert/strict";

const { routeUrl, normalizeBase, withBase, stripBase } = await import(
  "../../dist/src/router/base.js"
);

const BASE = "/mado/";

test("normalizeBase canonicalises arbitrary inputs", () => {
  assert.equal(normalizeBase(undefined), "/");
  assert.equal(normalizeBase(null), "/");
  assert.equal(normalizeBase(""), "/");
  assert.equal(normalizeBase("/"), "/");
  assert.equal(normalizeBase("mado"), "/mado/");
  assert.equal(normalizeBase("/mado"), "/mado/");
  assert.equal(normalizeBase("/mado/"), "/mado/");
  assert.equal(normalizeBase("//x//y/"), "/x/y/");
});

test("withBase keeps the trailing slash for the root route", () => {
  // Regression: previously `withBase("/", "/mado/")` returned "/mado",
  // contradicting the documented contract that the root route under a
  // non-trivial base preserves the trailing slash. The browser, Vite
  // and the static snapshot pipeline all canonicalise on the trailing
  // form, so `<a href>` values must agree.
  assert.equal(withBase("/", BASE), "/mado/");
  assert.equal(withBase("", BASE), "/mado/");
});

test("withBase prefixes route paths", () => {
  assert.equal(withBase("/docs", BASE), "/mado/docs");
  assert.equal(withBase("docs", BASE), "/mado/docs");
  assert.equal(withBase("/docs/", BASE), "/mado/docs/");
});

test("withBase is idempotent on already-prefixed paths", () => {
  assert.equal(withBase("/mado/docs", BASE), "/mado/docs");
  assert.equal(withBase("/mado", BASE), "/mado");
  assert.equal(withBase("/mado/", BASE), "/mado/");
});

test("routeUrl returns base + slash for the root route", () => {
  assert.equal(routeUrl("/", BASE), "/mado/");
  assert.equal(routeUrl("", BASE), "/mado/");
  assert.equal(routeUrl("/", "/"), "/");
});

test("routeUrl preserves query and hash", () => {
  assert.equal(routeUrl("/docs?q=1", BASE), "/mado/docs?q=1");
  assert.equal(routeUrl("/docs#h", BASE), "/mado/docs#h");
  assert.equal(routeUrl("/docs?q=1#h", BASE), "/mado/docs?q=1#h");
});

test("stripBase removes the active prefix", () => {
  assert.equal(stripBase("/mado/", BASE), "/");
  assert.equal(stripBase("/mado", BASE), "/");
  assert.equal(stripBase("/mado/docs", BASE), "/docs");
  assert.equal(stripBase("/mado/docs/", BASE), "/docs/");
  // Foreign paths fall through unchanged.
  assert.equal(stripBase("/other", BASE), "/other");
});

test("stripBase is a no-op when the base is /", () => {
  assert.equal(stripBase("/", "/"), "/");
  assert.equal(stripBase("/docs", "/"), "/docs");
  assert.equal(stripBase("", "/"), "/");
});