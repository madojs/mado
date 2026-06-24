# Quickstart

> Goal: have a Mado app running locally, edited from VS Code, and shipped to
> a static host — in under 10 minutes.

---

## 1. Scaffold

Mado 0.12 ships with two starters: the **universal** starter (default) and
the **modular** reference architecture.

```bash
# Universal starter (default) — ~15 files, one shared component
npm exec --package @madojs/mado -- mado init my-app

# Modular reference starter — auth shell, guarded zones, billing module
npm exec --package @madojs/mado -- mado init my-app --starter modular

cd my-app
npm install
```

What you get either way:

- exactly one runtime dependency: `@madojs/mado`;
- `vite.config.ts` with `mado()` from `@madojs/mado/vite`;
- `src/main.ts` mounting the router into `#app`;
- `src/app.routes.ts` (a default export + a named `manifest` export);
- a `package.json` whose scripts wrap the Mado CLI.

---

## 2. The dev loop

```bash
npm run dev        # Vite dev server, fast HMR for templates/styles
npm run typecheck  # tsc --noEmit
npm run test       # node --test (if your project has tests)
npm run build      # SPA build only (out/ without snapshots)
npm run release    # typecheck + vite build + static snapshots + deploy files
npm run preview    # serve out/ like a real static host
```

`mado release` is the single command you ship. It produces one folder,
`out/`, that you can `rsync`/upload to any static host:

```bash
npm run release
rsync -avz out/ user@server:/var/www/my-app/
```

See [20-deployment.md](./20-deployment.md) for nginx / Cloudflare Pages /
GitHub Pages / S3 recipes.

---

## 3. Your first page

Two primitives, that's it (see [10-pages-and-components.md](./10-pages-and-components.md)
for the full mental model):

- **`page()`** — a route. Lives at a URL. Renders in light DOM. Has
  `title` / `head` / `load` / `view` / optional `static`.
- **`component()`** — a reusable `<x-tag>`. Shadow DOM by default.

```ts
// src/pages/home.page.ts
import { html, page } from "@madojs/mado";

export default page({
  title: "Home",
  head: () => ({ description: "Hello from Mado" }),
  view: () => html`<h1>Hello, Mado</h1>`,
});
```

```ts
// src/app.routes.ts
import { routes } from "@madojs/mado";

export const manifest = {
  "/":  () => import("./pages/home.page"),
  "*":  () => import("./pages/not-found.page"),
};

export default routes(manifest);
```

Always export both `default` (for the router) and `manifest` (so
`mado static` can discover bakeable pages).

Internal links must be base-aware:

```ts
import { routeUrl } from "@madojs/mado";

html`<a data-link href=${routeUrl("/about")}>About</a>`;
```

`data-link` lets the router intercept the click — including across
Shadow DOM. `routeUrl()` resolves against `import.meta.env.BASE_URL`,
so the same code works whether your app is hosted at `/` or at
`/docs/`.

---

## 4. IDE setup

Out of the box `html` and `css` are tagged-template strings. TypeScript
and most editors don't highlight them by default. The lit ecosystem's
tools work because Mado uses the same tag names and binding shapes.

### VS Code (recommended)

1. **Extensions → install [lit-plugin](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin)** (by `runem`).
2. Import `html` / `css` directly — no rename:

   ```ts
   import { html, css } from "@madojs/mado";
   ```

3. (Optional) Recommended settings for Mado in `.vscode/settings.json`:

   ```json
   {
     "lit-plugin.rules": {
       "no-unknown-attribute": "off",
       "no-incompatible-type-binding": "off"
     }
   }
   ```

   `no-incompatible-type-binding: off` is needed because Mado bindings
   accept signals (`Signal<T>`) where the plugin expects raw values.

You get: HTML/CSS highlighting inside templates, attribute/event
auto-complete, go-to-definition for custom elements, typo checking.

### WebStorm / IntelliJ

Native support for lit-style template literals since 2021. Nothing to
install. If highlighting is missing, restart the TS server.

### Neovim / Helix

```bash
npm install -g lit-html-server
```

Wire it into your LSP config (`lit_html` in `lspconfig`).

### Optional extras

- **Custom Elements Manifest** for auto-complete on your own
  `<x-*>` components: `npx cem analyze --globs "src/**/*.ts"`.
- **Prettier 3+** formats `html`/`css` template literals via
  `embeddedLanguageFormatting: "auto"` (default).
- **eslint-plugin-lit** + **eslint-plugin-wc** provide
  template-aware lint rules. Not required.

### What does NOT work today

- Type-checking of signal bindings: `<input .value=${count}>` is
  flagged because the plugin expects a string, not a `Signal<number>`.
  Suppress with `// @ts-expect-error` or the settings override above.
- The `each()` directive is recognised as a plain function — no
  special-case checking inside.

Mado works without any IDE plugin — the templates remain valid TS,
they just won't be syntax-highlighted as HTML.

---

## 5. Where to go next

- [10 — Pages and components](./10-pages-and-components.md) — the one rule.
- [11 — Templates and signals](./11-templates-and-signals.md) — binding shapes.
- [12 — Routing](./12-routing.md) — manifest, layouts, guards, prefetch.
- [13 — Data](./13-data.md) — `resource()` / `mutation()` / auth.
- [14 — Forms](./14-forms.md) — `useForm()` + Shadow DOM input recipes.
- [15 — Static snapshots](./15-static-snapshots.md) — SEO without SSR.
- [16 — App architecture](./16-app-architecture.md) — the modular starter, ESLint boundaries.
