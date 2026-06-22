# Mado Unified Static Snapshot Plan

## Status

Target branch:

```bash
git status --short
git diff --binary > ../mado-before-static-snapshot.patch
git switch -c feat/static-snapshot-dsd
```

Uncommitted changes follow the new branch automatically. Before the first architectural commit, review them and create a checkpoint:

```bash
git add -A
git commit -m "chore: checkpoint before static snapshot work"
```

## Goal

Mado provides one authoring model:

```txt
Mado component = Custom Element + open Shadow DOM
Mado page      = route + load + head + view + optional static declaration
Mado release   = Vite build + browser-rendered static routes + SPA fallback
```

Developers do not create separate SPA, SEO, Light DOM, or Shadow DOM versions of components.

## Non-goals

This work does not introduce:

* server-side component rendering;
* hydration or resumability;
* a second template renderer;
* a separate SEO component model;
* automatic browser downloads;
* ISR or runtime revalidation;
* no-JavaScript interactivity;
* support for closed Shadow Roots.

---

## Public Page API

Replace `page.bake` and `BakeConfig` with `page.static`.

The current API still exposes `BakeConfig`, injects baked data, and treats `bake` as a separate rendering path.

Proposed shape:

```ts
export interface StaticPageConfig<
  P extends RouteParams,
  D,
> {
  /**
   * Route parameter sets to materialize.
   *
   * Optional for literal routes such as "/".
   * Required for dynamic routes such as "/products/:slug".
   */
  paths?: () => Promise<P[]> | P[];

  /**
   * Optional build-time seed.
   *
   * Passed to:
   *   page.head(params, initialData)
   *   page.load(params, initialData)
   *
   * This is not an alternative runtime loader.
   */
  initialData?: (params: P) => Promise<D> | D;
}

export interface Page<P extends RouteParams, D> {
  // existing fields...
  static?: true | StaticPageConfig<P, D>;
}
```

Examples:

```ts
export default page({
  static: true,

  title: "Mado",
  view: () => html`<mado-home></mado-home>`,
});
```

```ts
export default page<{ slug: string }, Product>({
  static: {
    paths: async () => {
      const products = await listProducts();
      return products.map(({ slug }) => ({ slug }));
    },

    initialData: ({ slug }) => getProduct(slug),
  },

  load: (params, initialData) =>
    initialData ??
    resource(
      () => `/api/products/${params.slug}`,
      jsonFetcher<Product>(),
    ),

  head: (params, product) => ({
    title: product?.name ?? params.slug,
    description: product?.summary,
    canonical: `/products/${params.slug}`,
    jsonLd: product
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
        }
      : undefined,
  }),

  view: ({ data }) => html`
    <product-detail .product=${data}></product-detail>
  `,
});
```

### Static route rules

* A route with `static` is public and enumerable.
* Any page-level or inherited layout guard makes `static` invalid.
* Wildcard routes cannot be static.
* Duplicate generated URLs fail the build.
* Dynamic routes must provide every route parameter.
* `paths()` returns params, not arbitrary URL strings.
* Query strings and hashes are not part of static path enumeration.
* Fixed routes default to one empty params object when `static: true`.
* Static routes are always browser-snapshotted.
* Non-static routes remain ordinary SPA routes.

### Remove `revalidate`

Do not carry `revalidate` into the first snapshot API. A static hosting artifact cannot enforce ISR by itself. Keeping it as metadata would create a promise Mado does not yet fulfil.

---

## Static Initial Data

Remove legacy `#bake` naming and semantics, but keep a small initial-data bridge.

Generated route shell:

```html
<script
  type="application/json"
  data-mado-static-data
>
  {"name":"Keyboard","price":120}
</script>
```

Runtime behavior:

```txt
readStaticData()
  ↓
page.head(params, initialData)
  ↓
page.load(params, initialData)
  ↓
page.view({ data })
```

This is not hydration. It only prevents duplicate data fetching and allows metadata to be generated from the same route data.

Requirements:

* JSON must be escaped safely for `<script>` context.
* The data element must be removed or marked consumed after reading.
* Static data must be JSON-serializable.
* Serialization failures include route and page information.
* No local build-server URL may leak into output.

---

## Component Model

Shadow DOM remains canonical.

Current `component()` already defaults to Shadow DOM and keeps `shadow: false` as an alternate branch.

Change root creation to:

```ts
this.#root =
  this.shadowRoot ??
  this.attachShadow({
    mode: "open",
    serializable: true,
  });
```

