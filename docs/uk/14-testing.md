# Тестування

Mado — це TypeScript і browser APIs. У репозиторії фреймворка тести йдуть через
Node test runner та `linkedom`.

```bash
npm run typecheck
npm run build
npm test
```

DOM-тест:

```js
import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = window.document;

const { html, render } = await import("../dist/src/html.js");

test("renders", () => {
  const root = document.createElement("div");
  render(html`<p>${"hello"}</p>`, root);
  assert.equal(root.querySelector("p").textContent, "hello");
});
```

Покривай signals/computed/effect, HTML bindings, guards/redirects, scroll/focus,
error boundaries, forms, resources/mutations і CLI-команди `mado release`,
`mado bake`, `mado preview`.
