# Changelog

## Unreleased

Nothing yet.

## 0.8.0

Core reliability fixes from "Pulse" stress-test (Round 2): Kanban 210 cards,
Gantt 500-task computed chain, rapid navigation, field arrays with server
populate. Three critical issues found and resolved.

### Fixed

- **`ctx.attr()` — MutationObserver fallback.** `observedAttributes` is read
  once at `customElements.define()` time. Attributes registered via `ctx.attr()`
  inside `setup()` were too late for the browser's `attributeChangedCallback`.
  Now a single `MutationObserver` per instance covers all `ctx.attr()` attributes
  and auto-disconnects on component removal. This was a silent failure — the
  signal read the initial value correctly but never updated on external changes
  like `?disabled=${() => !form.isValid()}`.

- **`useForm().array().items()` — reactive reads.** The internal `read()`
  function used `values.peek()` (untracked) instead of `values()`. Effects and
  templates calling `items()` never re-ran when the array changed via
  `append()` / `replace()` / `remove()`. Field arrays populated from server
  data showed empty lists. One-line fix: `values.peek()` → `values()`.

### Added

- **`onDispose` in `PageContext`.** `page()` view now receives `onDispose(fn)` —
  tied to the same lifecycle as `resource()` / `effect()` but for manual
  subscriptions (`setInterval`, WebSocket, EventSource) that aren't auto-managed.
  Cleaned up automatically on navigation.

  ```ts
  export default page({
    view: ({ onDispose }) => {
      const id = setInterval(pollInbox, 3000);
      onDispose(() => clearInterval(id));
      return html`...`;
    },
  });
  ```

- **`ctx.attr()` regression test** confirming that external `setAttribute()`
  after `connectedCallback` correctly updates the reactive signal via the
  MutationObserver fallback path.

### Notes

- Core reactivity engine passes all stress checks: diamond dependency (500
  tasks, 1 recompute per batch), rapid navigation (20× board↔issue, 0 broken
  states), `persisted()` cross-tab sync via BroadcastChannel.
- Bundle size for a full Pulse app (8 pages, kanban, gantt, inbox, settings):
  **36.7 KB gzip** / 31.8 KB brotli.
- 141 tests, 138 pass, 0 fail, 3 skipped (browser-only).

## 0.7.0

Reactive component props, Shadow DOM + Forms fixes, deterministic releases,
and `mado serve` unification. Motivated by stress-test findings in a real-world
admin panel (see `MADO_TEST_REPORT.md`).

### Breaking Changes

- **`mado serve` in app-mode** no longer uses the legacy `serveStaticProject()`
  fallback. It now always goes through `server/serve.mjs`, which means
  `--host`, `--port`, `mado.config.json` dev.proxy, and HMR all work for
  generated apps. If you relied on the old no-HMR behaviour, pass
  `NO_HMR=1 mado serve`.

### Added — Framework

- **`ctx.attr(name, defaultValue?)`** — reactive attribute accessor for
  components. Returns a `Signal<string>` that auto-updates when the attribute
  changes on the host element via `attributeChangedCallback`. No more
  `MutationObserver` boilerplate in every component.

  ```ts
  component("x-badge", ({ attr }) => {
    const variant = attr("variant", "default");
    return () =>
      html`<span class=${() => `badge-${variant()}`}><slot></slot></span>`;
  });
  ```

  Attributes used with `ctx.attr()` are automatically added to
  `observedAttributes`.

### Added — Starters

- **`apiFetcher<T>()`** in `starters/admin/src/lib/api.ts` — a fetcher for
  `resource()` that attaches the Bearer token from memory. Use for protected
  endpoints instead of the plain `jsonFetcher()`.
- **`x-button`**: now bridges Shadow DOM → Light DOM form submit via
  `form.requestSubmit()`. Buttons inside Shadow DOM cannot natively trigger
  `<form>` submit in Light DOM — this is now handled automatically.
