# IDE-поддержка `html\`\`` и `css\`\``

Из коробки `html\`...\`` и `css\`...\`` — это просто tagged-template-строки. TypeScript их не знает, IDE их не подсвечивает. Это **сознательный компромисс** ради нулевых рантайм-зависимостей и отсутствия билд-плагинов.

Хорошая новость: Mado использует те же конвенции, что и [lit](https://lit.dev), поэтому работают **готовые** IDE-инструменты от lit-экосистемы.

---

## VS Code (рекомендованный сетап)

### 1. Установить [lit-plugin](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin)

VS Code → Extensions → найти **"lit-plugin"** (от runem) → Install.

Что появится:

- Подсветка HTML внутри `html\`\``.
- Подсветка CSS внутри `css\`\``.
- Авто-комплит HTML-тегов, атрибутов, событий.
- Проверка опечаток в атрибутах.
- Go-to-definition для кастомных элементов (если описаны через `customElements.json` или JSDoc).
- Diagnostics на неверные binding'и.

### 2. Указать имена тегов

`lit-plugin` ищет идентификаторы `html` и `css` в импортах. Если вы не переименовываете их при импорте — настройка нулевая, всё работает:

```ts
import { html, css } from "@madojs/mado";

const tpl = html`<button @click=${fn}>${label}</button>`;
```

### 3. (Опционально) Свои `customElements.json`

Если хотите авто-комплит по своим `<x-*>`-компонентам, опишите их через [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest):

```bash
npm install --save-dev @custom-elements-manifest/analyzer
npx cem analyze --globs "src/components/**/*.ts"
```

Создаст `custom-elements.json`, который `lit-plugin` подхватит автоматически.

---

## WebStorm / IntelliJ

WebStorm понимает `html\`\`` и `css\`\`` **из коробки** — нативная поддержка lit-style template-литералов с 2021 года. Никаких плагинов ставить не нужно.

Если подсветка не появляется:

- Settings → Languages & Frameworks → JavaScript → проверить, что включено "Use types from server"
- Перезагрузить TS-сервер: ⌘+⇧+P → "Restart TypeScript Server"

---

## Neovim / Helix

Используйте [`lit-html-server`](https://github.com/runem/lit-analyzer/tree/master/packages/lit-html-server) (LSP-сервер от того же автора, что и lit-plugin):

```bash
npm install -g lit-html-server
```

`init.lua` (для `lspconfig`):

```lua
require('lspconfig').lit_html.setup{
  cmd = { 'lit-html-server', '--stdio' },
  filetypes = { 'typescript', 'javascript' },
}
```

---

## Что НЕ работает (известные ограничения)

- **Type-check биндингов через сигналы.** `html\`<input .value=${count}>\`` — `lit-plugin` ожидает строку, а `count` это `Signal<number>`. Подавляется через `// @ts-expect-error` или комментарием `<!-- @ts-ignore -->`. Будет улучшено в Phase 3+.
- **Кастомные директивы (`each`)** распознаются как обычные функции — без специальной семантики у плагина.
- **Атрибуты с префиксами `@`, `.`, `?`** иногда подсвечиваются как ошибки, если в `lit-plugin` отключён `"no-unknown-attribute": false`. В `.vscode/settings.json`:

```json
{
  "lit-plugin.rules": {
    "no-unknown-attribute": "off",
    "no-incompatible-type-binding": "off"
  }
}
```

---

## JSDoc-типизация компонентов

Чтобы IDE подхватывал кастомные элементы внутри `html\`\``, аннотируйте `component()`-определение через JSDoc:

```ts
/**
 * @element x-counter
 * @attr {number} initial - стартовое значение
 * @fires {CustomEvent<number>} change - на каждое изменение
 */
component("x-counter", () => {
  /* ... */
});
```

`lit-plugin` это распознаёт и предлагает атрибуты при печати `<x-counter ...>`.

---

## Prettier / форматирование

Prettier с **3.0+** форматирует `html\`\`` через [`@prettier/plugin-xml`](https://github.com/prettier/plugin-xml) или встроенный режим. Минимальный `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "embeddedLanguageFormatting": "auto"
}
```

Опция `embeddedLanguageFormatting: "auto"` (default) форматирует содержимое tagged-template-литералов с известными тегами (`html`, `css`).

---

## ESLint

Если используете ESLint, плагин [`eslint-plugin-lit`](https://github.com/43081j/eslint-plugin-lit) даёт правила специально под tagged-template-html (а правила [`eslint-plugin-wc`](https://github.com/43081j/eslint-plugin-wc) — под Web Components в целом). Конфигурация — на ваш вкус, не required.

---

## TL;DR

| Редактор | Setup | Уровень DX |
|---|---|---|
| **VS Code** | поставить `lit-plugin` | ★★★★ |
| **WebStorm** | ничего | ★★★★ |
| **Neovim/Helix** | `lit-html-server` через LSP | ★★★ |
| **Vim без LSP** | вручную | ★ |

Без IDE-плагина Mado тоже работает: `html\`\`` остаётся валидным TS-кодом, всё компилируется и запускается. Просто строка внутри подсвечивается как строка.