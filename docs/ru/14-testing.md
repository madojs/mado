# Тестирование

Mado — это обычный TypeScript и browser APIs. В репозитории фреймворка тесты
идут через Node test runner и `linkedom`.

## Команды

```bash
npm run typecheck
npm run build
npm test
```

Перед merge/release прогоняй все три.

## DOM-тест

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

Сначала `npm run build`, потом импорт из `dist/`.

## Что покрывать

- signals/computed/effect: scheduling и cleanup;
- template bindings: children, attrs, events, directives;
- routes: guards, redirects, scroll/focus, error boundaries;
- forms: sync/async validation, races, field arrays;
- resources/mutations: cache keys, invalidation, lifecycle cleanup;
- CLI: `mado release`, `mado bake`, `mado preview`.

Для реального браузера оставляй маленькие smoke-тесты: открыть страницу,
кликнуть ссылку или отправить форму, проверить видимый результат.