- **`x-button`**: uses `ctx.attr("disabled")` for reactive disabled state.
  External `?disabled=${() => !form.isValid()}` now correctly enables/disables
  the inner button.
- **`x-input`**: proxies `.name` and `.value` DOM properties on the host
  element so that `useForm().onInput` works after Shadow DOM event retargeting.

### Added — CLI / Build

- **`mado release --no-clean`**: release now cleans the entire `out/` directory
  before building (deterministic artifacts). Pass `--no-clean` to opt out.
  Previously stale assets, removed bake routes, and deleted public files could
  linger in the deploy artifact.
- **`scripts/bake.mjs`**: `<title>` now falls back to `page.title` if
  `head().title` is not explicitly set. Previously baked HTML kept the template
  `<title>` from `index.html` — a critical SEO gap.

### Added — Documentation

- **`docs/en/17-shadow-dom-forms.md`** — full recipe for using `useForm()` with
  Shadow DOM components (proxy properties, form submit bridge, ctx.attr()).
- **`llms.txt`**: added `ctx.attr()` section, `apiFetcher` recipe, and Shadow
  DOM + Forms guidance.

### Fixed

- **`x-button` in starters**: the disabled state was read once from
  `host.hasAttribute("disabled")` in the render function — never updating when
  the attribute changed externally. Every form using `?disabled` on `x-button`
  was broken from the start.
- **`x-input` in starters**: `useForm().onInput` received `undefined` for
  `name` and `value` because Shadow DOM retargets `e.target` from the inner
  `<input>` to `<x-input>`, which had no DOM properties.
- **`jsonFetcher()`**: the admin starter relied on `jsonFetcher()` for protected
  endpoints but it sends no Authorization header. Documented the pattern and
  added `apiFetcher()`.
- **`mado serve`**: app-mode did not respect `--host`, `--port`, or config
  settings. All flag pass-through now goes through `server/serve.mjs`.
- **`mado release`**: stale files from deleted bake routes or removed public
  assets could remain in `out/`. Now cleans `out/` fully before building.
- **`mado bake`**: `<title>` was not set in baked HTML if only `page.title`
  was defined (without `head().title`).

## 0.6.1

Starter & release-pipeline hardening pass. No public API breaks.
Identified from a lab pressure-test on `/admin/lab` plus a deep audit of the
starter / bundle / bake / dev-server contour. All fixes verified by
regression tests added in this release.

### Fixed

- **Starters**: every `index.html` in `starters/{admin,crud,minimal}/` now
  uses root-absolute paths in the importmap and entry `<script>` tag
  (`/node_modules/@madojs/mado/...`, `/dist/main.js`). Relative paths
  (`./node_modules/...`, `./dist/main.js`) broke hard-refresh of any nested
  route (`/admin/orders/42` → browser fetched
  `/admin/orders/dist/main.js` → 404 → blank page). Inline comments in each
  file explain the trap so it does not get reverted.
- **Starters/admin**: `pages/admin/order-detail.ts` now uses `each(items,
key, render)` instead of `o.items.map(...)`, matching `llms.txt` rule #3
  and the framework's own pitfalls documentation.
- **`scripts/bundle.mjs`**: cleans stale hashed assets before every build.
  Previously each `mado bundle` / `mado release` left old `main-<hash>.js`
  and `chunk-<hash>.js` in `out/assets/`; the rewriter then emitted
  `<link rel="modulepreload">` for every leftover `.js` it found, so
  production HTML shipped dead-code preloads without SRI. In app-mode the
  whole assets directory is wiped; in repo-mode only recognisable hashed
  files are removed so unrelated repo artifacts stay put.
- **`src/router/manifest.ts`**: opens a fresh component lifecycle scope
  around every `page.view()` / layout `view()` call and disposes the
  previous one on navigation (and on `router.dispose()`). `resource()`,
  `effect()` and `persisted()` created inside `page.view()` now register
  cleanup with that scope automatically — no more
  `[mado:resource-outside-lifecycle]` warnings on the framework's own
  canonical examples, and no more invalidator-subscription leaks across
  route changes.
