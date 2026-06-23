# Static snapshots cookbook

> Concrete recipes for `mado static`. Concept and API in
> [03-static-bake.md](./03-static-bake.md); failure modes and CI
> guidance at the end of this file.

Every recipe assumes:

- Vite is the build transport (`@madojs/mado/vite` plugin).
- A public origin is configured (`mado({ site })` or
  `MADO_SITE=https://your.site mado release`).
- `mado release` is the release command (it runs `vite build` →
  `mado static` → writes deployment files into `out/`).

## 1. Single static landing page

```ts
// src/pages/home.page.ts
import { html, page } from "@madojs/mado";

export default page({
  static: true,
  title: "Home",
  head: () => ({
    description: "Welcome to the Mado App.",
  }),
  view: () => html`
    <main>
      <h1>Mado App</h1>
      <p>One component model. One page model. One release command.</p>
    </main>
  `,
});
```

After `mado release`:

```
out/
  index.html               ← captured snapshot
  assets/...
  _mado/spa.html           ← SPA fallback for other routes
  sitemap.xml
  _headers / _redirects
```

## 2. Blog with file-system content

```ts
// src/content/posts.ts
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Post {
  slug: string;
  title: string;
  date: string;
  html: string;
}

const dir = resolve(process.cwd(), "content/posts");

export function listPosts(): Post[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => loadPost(file));
}

export function loadPost(file: string): Post {
  // Replace with your real Markdown pipeline.
  return JSON.parse(readFileSync(resolve(dir, file), "utf8"));
}
```

```ts
// src/pages/post.page.ts
import { html, page } from "@madojs/mado";
import { listPosts, loadPost, type Post } from "../content/posts";

export default page<{ slug: string }, Post>({
  static: {
    paths: async () =>
      listPosts().map((p) => ({ slug: p.slug })),
    initialData: async ({ slug }) =>
      loadPost(`${slug}.json`),
  },
  title: (_, seed) => seed?.title ?? "Post",
  head: (_, seed) => ({
    description: seed?.title,
  }),
  view: (ctx) => html`
    <article>
      <h1>${ctx.data.title}</h1>
      <time>${ctx.data.date}</time>
      ${html([ctx.data.html] as unknown as TemplateStringsArray)}
    </article>
  `,
});
```

Output: one `out/posts/<slug>/index.html` per post, each carrying its
own canonical and `og:url`.

> File-system reads happen during *discovery* (Node side). They never
> ship in the client bundle. The captured *initial data* does ship —
> keep it free of secrets.

## 3. Product catalogue from JSON

```ts
import { html, page } from "@madojs/mado";
import products from "../content/products.json" with { type: "json" };

interface Product {
  slug: string;
  name: string;
  price: number;
}

export default page<{ slug: string }, Product>({
  static: {
    paths: async () => products.map((p) => ({ slug: p.slug })),
    initialData: async ({ slug }) =>
      products.find((p) => p.slug === slug)!,
  },
  title: (_, seed) => seed?.name ?? "Product",
  view: (ctx) => html`
    <main>
      <h1>${ctx.data.name}</h1>
      <p>$${ctx.data.price.toFixed(2)}</p>
    </main>
  `,
});
```

## 4. Documentation site

A docs site is typically:

- Many static guides keyed by `slug`.
- A few hand-written landing pages.
- One SPA route for the search modal (kept dynamic).

```ts
// src/app.routes.ts
import { routes } from "@madojs/mado";
import home from "./pages/home.page";
import guide from "./pages/guide.page";
import search from "./pages/search.page";

export const manifest = {
  "/":             home,                 // static
  "/guides/:slug": guide,                // dynamic static
  "/search":       search,               // SPA-only (no `static` field)
  "*":             () => import("./pages/not-found.page"),
};

export default routes(manifest);
```

Only `home` and `guide` are captured. `/search` is served from the
SPA fallback (`_mado/spa.html`).

## 5. Build-time API call

```ts
import { html, page } from "@madojs/mado";

interface Release { tag: string; date: string }

export default page<{ tag: string }, Release>({
  static: {
    paths: async () => {
      const res = await fetch("https://api.github.com/repos/madojs/mado/releases");
      const list = (await res.json()) as Release[];
      return list.map((r) => ({ tag: r.tag }));
    },
    initialData: async ({ tag }) => {
      const res = await fetch(
        `https://api.github.com/repos/madojs/mado/releases/tags/${tag}`,
      );
      return (await res.json()) as Release;
    },
  },
  title: (_, seed) => `Release ${seed?.tag ?? ""}`,
  view: (ctx) => html`
    <article>
      <h1>${ctx.data.tag}</h1>
      <time>${ctx.data.date}</time>
    </article>
  `,
});
```

Network calls in `paths()` / `initialData()` are perfectly fine — they
run in the discovery Node process, not in the browser at capture.

## 6. Sub-path deployment

`mado release` honours Vite's `base`. Configure it once:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { mado } from "@madojs/mado/vite";

export default defineConfig({
  base: "/docs/",
  plugins: [mado({ site: "https://your.site" })],
});
```

Every link in your app must go through `routeUrl()` so it picks up
the prefix:

```ts
import { html, routeUrl } from "@madojs/mado";

html`<a data-link href=${routeUrl("/guides/intro")}>Intro</a>`;
html`<a data-link href=${routeUrl("/")}>Home</a>`;     // → "/docs/"
```

Captured canonicals and `og:url` will be `https://your.site/docs/...`.

## 7. SPA-only fallback

Any route that does NOT declare `static` is served from
`out/_mado/spa.html`. That is the right place for authenticated
zones, search, dashboards, admin tools.

```ts
// src/pages/app.page.ts
import { html, page } from "@madojs/mado";

// No `static` field — SPA only.
export default page({
  title: "App",
  view: () => html`<x-app-shell></x-app-shell>`,
});
```

The fallback is automatically marked `noindex` so search engines do
not capture the SPA shell.

## 8. Failure modes

`mado static` fails the snapshot (non-zero exit) when:

- A script, stylesheet, custom element or tracked `resource()` fetch
  fails.
- A custom element is referenced in the rendered DOM but never
  defined.
- A page declares `static: true` on a route with `:params` but no
  `paths()`.
- Two pages produce the same generated URL.
- Any guard runs on a static route or its layout chain.
- `initialData()` returns a value that is not strictly JSON-serialisable
  (Date, Map, Set, class instance, `undefined` field, NaN, Infinity,
  cycles, non-plain prototypes). The validator points at the bad
  field by path.

A failed snapshot leaves the previous `out/` untouched: capture
writes to a temp tree and only promotes once every route survived.

## 9. CI guidance

```yaml
# .github/workflows/ci.yml — extract
- name: Install Playwright Chromium
  run: node node_modules/playwright-core/cli.js install --with-deps chromium

- name: Release smoke
  env:
    MADO_REQUIRE_BROWSER: "1"
    MADO_SITE: "https://your.site"
  run: npm run release
```

`MADO_REQUIRE_BROWSER=1` forces `mado static` to fail loudly if no
Chromium is resolvable (instead of silently producing a SPA-only
build).

## 10. Quick checklist before pushing

- [ ] `mado({ site })` set (or `MADO_SITE` / `--base-url`).
- [ ] Every static page declares `static: true | { paths, initialData }`.
- [ ] No `paths()` / `initialData()` reads secrets.
- [ ] No static page is behind a guard.
- [ ] Internal links go through `routeUrl()` + `data-link`.
- [ ] `mado release` succeeds locally with Playwright Chromium
      installed.
- [ ] `mado preview` serves the artefact correctly.