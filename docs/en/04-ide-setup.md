# IDE support for `html\`\`` and `css\`\``

Out of the box `html\`...\`` and `css\`...\`` are just tagged-template strings.
TypeScript doesn't know about them, the IDE doesn't highlight them. This is a
**deliberate trade-off** in favour of zero runtime dependencies and no build plugins.

The good news: Mado uses the same conventions as [lit](https://lit.dev), so the
**ready-made** IDE tools from the lit ecosystem work out of the box.

---

## VS Code (recommended setup)

### 1. Install [lit-plugin](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin)

VS Code → Extensions → search **"lit-plugin"** (by runem) → Install.

What you get:

- HTML highlighting inside `html\`\``.
- CSS highlighting inside `css\`\``.
- Auto-complete for HTML tags, attributes, and events.
- Typo checking in attributes.
- Go-to-definition for custom elements (if described via `customElements.json` or JSDoc).
- Diagnostics on invalid bindings.

### 2. Specify tag names

`lit-plugin` looks for the `html` and `css` identifiers in imports. If you don't
rename them on import — configuration is zero, everything works:

```ts
import { html, css } from "@madojs/mado";

const tpl = html`<button @click=${fn}>${label}</button>`;
```

### 3. (Optional) Your own `customElements.json`

If you want auto-complete for your own `<x-*>` components, describe them via
[Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest):

```bash
npm install --save-dev @custom-elements-manifest/analyzer
npx cem analyze --globs "src/components/**/*.ts"
```

This creates `custom-elements.json`, which `lit-plugin` picks up automatically.

---

## WebStorm / IntelliJ

WebStorm understands `html\`\`` and `css\`\`` **out of the box** — native support
for lit-style template literals since 2021. No plugins needed.

If highlighting doesn't appear:

- Settings → Languages & Frameworks → JavaScript → verify "Use types from server" is on
- Restart the TS server: ⌘+⇧+P → "Restart TypeScript Server"

---

## Neovim / Helix

Use [`lit-html-server`](https://github.com/runem/lit-analyzer/tree/master/packages/lit-html-server)
(LSP server by the same author as lit-plugin):

```bash
npm install -g lit-html-server
```

`init.lua` (for `lspconfig`):

```lua
require('lspconfig').lit_html.setup{
  cmd = { 'lit-html-server', '--stdio' },
  filetypes = { 'typescript', 'javascript' },
}
```

---

## What does NOT work (known limitations)

- **Type-checking of signal bindings.** `html\`<input .value=${count}>\`` — `lit-plugin`
  expects a string, but `count` is a `Signal<number>`. Suppress with `// @ts-expect-error`
  or `<!-- @ts-ignore -->`. Will be improved in Phase 3+.
- **Custom directives (`each`)** are recognised as plain functions — without special
  semantics in the plugin.
- **Attributes with `@`, `.`, `?` prefixes** are sometimes flagged as errors if
  `lit-plugin` has `"no-unknown-attribute": false` disabled. In `.vscode/settings.json`:

```json
{
  "lit-plugin.rules": {
    "no-unknown-attribute": "off",
    "no-incompatible-type-binding": "off"
  }
}
```

---

## JSDoc typing for components

To make the IDE pick up custom elements inside `html\`\``, annotate the `component()`
definition via JSDoc:

```ts
/**
 * @element x-counter
 * @attr {number} initial - starting value
 * @fires {CustomEvent<number>} change - on every change
 */
component("x-counter", () => {
  /* ... */
});
```

`lit-plugin` recognises this and suggests attributes when you type `<x-counter ...>`.

---

## Prettier / formatting

Prettier 3.0+ formats `html\`\`` via [`@prettier/plugin-xml`](https://github.com/prettier/plugin-xml)
or the built-in mode. Minimal `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "embeddedLanguageFormatting": "auto"
}
```

`embeddedLanguageFormatting: "auto"` (default) formats the content of tagged-template
literals with known tags (`html`, `css`).

---

## ESLint

If you use ESLint, the [`eslint-plugin-lit`](https://github.com/43081j/eslint-plugin-lit)
plugin provides rules specific to tagged-template HTML, and
[`eslint-plugin-wc`](https://github.com/43081j/eslint-plugin-wc) covers Web Components
in general. Configuration is up to you, not required.

---

## TL;DR

| Editor | Setup | DX level |
|---|---|---|
| **VS Code** | install `lit-plugin` | ★★★★ |
| **WebStorm** | nothing | ★★★★ |
| **Neovim/Helix** | `lit-html-server` via LSP | ★★★ |
| **Vim without LSP** | manual | ★ |

Mado works without an IDE plugin too: `html\`\`` remains valid TS code, everything
compiles and runs. The string inside is just highlighted as a string.