- **`src/resource.ts`**: guards against stale responses overwriting fresh
  data on rapid key changes. The previous `AbortController` defence worked
  only if the user-supplied fetcher honored `AbortSignal` — for fetchers
  that ignore cancellation, a slow stale resolution for an old key could
  win over a fast fresh one. Both then/catch branches now also check
  `if (key !== lastKey) return`.
- **`server/serve.mjs`**: falls back to `./public/*` when a file is not
  found at the project root, mirroring what `mado release` does to `out/`.
  `favicon.svg`, `robots.txt`, `og-image.png` etc. no longer 404 in dev.
- **`server/serve.mjs`**: prints an actionable hint on `EPERM`/`EACCES`
  pointing at `mado dev --host 127.0.0.1` (the default host changed from
  the implicit `0.0.0.0` to `localhost`, which is friendlier in sandboxed
  environments).
- **`scripts/preview.mjs`**: serves prerendered HTML from `<out>/baked/`
  with priority over the SPA shell. Previously `mado preview` only looked
  at `out/` and never saw bake's output, so prerendered routes returned
  the empty SPA shell — looking like a "blank page" bug even when bake
  had succeeded.

### Added

- **`mado dev` / `mado serve` flag pass-through**: `cli.mjs` now splits
  positional arguments from flags via `splitDevArgs()`, so calls like
  `mado dev --host 127.0.0.1`, `mado dev showcase --port 6000` and
  `mado dev -- --host 0.0.0.0` all work. Previously the CLI mistook the
  flag for an example name and exited with `unknown example`.
- **`server/serve.mjs`**: tiny argv parser supporting `--host`, `--port`
  and `--host=value` forms; HOST and PORT also fall back to environment
  variables and `mado.config.json` (`dev.host`, `dev.port`).
- **`scripts/preview.mjs`**: same `--host` / `--port` flags as the dev
  server, plus a startup banner showing `url:` / `out:` / `baked:` so it
  is obvious which directories preview is serving from.
- **`scripts/bake.mjs`**: fails loudly when the manifest exists but no
  page declares `bake: { paths, data }`. The previous behaviour produced
  `0 pages + sitemap.xml` silently with exit code 0, making `mado
release` look successful while shipping only the SPA shell with no
  SEO-friendly HTML. The new warning prints the skipped routes, a
  worked example bake snippet, and exits non-zero. Override with
  `MADO_BAKE_ALLOW_EMPTY=1` for intentional SPA-only deploys.
- **`scripts/bake.mjs`**: clearer "missing dev dep" errors — when
  `linkedom` or `esbuild` is missing the message now tells the user
  exactly which packages to `npm i -D`.
- **Starter landing pages**: `home.ts` in all three starters now declares
  `bake: { paths: () => [{}], data: () => ({}) }` and a `head()` so
  `mado release` actually prerenders the landing page out of the box.
- **Starter `devDependencies`**: `linkedom` and `esbuild` added to
  `starters/{admin,crud,minimal}/package.json` so `mado release` works
  immediately after `mado init <app>` + `npm install`, without manual
  follow-up installs.
- **Regression tests** (`test/`):
  - `starter-html-paths.test.mjs` — asserts every starter `index.html`
    uses root-absolute paths in both the importmap and the entry script.
  - `bundle-cleanup.test.mjs` — end-to-end: runs `mado bundle` twice on
    a synthesized temp project (mutating source between runs) and
    asserts there is exactly one `main-<hash>.js` in `out/assets/`
    afterwards.
  - `resource.test.mjs` (2 new cases) — stale-response races: a fetcher
    that ignores `AbortSignal` with key=1 slower than key=2, plus a
    rapid 3-way key thrash where the final key is the slowest fetch.
    Both assert `data()` reflects the latest key, not the fastest
    response.

### Changed

