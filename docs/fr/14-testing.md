# Tests

Mado utilise TypeScript et les APIs du navigateur. Le dépôt du framework teste
avec le test runner de Node et `linkedom`.

```bash
npm run typecheck
npm run build
npm test
```

Un test DOM minimal :

```js
import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;

const { html, render } = await import("../dist/src/html/template.js");

test("renders", () => {
  const root = document.createElement("div");
  render(html`<p>${"hello"}</p>`, root);
  assert.equal(root.querySelector("p").textContent, "hello");
});
```

À couvrir :

- signals/computed/effect : scheduling et nettoyage ;
- bindings HTML : children, attributs, événements, directives ;
- routes : guards, redirects, scroll/focus, error boundaries ;
- formulaires : validation sync/async, races, field arrays ;
- resources/mutations : clés de cache, invalidation, lifecycle ;
- CLI : `mado release`, `mado bake`, `mado preview`.