`serializable: true` allows the root to be included by `getHTML({ serializableShadowRoots: true })`. Calling `attachShadow()` on a host with an existing declarative root would otherwise clear that root, so the explicit `this.shadowRoot` check is required. ([MDN Web Docs][1])

### `shadow: false`

* Keep it functional.
* Remove it from starters and the primary learning path.
* Document it as an advanced integration escape hatch.
* Do not describe it as an SEO or content-rendering mode.
* Do not extend its selector-prefixing system in this branch.
* Re-evaluate whether it belongs in v1 after site and demo dogfooding.

---

## CSS Static Support

Current `css``...``` returns a `CSSStyleSheet`, while Light DOM scoping includes a regex-based selector prefix fallback.

Keep the public contract:

```ts
export type CSSResult = CSSStyleSheet;
```

Add internal metadata:

```ts
const stylesheetText = new WeakMap<CSSStyleSheet, string>();
```

When `css``...``` creates a sheet:

```ts
stylesheetText.set(sheet, text);
```

Internal helpers:

```ts
getStylesheetText(sheet): string | undefined
getStylesheetHash(sheet): string
```

During snapshot capture:

1. Traverse every open Shadow Root recursively.
2. Read its `adoptedStyleSheets`.
3. Create temporary elements:

```html
<style
  data-mado-static-style="stable-hash"
>
  /* original component CSS */
</style>
```

4. Insert them into the Shadow Root.
5. Serialize the document.
6. Remove the temporary style elements from the live capture page.

The first implementation should inline component styles into each Declarative Shadow Root. Brotli/gzip will compress repeated text. Shared external Shadow stylesheets can be explored later only if actual HTML-size measurements justify them.

No selector prefixing or manual vendor-prefixing is needed for canonical Shadow components. Modern standards CSS is the authoring contract; production minification is a release concern.

---

## Static Runtime Coordinator

Do not use `networkidle` as the definition of application readiness.

Add a private runtime coordinator, enabled only in snapshot mode:

```ts
interface MadoStaticRuntime {
  routeReady(): void;
  track(promise: Promise<unknown>, label: string): void;
  whenStable(): Promise<void>;
  diagnostics(): StaticDiagnostics;
}
```

Browser-global internal hook:

```ts
window.__MADO_STATIC__
```

This is not part of the public package API.

### It must track

* lazy route module resolution;
* guard completion;
* initial `page.load`;
* first `resource()` request for the active route;
* pending Mado effect flushes;
* component definitions used by the rendered tree;
* route error boundary state.

### It must not wait forever for

* polling intervals;
* WebSockets;
* EventSource;
* background refresh after the initial settled state;
* analytics.

### Capture readiness

The runner performs:

```txt
page.goto(route, waitUntil: "domcontentloaded")
await window.__MADO_STATIC__.whenStable()
await document.fonts.ready
await two requestAnimationFrame ticks
```

If stability times out, fail with:

```txt
route
pending task labels
last router state
page errors
failed requests
console errors
undefined custom elements
```

---

## Static Route Discovery

Reuse Vite SSR loading only as a **control plane**:

```txt
load route manifest
flatten routes
inspect page.static
run static.paths()
run static.initialData()
validate guards and duplicates
```

Do not render templates or components in Node.

The old Node-side `renderTemplate()` and its browser emulation are removed.

Suggested modules:

```txt
scripts/static/
  discover.mjs
  browser.mjs
  server.mjs
  serialize.mjs
  output.mjs
  diagnostics.mjs
```

Discovery result:

```ts
interface StaticRouteRecord {
  pattern: string;
  pathname: string;
  params: Record<string, string>;
  initialData?: unknown;
}
```

Sort records lexicographically by pathname before capture and sitemap generation.

---

## Internal Snapshot Server

Do not write snapshots directly into `out/` while routes are still being captured.

Pipeline:

```txt
out/index.html
  ↓ copied as immutable capture shell
temporary static output directory
  ↓ browser captures all routes
atomic promotion into out/
```

Suggested temporary layout:

```txt
.mado/
  static/
    spa-shell.html
    routes/
    manifest.json
```

The internal server:

* serves Vite assets and public files from `out/`;
* always serves the original SPA shell for navigation routes;
* ignores already generated route snapshots;
* injects snapshot mode and route-specific initial data;
* uses a random localhost port;
* applies `Cache-Control: no-store`;
* serves uncompressed assets;
* does not expose the server outside loopback;
* blocks service workers in the Playwright context.

