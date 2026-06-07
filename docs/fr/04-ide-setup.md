# Support IDE pour `html\`\`` et `css\`\``

Par défaut, `html\`...\`` et `css\`...\`` ne sont que des tagged-template strings.
TypeScript ne les connaît pas, l'IDE ne les colore pas. C'est un **compromis délibéré**
en faveur de zéro dépendances runtime et pas de plugins de build.

La bonne nouvelle : Mado utilise les mêmes conventions que [lit](https://lit.dev), donc les
outils IDE **prêts à l'emploi** de l'écosystème lit fonctionnent directement.

---

## VS Code (configuration recommandée)

### 1. Installer [lit-plugin](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin)

VS Code → Extensions → chercher **"lit-plugin"** (par runem) → Installer.

Ce que vous obtenez :

- Coloration HTML à l'intérieur de `html\`\``.
- Coloration CSS à l'intérieur de `css\`\``.
- Auto-complétion pour les tags HTML, attributs et événements.
- Vérification des fautes de frappe dans les attributs.
- Aller à la définition pour les custom elements (si décrits via `customElements.json` ou JSDoc).
- Diagnostics sur les bindings invalides.

### 2. Spécifier les noms de tags

`lit-plugin` cherche les identifiants `html` et `css` dans les imports. Si vous ne les
renommez pas à l'import — la configuration est nulle, tout fonctionne :

```ts
import { html, css } from "madojs";

const tpl = html`<button @click=${fn}>${label}</button>`;
```

### 3. (Optionnel) Votre propre `customElements.json`

Si vous voulez l'auto-complétion pour vos propres composants `<x-*>`, décrivez-les via
[Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest) :

```bash
npm install --save-dev @custom-elements-manifest/analyzer
npx cem analyze --globs "src/components/**/*.ts"
```

Cela crée `custom-elements.json`, que `lit-plugin` récupère automatiquement.

---

## WebStorm / IntelliJ

WebStorm comprend `html\`\`` et `css\`\`` **nativement** — support natif des template literals
de style lit depuis 2021. Pas de plugins nécessaires.

Si la coloration n'apparaît pas :

- Settings → Languages & Frameworks → JavaScript → vérifiez que "Use types from server" est activé
- Redémarrer le serveur TS : ⌘+⇧+P → "Restart TypeScript Server"

---

## Neovim / Helix

Utilisez [`lit-html-server`](https://github.com/runem/lit-analyzer/tree/master/packages/lit-html-server)
(serveur LSP du même auteur que lit-plugin) :

```bash
npm install -g lit-html-server
```

`init.lua` (pour `lspconfig`) :

```lua
require('lspconfig').lit_html.setup{
  cmd = { 'lit-html-server', '--stdio' },
  filetypes = { 'typescript', 'javascript' },
}
```

---

## Ce qui ne fonctionne PAS (limitations connues)

- **Vérification de type des bindings de signal.** `html\`<input .value=${count}>\`` — `lit-plugin`
  attend une string, mais `count` est un `Signal<number>`. Supprimez avec `// @ts-expect-error`
  ou `<!-- @ts-ignore -->`. Sera amélioré en Phase 3+.
- **Les directives personnalisées (`each`)** sont reconnues comme des fonctions ordinaires — sans
  sémantique spéciale dans le plugin.
- **Les attributs avec préfixes `@`, `.`, `?`** sont parfois signalés comme des erreurs si
  `lit-plugin` a `"no-unknown-attribute": false` désactivé. Dans `.vscode/settings.json` :

```json
{
  "lit-plugin.rules": {
    "no-unknown-attribute": "off",
    "no-incompatible-type-binding": "off"
  }
}
```

---

## Typage JSDoc pour les composants

Pour que l'IDE récupère les custom elements à l'intérieur de `html\`\``, annotez la
définition `component()` via JSDoc :

```ts
/**
 * @element x-counter
 * @attr {number} initial - valeur de départ
 * @fires {CustomEvent<number>} change - à chaque changement
 */
component("x-counter", () => {
  /* ... */
});
```

`lit-plugin` le reconnaît et suggère des attributs quand vous tapez `<x-counter ...>`.

---

## Prettier / formatage

Prettier 3.0+ formate `html\`\`` via [`@prettier/plugin-xml`](https://github.com/prettier/plugin-xml)
ou le mode intégré. `.prettierrc` minimal :

```json
{
  "semi": true,
  "singleQuote": false,
  "embeddedLanguageFormatting": "auto"
}
```

`embeddedLanguageFormatting: "auto"` (par défaut) formate le contenu des tagged-template
literals avec des tags connus (`html`, `css`).

---

## ESLint

Si vous utilisez ESLint, le plugin [`eslint-plugin-lit`](https://github.com/43081j/eslint-plugin-lit)
fournit des règles spécifiques au HTML en tagged-template, et
[`eslint-plugin-wc`](https://github.com/43081j/eslint-plugin-wc) couvre les Web Components
en général. La configuration est à votre discrétion, elle n'est pas obligatoire.

---

## TL;DR

| Éditeur | Configuration | Niveau DX |
|---|---|---|
| **VS Code** | installer `lit-plugin` | ★★★★ |
| **WebStorm** | rien | ★★★★ |
| **Neovim/Helix** | `lit-html-server` via LSP | ★★★ |
| **Vim sans LSP** | manuel | ★ |

Mado fonctionne aussi sans plugin IDE : `html\`\`` reste du code TS valide, tout se
compile et s'exécute. La string à l'intérieur est juste colorée comme une string.