- **`server/serve.mjs`** default host is now `localhost` (was implicitly
  `0.0.0.0`). LAN exposure is opt-in via `mado dev --host 0.0.0.0` or
  `HOST=0.0.0.0`. The startup banner shows both the bound host and a
  click-friendly URL (`localhost` substituted when bound to `0.0.0.0`).

### Notes

- No public API changes; no migrations required. Apps that previously
  worked on a fresh-out-of-the-box `mado init` did so only because
  someone manually fixed the starter's relative paths and dev deps —
  this release closes those gaps so the documented "happy path" actually
  is happy.
- If you intentionally deploy SPA-only (no prerendered HTML), drop
  `mado bake` from your release pipeline or set
  `MADO_BAKE_ALLOW_EMPTY=1`; otherwise bake will now fail your
  CI with a clear pointer to the missing config.
- Test count: 137 pass, 0 fail, 3 skipped (Playwright e2e — unchanged).

## 0.6.0

Product-surface release: app-mode defaults, blessed admin starter, release
pipeline, core hardening and v1 recipe docs.

Phase 1 — Repo-vs-app split:

### Added

- `MADO_V1_PLAN.md` — executable tracker for the v1 push.
- `scripts/_config.mjs` — single configuration loader (defaults < `mado.config.json`
  < CLI flags). Exports `loadConfig`, `detectContext`, `parseFlags`,
  `resolveProjectPath`. [v1 F1.1]
- `mado release` command: one-shot `typecheck + build + bundle + bake + copy
public/ → out/` pipeline so apps have exactly one command to ship. [v1 F1.3]
- `mado.config.json` shipped in the `minimal` and `crud` starters with the
  default app-mode layout (`src/routes.ts`, `index.html`, `out/`). [v1 F1.4]
- Tests: `test/config-loader.test.mjs`, `test/bake-cli.test.mjs` (11 + 3
  cases covering context detection, config precedence, flag parsing, bake
  flags, and the no-more-silent-`[object Object]` contract). [v1 F1.6]

### Changed

- `scripts/bake.mjs` now reads configuration from `mado.config.json` and
  accepts `--entry`, `--template`, `--out`, `--base-url` flags. In app-mode
  defaults are `src/routes.ts` + `index.html` + `out/baked/`; the
  `@madojs/mado → src/index.ts` alias is repo-only. [v1 F1.2]
- `scripts/bake.mjs` no longer renders unsupported values as `[object Object]`;
  it raises a loud, file/route-targeted error with a hint instead. [v1 F1.2]
- `scripts/cli.mjs` detects repo-vs-app context, advertises `mado release`,
  and ships a redesigned `mado help` that explains the dev / build / release
  / preview pipeline. [v1 F1.3]
- Starter `package.json` scripts go through the `mado` CLI exclusively
  (`mado build`, `mado dev`, `mado bundle`, `mado bake`, `mado release`,
  `mado preview`). [v1 F1.4]
- `docs/en/02-project-layout.md` rewritten around the canonical `src/` /
  `dist/` / `public/` / `out/` model plus a `mado.config.json` one-screen
  reference. [v1 F1.5]
- `ROADMAP.md`, `TODO.md`, `AGENTS.md` now distinguish the completed
  `MADO_V1_PLAN.md` archive from future roadmap/TODO work. [v1 F0]

Phase 2 — One blessed way:

### Added

- `layout()` factory in `src/page.ts` (alias of `nested()`) plus `Guard` and
  `GuardResult` types. Exported from the public API. [v1 F2.1 / F2.3]
- Route guards: nested groups and individual pages accept `guard: Guard | Guard[]`.
  Verdicts: void (pass), `{ halt: true }`, or `{ redirect, replace? }`. Async-aware
  with a sync fast path; throwing guards are treated as `halt`. [v1 F2.2]