Use one browser process and a fresh browser context per route. This keeps cookies, localStorage, sessionStorage and service workers isolated while avoiding a full browser process startup for every page.

---

## Browser Resolution

Prefer browser channels over guessing arbitrary executables.

Resolution order:

1. Explicit `--browser-path`.
2. `MADO_BROWSER_PATH`.
3. Explicit `--browser-channel`.
4. `MADO_BROWSER_CHANNEL`.
5. Playwright channel `chrome`.
6. Known system Chrome/Chromium locations.
7. Fail with an actionable message.

Recommended flags:

```bash
mado static --browser-channel chrome
mado static --browser-path /path/to/chrome
```

Avoid one ambiguous `--browser` flag.

Playwright supports Chrome/Edge channels and custom executable paths, but its own documentation warns that compatibility with arbitrary non-bundled browser versions is not guaranteed. ([Playwright][2])

Failure message:

```txt
[mado:static] No compatible Chromium browser was found.

Provide one of:
  mado static --browser-channel chrome
  mado static --browser-path /path/to/chrome
  MADO_BROWSER_CHANNEL=chrome
  MADO_BROWSER_PATH=/path/to/chrome
```

### Package tooling

`playwright-core` is not a runtime dependency, but generated apps using static snapshots need it as a development dependency.

Add it to:

* relevant starter `devDependencies`;
* optional peer dependency metadata, if desired;
* package smoke tests.

---

## Serialization

Require:

```ts
document.documentElement.getHTML({
  serializableShadowRoots: true,
});
```

`getHTML()` can include nested Shadow Roots marked as serializable; without the option, Shadow Roots are omitted. ([MDN Web Docs][3])

Because `Element.getHTML()` serializes element contents rather than the document wrapper, construct the final result explicitly:

```txt
<!doctype html>
<html ...serialized attributes...>
  ...documentElement.getHTML(...)
</html>
```

### Before serialization

Normalize state that is stored in DOM properties rather than attributes:

* `input.value`;
* `input.checked`;
* `textarea.value`;
* selected `<option>`;
* `<details open>`;
* static form validation state where intentionally visible.

Do not serialize:

* passwords;
* ephemeral focus state;
* selection ranges;
* browser-local build URLs;
* snapshot query markers;
* temporary diagnostics;
* HMR state.

### Unsupported visual state

Canvas pixels, active media frames and similar non-HTML visual state are not guaranteed to survive serialization. Components relying on them must provide meaningful static markup or be documented as client-only visual enhancements.

---

## Client Takeover

The first implementation uses full takeover, not hydration.

Current `render()` already recognizes baked markup and clears it before live rendering, but it clears first and instantiates afterwards.

Replace the marker:

```txt
data-mado-baked → data-mado-static
```

New sequence:

```txt
1. Instantiate live TemplateResult into an off-DOM fragment.
2. Replace static #app children atomically with the fragment.
3. Remove data-mado-static.
4. Continue normal Mado rendering.
```

This avoids an observable empty interval.

Contract:

```txt
Static DOM provides first paint and no-JS content.
Live Mado runtime replaces it once.
No node matching.
No binding restoration.
No hydration markers.
```

`component()` still reuses an existing DSD root when it encounters one, but root-level page takeover remains the primary activation model.

Add regression coverage for:

* no duplicate DOM after startup;
* no `attachShadow()` exception;
* no blank frame between static and live output;
* no repeated initial data request when static initial data exists;
* no unexpected component setup before a soon-to-be-replaced static root is removed.

---

## Output Layout

Always preserve an untouched SPA shell independently of a static root document:

```txt
out/
  index.html                    # snapshot for "/" if static
  404.html                      # SPA shell for GitHub Pages
  _mado/
    spa.html                    # untouched Vite SPA shell
  products/
    keyboard/
      index.html                # static snapshot
  assets/
  sitemap.xml
  _headers
  _redirects
```

This separation is essential. Once `/` is snapshotted, `out/index.html` can no longer safely serve as the fallback for private routes.

Recommended redirect:

```txt
/* /_mado/spa.html 200
```

Exact static files should win before the fallback.

If `/` is not static, `out/index.html` may remain the SPA shell, but `_mado/spa.html` should still be emitted for consistent deployment semantics.

`_mado/spa.html` should include:

```html
<meta name="robots" content="noindex">
```

The runtime updates the route head after the fallback shell is served.

---

## CLI

Add:

```bash
mado static
```

Contract:

```txt
mado static
  requires an existing Vite build in out/
  discovers page.static routes
  runs browser capture
  writes route snapshots and sitemap
```

Add optional arguments:

```txt
--out
--base-url
--browser-channel
--browser-path
--timeout
--concurrency
```

Remove functional support for `mado bake`.

Keep one explicit tombstone diagnostic for one development cycle:

```txt
[mado] `mado bake` was removed.
Use `mado static`, or run the complete pipeline with `mado release`.
```

Remove `bake` from:

* package scripts;
* help output;
* starters;
* docs;
* tests;
* generated examples;
* release internals.

---

## Release Pipeline

New release sequence:

```txt
1. clean out/
2. typecheck
3. Vite build
4. preserve original SPA shell as out/_mado/spa.html
5. discover static routes
6. browser snapshot into temporary output
7. atomically promote route documents into out/
8. generate sitemap.xml
9. generate 404.html, _headers, _redirects
10. precompress final files
11. verify output
```

The current release implementation already has clean build, Vite build, compression and CDN config; replace its bake stage rather than rewriting the entire command.

### Output verification

Fail release if:

* a generated route is missing `<title>`;
* canonical URL points to localhost;
* a static route has unresolved custom elements;
* generated HTML lacks expected `data-mado-static`;
* DSD serialization was requested but unsupported;
* duplicate routes exist;
* a guarded route declares `static`;
* temporary snapshot markers remain;
* the sitemap contains a private route;
* any route capture produced an unhandled page error.

---

## Vite Plugin

Keep `@madojs/mado/vite` deliberately thin.

It currently delegates dev serving, HTML processing, assets and bundling to Vite while providing Mado defaults and full reload.

For the first implementation:

* do not make the plugin own project HTML;
* do not move snapshot orchestration into the plugin;
* optionally expose resolved Mado static settings later;
* keep CLI as the snapshot coordinator;
* avoid introducing another `mado.config` file.

The first version may continue using CLI flags for `baseUrl` and browser settings. Plugin configuration can be added only after the snapshot contract is stable.

---

## Test Plan

### Page API

* `static: true` works for a literal route.
* Dynamic static route without `paths()` fails.
* Params produce correct encoded pathname.
* Duplicate output URLs fail.
* Wildcard static route fails.
* Page guard fails.
* Inherited layout guard fails.
* `initialData` reaches both `head` and `load`.
* Non-serializable initial data fails with route context.

### Component and DSD

* Shadow roots are open and serializable.
* Existing Declarative Shadow Roots are reused.
* Nested Shadow Roots serialize recursively.
* `shadow: false` remains functional.
* Slots preserve Light DOM content.
* Static markup remains readable with JavaScript disabled.
* Client takeover leaves one live component tree.

### CSS

* `css``...``` still returns a reusable `CSSStyleSheet`.
* Original CSS text is retained internally.
* Adopted component styles become `<style data-mado-static-style>`.
* Nested components contain their own static styles.
* Temporary snapshot styles are removed from the live capture page.
* Output is visually equivalent before and after takeover.

### Static runtime

* Lazy route completion is tracked.
* Initial resources block capture.
* Background polling does not block capture.
* Effect queue is flushed.
* Fonts are awaited.
* Timeout prints pending task diagnostics.
* Page errors and failed critical resources fail capture.

### Browser runner

* One browser process handles multiple routes.
* Each route receives isolated storage.
* Previously generated snapshots do not affect later captures.
* No internal server origin leaks into generated HTML.
* Browser absence produces a useful error.
* Unsupported `getHTML` produces a version-oriented error.

### Output

* Root static route and private SPA fallback coexist.
* Exact static route is served before fallback.
* Private route receives `_mado/spa.html`.
* `404.html` works as GitHub Pages fallback.
* Raw HTML contains title, description, canonical, OG, JSON-LD and DSD.
* Sitemap is sorted and contains static public routes only.
* `.gz` and `.br` are created after final HTML generation.

### Determinism

Run `mado release` twice with:

```txt
same source
same lockfile
same Node version
same Vite version
same browser version
same operating system
```

Hash every file under `out/` and assert identical output.

Do not claim cross-browser or cross-OS byte identity. Browser serialization can differ between implementations and versions.

### Regression

Keep existing coverage green for:

* signals and computed;
* keyed `each`;
* component lifecycle;
* router/layouts/guards;
* resource cleanup;
* persisted state;
* forms;
* error boundaries;
* explicit package exports;
* starter creation;
* package smoke;
* size budget.

