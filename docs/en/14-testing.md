# Testing

Mado projects are plain TypeScript and browser APIs, so tests should stay plain
too. The framework repository uses Node's built-in test runner plus `linkedom`
for DOM tests.

## Commands

```bash
npm run typecheck
npm run build
npm test
```

Before publishing or merging a release branch, run all three.

## Unit tests with DOM

```js
import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;

const { html, render } = await import("../dist/src/html.js");

test("renders a value", () => {
  const root = document.createElement("div");
  render(html`<p>${"hello"}</p>`, root);
  assert.equal(root.querySelector("p").textContent, "hello");
});
```

Build first, then import from `dist/`. This tests the same files the browser
will load.

## What to cover

Test behavior, not internal implementation details:

- signal/computed scheduling and cleanup;
- template binding edges: child values, attributes, events, directives;
- route guards, redirects, scroll/focus behavior, error boundaries;
- forms: validation, async validation races, field arrays;
- resources/mutations: cache keys, invalidation, lifecycle cleanup;
- CLI flows: `mado release`, `mado bake`, `mado preview`.

## Browser smoke tests

Use Playwright or another browser runner for flows that require real layout,
focus, navigation or custom-element lifecycle. Keep them small:

1. start the app;
2. visit one route;
3. click one link or submit one form;
4. assert the user-visible result.

Most regression tests should still be fast Node tests.

## Test data

Keep API data in local fixtures or tiny in-memory fake clients. Do not call real
services from framework tests. For app tests, make the API client injectable via
`createContext()` so pages can run against a fake client.

## Release checklist

```bash
npm run typecheck
npm run build
npm test
npm run bake
```

`mado release` runs the production path for an app: typecheck, Vite build,
bake, compression and deploy helper files. In the framework repository,
`npm run build` still emits `dist/src` for package tests and publishing.