- New starter `starters/admin/`: nested manifest with `/`, `/login`, `/admin`
  groups; blessed `lib/api.ts` (`createApiClient`, `ApiError`, single-flight
  401-refresh) and `lib/auth.ts` (`accessToken`, `restoreSession`, `requireAuth`,
  `login`, `logout`); `layouts/{app,auth}.ts` with a real admin shell; tiny
  `x-button`/`x-input` design-token components; dashboard + orders + order-detail
  pages; `mado.config.json` with a dev `/api` proxy; `public/favicon.svg`. [v1 F2.4]
- CLI advertises `mado init <name> --starter admin` and lists it in `mado help`.
  [v1 F2.5]
- `docs/en/11-layouts.md` — the canonical layout recipe (nested routes) plus
  two acceptable alternatives with caveats. [v1 F2.6]
- `docs/en/12-auth-and-api.md` — the blessed `api`/`auth` recipes, backend
  contract, and dev-proxy hint. [v1 F2.7]
- `test/guards-layouts.test.mjs` — 7 cases covering the public `layout()`
  alias, sync pass/halt/redirect, async guards, parent→page guard order, and
  throwing-guard fallback. [v1 F2.8]

Phase 3 — Bake first-class + Release pipeline:

### Added

- `mado release` writes `_redirects` (`/* /index.html 200`) and `_headers`
  (immutable for `/assets/*`, no-cache for HTML) into `out/` when they do not
  exist, so Cloudflare Pages / Netlify deploys "just work". [v1 F3.7]
- `docs/en/13-deployment.md` — VPS + nginx, Cloudflare Pages, S3/CloudFront,
  Netlify and GitHub Pages recipes; cache-control matrix; GitHub Actions
  release sketch; troubleshooting (deep-link 404, HTML caching, `[object Object]`).
  [v1 F3.8 / F3.9]
- `test/release-pipeline.test.mjs` — end-to-end test: scaffold a temp app,
  symlink the local framework, run `mado release`, assert that `out/index.html`,
  `out/baked/index.html`, `out/baked/sitemap.xml`, `out/_redirects`, `out/_headers`,
  and copied `public/` assets are all present. [v1 F3.10]

### Changed

- `scripts/preview.mjs` now reads `mado.config.json` (`build.out`, `dev.port`),
  refuses to auto-build by default in app-mode, and asks the user to run
  `mado release` first. Legacy auto-build is opt-in via `PREVIEW_AUTOBUILD=1`
  for the framework repo. [v1 F3.3]
- `scripts/bundle.mjs` is now app-mode aware: reads `mado.config.json` for
  defaults, accepts `--entry/--html/--out` flags, and writes hashed bundles
  into `out/assets/` so the new nginx / Cloudflare cache rules apply. The old
  `examples/showcase` defaults are kept only in repo-mode for dogfooding.
  [v1 F3.10]
- `server/serve.mjs` honors `dev.proxy` from `mado.config.json` and forwards
  matching prefixes (e.g. `/api → http://localhost:3000`) without external
  dependencies. The startup banner prints the active proxy table. [v1 F3.6]

### Deferred to v0.7

- `mado dev` does not yet serve baked routes inline. Workaround: run
  `mado release && mado preview`. [v1 F3.2]
- `mado check` (bake-safety scan over `bake:` routes) is not exposed yet.
  The loud-error contract in `scripts/bake.mjs` covers the regression case.
  [v1 F3.5]

Phase 4 — Core hardening:

### Added

- `computed(fn, { equals })` option to suppress subscriber reruns when an
  observed computed recomputes to an equal value. [v1 F4.3]
- HTML directives: `unsafeHTML()`, `ref()`, `classMap()` and `styleMap()` are
  exported from the public API. Runtime bindings enforce valid positions and
  clean up stale classes/styles/refs on updates and disposal. Bake can serialize
  the static directive shapes it can safely represent. [v1 F4.4]
- `useForm()` now supports async validators via form-level `validateAsync`,
  field-level `validateAsync`, `validating` / `validatingFields`, and explicit
  `validate()` / `validateField()` methods. [v1 F4.5]
- `useForm().array(name)` adds a small field-array helper with dotted path names
  (`items.0.title`) and wildcard schema validation (`items.*.title`). [v1 F4.5]