Replace old bake tests with browser static snapshot tests.

---

## Implementation Phases

### Phase 0 — Branch and baseline

* Create branch.
* Preserve and review dirty changes.
* Run current test suite and package smoke.
* Save baseline bundle sizes and release output tree.

Commit:

```txt
chore: checkpoint unified static snapshot baseline
```

### Phase 1 — Public API rename

* Add `page.static`.
* Remove `BakeConfig` and `page.bake`.
* Rename baked data internals to static initial data.
* Add guard/path validation.
* Add tombstone CLI error for `mado bake`.

Commit:

```txt
refactor(page)!: replace bake config with static routes
```

### Phase 2 — Component and CSS foundations

* Serializable Shadow Roots.
* Existing DSD root reuse.
* Internal stylesheet source registry.
* Static style materialization helpers.
* Atomic static-root takeover marker.

Commit:

```txt
feat(component): support declarative shadow snapshots
```

### Phase 3 — Runtime readiness

* Add private static coordinator.
* Track router and initial resource work.
* Add diagnostics and timeout state.
* Add route-ready signal.

Commit:

```txt
feat(static): add runtime stability coordinator
```

### Phase 4 — Browser snapshot vertical slice

Support one fixed public route end-to-end:

```txt
Vite build
internal server
Chrome launch
wait for Mado stability
DSD serialization
write index.html
```

Do not add concurrency or dynamic paths until this slice works.

Commit:

```txt
feat(static): capture a route through the browser
```

### Phase 5 — Full route discovery

* Dynamic route params.
* Initial data.
* Head output.
* Guards validation.
* Multiple routes.
* Sitemap.
* Temporary output promotion.

Commit:

```txt
feat(static): generate public route snapshots
```

### Phase 6 — Release integration

* Preserve SPA shell.
* Root snapshot coexistence.
* New redirects and `404.html`.
* Precompression after snapshot.
* Deterministic output test.

Commit:

```txt
refactor(release)!: replace bake with static snapshots
```

### Phase 7 — Starters and dogfooding

* Update starter package scripts and dev dependencies.
* Convert the Mado site first.
* Add one static landing route, one dynamic docs route and one private SPA route.
* Verify JS-off, JS-on, raw HTML and social metadata.
* Run production preview.

Commit:

```txt
feat(starters): adopt unified static release flow
```

### Phase 8 — Documentation and cleanup

* Remove obsolete bake language in every locale.
* Remove SEO guidance based on `shadow: false`.
* Document Shadow DOM as canonical.
* Document static snapshot as delivery, not an authoring mode.
* Update README, `llms.txt`, `AGENTS.md`, API docs and deployment docs.
* Remove unused old renderer code and dependencies.

Commit:

```txt
docs!: replace bake model with unified static snapshots
```

---

## Definition of Done

The branch is ready to merge when all of the following are true:

```txt
✓ One component implementation is reused in SPA and static routes.
✓ Every canonical component uses Shadow DOM.
✓ A static route returns useful rendered HTML with JS disabled.
✓ Generated HTML contains Declarative Shadow DOM and component styles.
✓ With JS enabled, Mado performs one clean takeover without duplication.
✓ Social metadata is present in raw HTML.
✓ A private route remains a normal SPA route.
✓ Root snapshot does not pollute private-route fallback.
✓ Two releases are byte-identical in the pinned environment.
✓ No old page.bake, mado bake, #bake or out/baked concepts remain.
✓ mado release remains the only command needed for deployment.
✓ The Mado website itself ships successfully through this pipeline.
```

## Final Product Contract

```txt
Write a Mado page.
Write normal Shadow DOM components.
Mark public enumerable routes as static.
Run mado release.

Mado builds the SPA,
opens it in the browser,
waits until it is stable,
preserves Shadow DOM as standard HTML,
writes public route documents,
and keeps private routes as an SPA.

No server renderer.
No hydration.
No duplicate component model.
```

Это уже выглядит не как переделка старого `bake`, а как новый фундамент перед v1. Самый важный порядок: **сначала один static route целиком от Vite build до DSD-файла, затем dynamic paths/data/concurrency/docs**. Не стоит одновременно переписывать весь release pipeline до доказанного vertical slice.

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow "Element: attachShadow() method - Web APIs | MDN"
[2]: https://playwright.dev/docs/api/class-browsertype "BrowserType | Playwright"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/Element/getHTML "Element: getHTML() method - Web APIs | MDN"
