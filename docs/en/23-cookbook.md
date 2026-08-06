# Static snapshots cookbook

> Concrete recipes for `mado static`. Concept and API in
> [15-static-snapshots.md](./15-static-snapshots.md); failure modes and CI
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
  404.html                 ← noindex copy of the SPA shell
  sitemap.xml
  _headers / _redirects
```

## 2. Blog with browser-safe generated content

```ts
// src/content/posts.ts
export interface Post {
  slug: string;
  title: string;
  date: string;
  sanitizedHtml: string;
}

// This array may be generated from Markdown by a separate build script.
// The generated module itself must stay browser-safe.
export const posts: readonly Post[] = [
  {
    slug: "hello-mado",
    title: "Hello, Mado",
    date: "2026-07-30",
    sanitizedHtml: "<p>One page model for static and live routes.</p>",
  },
];

export function findPost(slug: string): Post | undefined {
  return posts.find((post) => post.slug === slug);
}
```

```ts
// src/pages/post.page.ts
import { html, page, unsafeHTML } from "@madojs/mado";
import { findPost, posts, type Post } from "../content/posts";

export default page<{ slug: string }, Post>({
  static: {
    paths: async () =>
      posts.map((post) => ({ slug: post.slug })),
    initialData: async ({ slug }) => {
      const post = findPost(slug);
      if (!post) throw new Error(`Unknown post: ${slug}`);
      return post;
    },
  },
  title: (_, seed) => seed?.title ?? "Post",
  head: (_, seed) => ({
    description: seed?.title,
  }),
  view: (ctx) => html`
    <article>
      <h1>${ctx.data.title}</h1>
      <time datetime=${ctx.data.date}>${ctx.data.date}</time>
      ${unsafeHTML(ctx.data.sanitizedHtml)}
    </article>
  `,
});
```

Output: one `out/posts/<slug>/index.html` per post, each carrying its
own canonical and `og:url`.

> `paths()` and `initialData()` execute during Node discovery, but the page
> module and everything it imports remain in the client graph. Do not import
> `node:fs` or `node:path` from a page content module. If source content lives
> in files, preprocess it with a separate Node script into browser-safe JSON or
> TypeScript before `mado release`. Keep generated content secret-free, and
> pass only trusted, sanitized HTML to `unsafeHTML()`.

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

interface GitHubReleaseDto {
  tag_name: string;
  published_at: string | null;
}

interface Release {
  tag: string;
  date: string;
}

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export default page<{ tag: string }, Release>({
  static: {
    paths: async () => {
      const releases = await githubJson<GitHubReleaseDto[]>(
        "https://api.github.com/repos/madojs/mado/releases",
      );
      return releases
        .filter((release) => release.published_at !== null)
        .map((release) => ({ tag: release.tag_name }));
    },
    initialData: async ({ tag }) => {
      const release = await githubJson<GitHubReleaseDto>(
        `https://api.github.com/repos/madojs/mado/releases/tags/${encodeURIComponent(tag)}`,
      );
      if (!release.published_at) {
        throw new Error(`Release is not published: ${tag}`);
      }
      return {
        tag: release.tag_name,
        date: release.published_at,
      };
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

Public network calls in `paths()` / `initialData()` are allowed, but they make
the build depend on service availability and rate limits. The callbacks run in
the discovery Node process, while their code remains in the client graph: do
not embed credentials. For deterministic releases, prefer a CI-generated,
browser-safe content artifact.

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

A route that does NOT declare `static` is served from
`out/_mado/spa.html` when the host's fallback policy rewrites that URL.
That is the right place for authenticated zones, search, dashboards and
admin tools.

```ts
// src/pages/app.page.ts
import { html, page } from "@madojs/mado";

// No `static` field — SPA only.
export default page({
  title: "App",
  view: () => html`<main><h1>Application</h1></main>`,
});
```

The fallback is automatically marked `noindex` so search engines do
not capture the SPA shell.

## 8. Static host 404

An all-static site can capture its global wildcard:

```ts
import { html, page, routeUrl } from "@madojs/mado";

export default page({
  static: true,
  title: "Not found",
  view: () => html`
    <main>
      <h1>Page not found</h1>
      <a data-link href=${routeUrl("/")}>Home</a>
    </main>
  `,
});
```

The view must be generic: do not render `path()`, because one `404.html`
serves every missing URL. Mado forces `noindex`, omits canonical/`og:url`,
excludes it from the sitemap and does not generate the catch-all SPA
`_redirects` rule.

This default is intended for an all-static route table. In a mixed
static/SPA app, either keep `*` non-static or provide host-specific rewrites
for each known SPA-only route family. A standard `public/404.html` takes
precedence when you want to own the host document completely.

## 9. Failure modes

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

A capture or serialization failure leaves the previous route files untouched:
capture writes to a temp tree and only starts promotion after every route
survived. Final promotion is a short series of filesystem copies, not an
atomic directory swap; deploy the clean `mado release` artifact instead of
serving `out/` while rebuilding it.

## 10. CI guidance

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

`mado static` itself is always strict when a route needs capture.
`MADO_REQUIRE_BROWSER=1` makes the repository's browser-backed tests run
instead of skipping on a machine without an explicit browser override.

## 10. Quick checklist before pushing

- [ ] `mado({ site })` set (or `MADO_SITE` / `--base-url`).
- [ ] Every static page declares `static: true | { paths, initialData }`.
- [ ] No `paths()` / `initialData()` reads secrets.
- [ ] No static page is behind a guard.
- [ ] Internal anchors go through `routeUrl()`; normal SPA links add
      `data-link`, while a new CSP/COOP/auth document realm deliberately does
      not.
- [ ] `mado release` succeeds locally with Playwright Chromium
      installed.
- [ ] `mado preview` serves the artefact correctly.