- `test/signal-cycle.test.mjs` covers self-triggering effect cycle detection.
  [v1 F4.2]
- `test/html-directives.test.mjs` covers directive rendering, cleanup and
  invalid child-position usage. [v1 F4.4]
- `test/forms.test.mjs` covers async validator races, async submit blocking,
  and field-array wildcard validation. [v1 F4.5]
- Phase 4 now has an explicit coverage audit tying every core-hardening task to
  its regression tests. [v1 F4.9]

### Changed

- `computed()` now releases dependency subscriptions after unobserved reads and
  after the last subscriber is disposed, avoiding long-lived stale subscriptions
  in the signal graph. [v1 F4.1]
- The effect scheduler now detects runaway self-triggering cycles and emits a
  clear diagnostic instead of flushing forever. [v1 F4.2]
- Runtime head management now clears Mado-managed tags on every navigation,
  including pages without `head()` and pages whose `head()` throws, so stale
  baked/runtime SEO tags cannot leak across routes. [v1 F4.8]
- Router navigation now saves/restores scroll positions for back/forward,
  scrolls new navigations to the top, and moves focus to the main content
  landmark after navigation. [v1 F4.6]
- `routes()` now supports a global `errorPage(err, params)` route boundary for
  lazy loader, `load()` and `view()` errors, while local `page.errorView` still
  wins. [v1 F4.7]

Phase 5 — Documentation:

### Added

- `docs/en/10-app-architecture.md`, `14-testing.md`, `15-error-handling.md`
  and `16-bake-cookbook.md` complete the v1 English recipe set. [v1 F5.1-F5.4]
- `AGENTS.md` now includes an "App architecture for LLM" section and `llms.txt`
  links the v1 architecture, layout, auth/API, deployment, testing,
  error-handling and bake docs. [v1 F5.5-F5.6]
- Russian, French and Ukrainian documentation now includes localized versions of
  the v1 recipe docs `10` through `16`. [v1 F5.7]

## 0.5.1

Patch release focused on first-user DX after the public npm launch.

### Fixed

- Generated starter apps can now run `mado dev` / `mado serve` from the app
  root instead of assuming the framework repository layout.
- The CRUD starter shell is a real Web Component again, using Shadow DOM and
  `<slot>` for route projection.
- Feature components in the CRUD starter are imported by the pages that render
  them, avoiding a confusing "import everything in main" pattern.
- The minimal starter counter tag registration now matches the rendered
  `<x-app-counter>` tag.
- The router default 404 view is rendered through `html` templates, not dynamic
  `innerHTML`.
- `npm run bundle` defaults to the existing showcase entry instead of the old
  removed `examples/main.ts`.

### Changed

- Starter packages include `npm run dev` and generated `.gitignore` defaults.
- README and docs clarify that Mado works with browser primitives rather than
  replacing the platform.
- Form documentation now describes `useForm()` as schema-based validation close
  to HTML constraints, matching the implementation.
- Shadow DOM / Light DOM docs now explain layout components, `<slot>`, and
  component registration imports.
- Deep imports are documented as internal/unstable before v1.
- CI workflows use Node24-based GitHub actions and the obsolete Cloudflare
  showcase deploy workflow was removed.
- The release workflow updates npm before publish and creates GitHub releases
  through the GitHub CLI.
- Browser regression now runs on a weekly schedule as well as manually.

## 0.5.0

First public release preparation for Mado.

### Added

- `mado init <name>` project creation command.
- `minimal` and `crud` starters included in the npm package.
- GitHub CI workflow with typecheck, build, tests, package dry-run and tarball starter smoke.
- Tag-based release workflow for npm publishing after Trusted Publishing is configured.
- Manual browser regression workflow.
- Release notes generator based on Conventional Commit subjects.

### Changed

- Package version is set to `0.5.0`.
- npm package files include starters, AI-agent docs and changelog.

### Release Notes

- First npm publish is intended to be manual.
