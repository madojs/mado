# Changelog

## Unreleased

### 0.12.0 stable polish

Two rounds of post-rc polish before the 0.12.0 cut:

#### Pre-merge fixes (carried over from the rc.1 review)

- **Router base/prefetch.** `routeUrl()` on `"/"` and hover-prefetch
  on Vite `base` deployments now resolve correctly under any sub-path
  (`/`, `/mado/`, `/admin/`).
- **`mado static` cleanup.** No more race between `process.exit` and
  capture; canonical `<link>` is stripped on SPA navigation into pages
  that don't declare their own head metadata.
- **Discovery.** `mado static` no longer bypasses `fatal()` when
  Vite SSR import fails; failures abort the snapshot.
- **Modular starter.** All internal anchors flow through
  `routeUrl()` + `data-link`; generators are context-aware and
  refuse to overwrite existing files.
- **`package:smoke`.** Now exercises both the default and modular
  starters end to end.
- **Release publishing.** `next` versions stay on the `next`
  dist-tag; `latest` is reserved for stable cuts. The release and
  weekly workflows install a pinned Playwright Chromium so static
  snapshots never silently skip on CI.
- **`mado preview`.** Prints the active base URL so users browsing
  under a sub-path see the right entrypoint.
- **`TODO.md` / `CONTRIBUTING.md` / `package.json#files`** trimmed
  to match the post-rc reality.

#### Documentation reorganisation

`docs/en/` was rewritten so users (and LLMs) get one happy path:
**"don't think `shadow: true` vs `shadow: false`; pick `page()` for
URLs and `component()` for reusable widgets."**

- **New flagship doc** `docs/en/10-pages-and-components.md` —
  "the one rule": `page()` for routes, `component()` for reusable
  `<x-tag>`s. Anti-patterns + decision table + `{ shadow: false }`
  escape hatch.
- **New numbering** groups docs into Start here / Concepts /
  Production / Reference / Meta. Migration map for stale links is in
  `docs/en/README.md`.
- **Consolidated pages** —
  `11-templates-and-signals.md` (NEW), `12-routing.md` (merges old
  routing + layouts), `13-data.md` (merges old data + auth/api),
  `14-forms.md` (merges old forms + Shadow-DOM forms),
  `15-static-snapshots.md`, `16-app-architecture.md` (merges old
  project-layout), `01-quickstart.md` (merges old IDE-setup),
  `40-llm-guide.md` (merges old pitfalls + zero-history test).
- **Deleted** `docs/fr`, `docs/uk`, `docs/ru` — English-only since
  v0.12. Several legacy `docs/en/*` files were removed; their
  content lives in the consolidated pages.
- **Truth pass on retained prose.** Killed obsolete claims:
  no more "tsc-only", "no bundler", "SSE reload", "tsc → browser",
  "edge prerender", "import maps". Vite is consistently named as
  the canonical transport.
- **`scripts/docs-lint.mjs`** now also blocks the obsolete vocabulary
  above and any links to renamed `docs/en/*` filenames in active
  docs; the migration table in `docs/en/README.md` is wrapped in a
  `docs-lint:allow-legacy-mention` block.

## 0.12.0-rc.1 - 2026-06-22

The unified pre-merge release. Mado is no longer "a calm browser-native
SPA framework for internal tools"; it becomes **"a calm native-first
web framework for sites and apps"** with one component model end to end.
The full plan is preserved as
[ADR 0001 — Browser-rendered static snapshots](./docs/architecture/adr/0001-browser-static-snapshots.md).

### Positioning

- New tagline: **One component model. One page model. One release command.**
- README, `package.json` (description + keywords), CLI help and starter
  READMEs all updated to the sites-and-apps positioning.
- `MADO_UNIFIED_PRE_MERGE_PLAN.MD` moved to
  `docs/architecture/adr/0001-browser-static-snapshots.md`.

### Added

- **`src/router/base.ts`** — single source of truth for the Vite base.
  Exports `appBase`, `normalizeBase`, `stripBase`, `withBase` and the
  new public `routeUrl()` helper. The runtime reads
  `import.meta.env.BASE_URL` once and exposes it through these helpers
  so every internal link is base-aware without any application
  configuration.
- **Production-served snapshot → live takeover E2E gate.**
  `test/static/dsd-takeover.test.mjs` now scaffolds a real app, runs
  `mado release`, hosts it through `mado preview` and asserts the
  takeover contract through headless Chromium with strict
  no-`.catch()` assertions.
- **Base-path fixture.** `test/static/base-path.test.mjs` proves the
  whole `/mado/` deployment shape end to end: build, sitemap, capture,
  preview redirects, SPA fallback, runtime stripBase/withBase.
- **Canonical / `og:url` auto-fallback.** When a page does not declare
  either, the snapshot pipeline derives an absolute
  `site + base + pathname` URL, deduplicates duplicates and rejects
  localhost / capture-origin values.
- **Strict `JsonValue` validator** with path-aware errors. Date / Map /
  Set / class instances / undefined / NaN / Infinity / cycles all fail
  the build with the exact JSON path that broke
  (`[mado:static] /products/keyboard: seed.product.createdAt is Date`).
- **Universal default starter** (`mado init my-app`). ~15 source
  files, no backend required, demonstrates one Shadow Component shared
  between a static landing page and a live SPA route.
- **Modular starter preserved** (`mado init my-app --starter modular`)
  as the long-lived business-application reference architecture.
- **HTTP policy documented** in `scripts/static/browser.mjs`: fatal
  vs ignored vs quality-hint classes are explicit, with bounded
  timeouts for fonts and paint frames.
- **`scripts/docs-lint.mjs`** refuses the old vocabulary in current
  docs (page.bake, mado bake, out/baked, "No Vite required",
  "internal tools only") while still allowing it in migration guides
  and ADRs.
- **Required CI gate** `.github/workflows/ci.yml → static-snapshot`
  installs Playwright-managed Chromium with
  `npx playwright install --with-deps chromium` and runs the static
  tests under `MADO_REQUIRE_BROWSER=1` so they cannot silently skip.

### Changed (breaking)

- **`mado build`** in app contexts now performs a Vite production
  build of the deployable SPA (`vite build`). Inside the framework
  repository it still calls `tsc`. The internal tsc compile is
  exposed via `npm run build` in the repo. Use `mado typecheck` if
  you only wanted `tsc --noEmit`.
- **`out/_mado/build.json`** is dropped from the final release
  artifact. It is internal CLI plumbing emitted by the
  `@madojs/mado/vite` plugin so `mado static` and `mado preview` can
  read the resolved Vite base/site without parsing `vite.config.ts`.
  `mado preview` now derives the base from the build bridge OR from
  the asset prefix in `out/index.html`, so the preview works on the
  shipped artifact.
- **Static output staging.** `out/_mado/spa.html` is no longer touched
  until every static route captures cleanly; a failure mid-pipeline
  leaves the previous deployment intact. `cleanupTemp()` always runs
  in `finally`.
- **`whenStable()` phase-bounded.** The runtime now waits for
  routeReady (cap: 15s) and tracked resources (cap: 15s) separately
  so timeout diagnostics name the failing phase. Fonts and paint
  frames are best-effort with bounded timeouts (5s / 1s); on timeout
  the snapshot proceeds with a diagnostic instead of failing.
- **Browser launch order.** `chromium.launch()` (Playwright-managed)
  is tried *before* `channel: "chrome"` so CI determinism does not
  depend on whatever branded Chrome happens to be installed.

### Migration

| Before | After |
|---|---|
| `page.bake` | `page.static` |
| `mado bake` | `mado static` |
| `out/baked/...` | `out/<route>/index.html` |
| `#bake` data | `data-mado-static-data` script |
| `shadow: false` for SEO | open Shadow DOM (snapshotted as DSD) |
| `site` was optional | required for any `static` route |
| Vite plugin optional | canonical transport |
| `mado build` ≈ `tsc` | `mado build` ≈ `vite build` |

## 0.11.1 - 2026-06-21

Patch release for CI/release workflow cleanup after the Vite migration.

### Fixed

- **CI no longer references removed legacy paths or scripts.** The main workflow
  now checks the current repo surface (`src`, `scripts`, `starters`, `test`,
  docs and GitHub metadata) instead of removed `examples`, `server`,
  `templates`, `ROADMAP.md`, root `nginx.conf`, and `Dockerfile` paths.

- **Removed the deleted `npm run llm:smoke` CI step.** LLM guidance is now
  covered by docs and package smoke checks rather than the old examples-based
  smoke script.

- **Replaced the stale browser workflow.** The old scheduled browser workflow
  called a missing `npm run test:browser`; it now runs the publish gate, size
  budget and package smoke checks as a weekly smoke workflow.

- **Release workflow now runs the same gate used locally.** Tag releases run
  `prepublishOnly`, size budgets and package smoke before packing/publishing.

- **Cleaned CodeQL/static-analysis findings.** Tests no longer use async
  Promise executors, dead smoke reads, unused helpers/imports, or misleading
  mutation assertions; diagnostics and bake branches were clarified without
  changing runtime behavior.

## 0.11.0 - 2026-06-21

Vite-era release. Mado keeps the browser-native runtime, but generated apps now
use Vite for dev/build/release instead of Mado maintaining its own app bundler.

### Added

- **Vite plugin subpath.** `@madojs/mado/vite` exports `mado()`, the canonical
  Vite plugin for app projects. It provides Mado defaults for app builds while
  leaving runtime code dependency-free.

- **Canonical default starter.** `mado init` now scaffolds the single official
  starter from `starters/default`: Vite config, `public/`, module-oriented app
  structure, Shadow DOM-friendly CSS, CLI generator conventions, and no old
  importmap/dist entry paths.

- **`mado new` generators.** The CLI can scaffold modules, pages, connectors,
  resources, services, forms, components, guards, and layouts using the default
  starter conventions.

### Changed

- **`mado dev` runs Vite.** Development now uses Vite's dev server instead of a
  custom Mado dev server. Mado-specific HMR is intentionally simple full reload.

- **`mado release` is Vite-first.** Release now cleans `out/`, typechecks, runs
  Vite build, bakes route HTML from the production `out/index.html`, writes
  static host files, and precompresses assets.

- **Bake uses Vite module loading.** Route manifests are loaded through Vite's
  module/SSR loader, so TypeScript, aliases, env handling, and plugin resolution
  match the app build path.

- **Baked route HTML is written directly into `out/<route>/index.html`.**
  `out/baked/` is no longer part of the default deploy artifact. Use
  `mado release --keep-bake-dir` only when a debug copy is useful.

- **CLI internals were split into `scripts/cli/`.** The public `mado` binary is
  unchanged, but command implementation is no longer one large script.

- **Tests are grouped by context.** Test files now live under `test/bake`,
  `test/cli`, `test/html`, `test/package`, `test/router`, and `test/runtime`.

### Removed

- **Legacy app bundler and server code.** The custom bundle/server path and
  config-loader compatibility layer were removed in favor of Vite.

- **Bundled examples and old starters.** Large examples were extracted out of
  the package repository. `starters/admin`, `starters/crud`, and
  `starters/minimal` were replaced by `starters/default`.

- **Legacy root artifacts.** The Docker/nginx deployment sample moved to
  `docs/recipes/nginx/`, and archived v1 planning documents were removed from
  the active repository surface.

- **Core compatibility aliases.** Legacy `src/html.ts` and `src/router.ts`
  alias files were removed now that the pre-stable public surface has been
  cleaned up.

### Docs

- Rewrote EN/RU/FR/UK docs around the new model: `index.html` is the Vite
  entry, `public/` is static copy input, and `out/` is the deploy artifact.
- Updated architecture, routing, bake, deployment, testing, Shadow DOM/style,
  LLM guidance, and starter docs to point at the canonical default starter.
- Synced `TODO.md` into a small backlog instead of a stale roadmap-style list.

## 0.10.1 - 2026-06-12

Patch release for the production bake/preview path.

### Fixed

- **Baked pages now use the production bundle during `mado release`.** Release
  now bakes from the already bundled `out/index.html`, so baked HTML references
  `/assets/main-*.js` instead of the dev-only `/dist/main.js`.

- **Client boot no longer appends pages below baked HTML.** `mado bake` marks
  the app container with `data-mado-baked`, and runtime `render()` replaces
  that marked static DOM with live bindings on startup. This keeps bake as a
  static first-paint/SEO shell, not SSR hydration, while avoiding duplicate
  landing + route content after navigation.

- **`mado preview` now serves the final `out/` artifact exactly.** Release
  promotes baked HTML into real route paths inside `out/`, and preview no
  longer applies a preview-only virtual mapping from `out/baked/`.

- **`sitemap.xml` is promoted to the site root during release.** Standalone
  `mado bake` still writes `out/baked/sitemap.xml`; `mado release` also copies
  it to `out/sitemap.xml`, where static hosts and crawlers expect it.

### Docs

- Updated EN/RU/FR bake, deployment and project-layout docs to describe the
  production release artifact, promoted baked routes, root sitemap and
  `data-mado-baked` client boot behavior.

## 0.10.0 - 2026-06-12

Surface-cleanup and API-lock release from the v1 tracker Phase B: legacy public
surface is removed, package exports are closed, docs/LLM guidance match the real
API, and CI now protects package, size, release and LLM-smoke contracts.

### Fixed

- **Component attribute changes no longer clobber host properties (B1).**
  Legacy `observedAttributes` reflection used to write `this[name] = value`
  from `attributeChangedCallback`, overwriting `.prop=` bindings and custom
  host state such as `.value`. Attribute changes now update only `ctx.attr()`
  signals; `ctx.attr()` is the canonical reactive attribute API.

- **Removed `component(..., { observedAttributes })` (B2).** `ctx.attr()` is now
  the single reactive-attribute API. It installs a per-instance observer for the
  attributes used during setup, so component options no longer carry a second
  attribute mechanism.

- **Package exports are explicit (B3).** The npm package no longer exports
  `./*`. Public imports are limited to `@madojs/mado` and
  `@madojs/mado/devtools.js`; internal files such as `lifecycle.js` are no
  longer package subpaths.

- **Internal `_testHooks` are stripped from declarations (B4).** Runtime hooks
  remain available to the repository's own tests, but emitted `.d.ts` files no
  longer advertise them as public API; the router barrel also no longer
  re-exports manifest test hooks.

- **README now states the explicit No list (B5).** The project boundary is
  documented: no SSR hydration, template compiler, separate store library,
  Suspense, router plugin system, built-in i18n/animation/virtual-scroll
  primitives, or non-evergreen browser support. Browser baseline is pinned to
  Baseline 2023.

- **`resource()` dedupes in-flight requests by key (B6).** Concurrent resources
  with the same key now share one fetch. If the same in-flight key is used with
  different fetcher functions, Mado warns once because the cache key is likely
  too broad. README/docs now spell out resource key discipline.

- **`each()` warns on duplicate keys (B7).** The positional-suffix fallback is
  preserved so every item still renders, but duplicate keys now produce a
  `warnOnce` diagnostic because they are almost always a data bug.

- **API freeze map published (B8).** `docs/en/18-api-freeze-map.md` now defines
  the stable root API, the public devtools subpath, and the internal modules
  that are not protected by SemVer.

- **Reactivity ordering contract published (B9).** `docs/en/19-reactivity-ordering.md`
  documents signal/effect/batch ordering, nested-template update reuse and
  component teardown timing. A new invariant test pins nested-batch effect
  scheduling.

- **v1 stability contract published (B10).** `docs/en/20-v1-stability.md`
  defines what SemVer protects after v1 and what remains internal or
  implementation-specific, including bundle byte output and internal module
  layout.

- **Agent and LLM guidance synced to the real API (B11).** `AGENTS.md`,
  `.clinerules`, `.cursorrules` and `llms.txt` now document C7 parser hard
  errors, C6 mutation concurrency, stateless `layout.view` wrappers, public
  package imports and `bake` as a static meta-shell rather than SSR/SSG runtime.

- **`mado init` writes required dev dependencies (B12).** Generated apps now
  include `typescript`, `esbuild` and `linkedom` as dev dependencies, sourced
  from the package's own tool versions. README/agent wording now says zero
  **runtime** dependencies instead of implying no build tooling exists.

- **Size budgets are enforced in CI (B13).** `npm run size` bundles the full
  public API and the showcase app, then fails on gzip regressions above the
  current budgets: public API < 16 KiB, showcase app < 42 KiB.

- **Published tarball smoke test added (B14).** `npm run package:smoke` packs
  the package, installs the tarball in a temp project, checks that public
  imports work and `@madojs/mado/lifecycle.js` is blocked with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`, then scaffolds a clean app and runs
  `mado release`.

- **Release output is deterministic (B15).** `bake-stamp` was removed from baked
  HTML, and the release pipeline test now runs `mado release` twice on the same
  input and compares the entire `out/` tree byte-for-byte.

- **LLM zero-history test is a CI smoke (B16).** `npm run llm:smoke` validates
  that `llms.txt` retains the key Mado guidance, checks the committed
  `examples/tickets` artifact for required APIs and forbidden React-shaped
  patterns, then builds and runs the tickets smoke test.

- **Localized docs synced for Phase B (B17).** RU/FR/UK docs now include the
  API freeze map, reactivity ordering and v1 stability pages, plus the Phase B
  updates for resource key discipline, deterministic bake metadata and the
  LLM-smoke CI proxy.

## 0.9.0 - 2026-06-12

Correctness release from the v1 tracker Phase A: C1-C8 are closed with focused
regression tests.

### Changed

- **`mutation().run()` is concurrent by default (C6).** Previously a `run()`
  aborted any previous in-flight run, so two quick submits of different entities
  through one mutation cancelled the first POST client-side — its `invalidates`
  never fired even though the server had likely applied it. Mutations are now
  concurrent: each `run()` has its own `AbortController`, `loading` is an
  in-flight counter (true until the last run settles), and aborting the previous
  run is opt-in via `mutation(fetcher, { abortPrevious: true })` for
  search-as-you-type. `reset()` aborts all in-flight runs. **Behavioural change**
  (done before the v1 API freeze). Regression test:
  `test/mutation-concurrent.test.mjs`.

### Fixed

- **Lifecycle/router defect pack is closed (C8).** `onDispose()` registered
  after a lifecycle was already disposed now runs immediately instead of being
  dropped. SPA link interception now respects `target="_blank"` and `download`.
  Same-path `#hash` navigation scrolls to its anchor instead of being swallowed
  by signal deduplication. Guard redirects now have a per-tick loop detector
  that reports and halts mutually-redirecting routes. Regression test:
  `test/lifecycle-router-pack.test.mjs`.

- **Parser fails loudly instead of silently dropping bindings (C7).** A `${}`
  slot inside a RAW_TEXT element (`<textarea>`/`<title>`/`<style>`/`<script>`)
  was silently ignored — an LLM writing `<textarea>${draft}</textarea>` got
  neither an error nor a render. And a nested `html\`<path …>\`` for `<svg>` was
  parsed in the HTML namespace, producing an invisible element. The parser now
  throws a clear, fixable error in both cases (the RAW_TEXT message points at
  `.value=`; the SVG message says to keep SVG content in one `<svg>…</svg>`
  template). A self-contained `<svg>` still works. Regression test:
  `test/html-rawtext-svg.test.mjs`.

- **Forms: stale async validation no longer lands on a shifted field-array row


  (C5).** `useForm().array()` mutations (`remove`/`move`/`replace`/…) shift
  indices, but an in-flight `validateAsync` for e.g. `items.2.title` still
  matched its per-path generation guard and wrote its result onto a row that had
  moved — a red error "jumping" onto a neighbouring valid row after a delete.
  Array writes now bump the validation generation for every in-flight path under
  the array prefix, so stale results are discarded. Row identity remains
  positional. Regression test: `test/forms-array-stale-async.test.mjs`.

- **`computed({ equals })` no longer breaks `batch()` atomicity (C4).** An

  observed `equals`-computed recomputed eagerly inside `set()`, so during
  `batch(() => { x.set(2); y.set(2) })` a computed reading both `x` and `y` ran
  on half-applied state `(new x, old y)` — observing an inconsistent snapshot,
  potentially notifying with it, and running once per `set()`. An observed
  `equals`-computed invalidated inside a batch now defers its recompute+compare
  to a queue drained at the end of the outermost `batch()`, so it runs once on
  fully-applied state. Behaviour outside a batch is unchanged. Regression test:
  `test/signal-batch-equals.test.mjs`.

- **`update()` reuses nested templates instead of recreating them (C3).** A

  renderer returning a nested `html\`\`` (e.g. a conditional form block) rebuilt
  its entire subtree on every change of any signal it read, because `renderChild`
  always did clear + re-instantiate for a single `TemplateResult` — unlike
  `each()` and `render()`, which compare `_strings` and patch in place. Focus and
  `<input>` values inside such blocks were lost and listeners re-attached.
  `renderChild` now reuses the existing instance via `update()` when the new
  value is a single `TemplateResult` with matching `_strings`, preserving DOM
  identity; a structurally different template still rebuilds. Regression test:
  `test/update-nested-reuse.test.mjs`.

- **`persisted()` cross-tab sync no longer ping-pongs, and `destroy()` is

  complete (C2).** For object/array values, every cross-tab message produced a
  new structured-clone identity, so the publisher effect re-broadcast each
  received value forever (a single change generated 80+ messages in the
  regression test). Cross-tab values are now echo-suppressed by their serialized
  form, so an arriving value is never re-published. `destroy()` previously only
  closed the channel and cleared storage while leaving the write/publish effects
  alive — so the next `set()` re-created the key; it now disposes both effects,
  clears the debounce timer, and marks the signal inert. `persisted()` also
  registers `destroy()` with the active component/page lifecycle, so a persisted
  signal created inside `setup()` no longer leaks. Regression test:
  `test/persisted-crosstab.test.mjs`.

- **`each()` reorder no longer destroys custom-element state (C1).** Moving a
  connected node (which keyed `each()` does via `insertBefore`) fires
  `disconnectedCallback` → `connectedCallback` synchronously, and the old

  `disconnectedCallback` tore the component down immediately — re-running
  `setup()` and wiping every signal/resource/timer plus focus and `<input>`
  values on a shuffle. Teardown is now deferred to a microtask and cancelled if
  the element is re-inserted in the same tick, so a keyed move preserves state;
  a genuine removal still disposes. `each()` also uses `Node.prototype.moveBefore`
  (Chrome 133+) when available, which relocates connected nodes without firing
  lifecycle callbacks at all. Regression test: `test/each-component-state.test.mjs`.

### Docs / planning


- **Road to v1 re-sequenced around correctness.** Added
  [`MADO_V1_TRACKER.md`](./MADO_V1_TRACKER.md), the active task-by-task tracker
  derived from the `FABLE_REPORT.md` audit: phase A `v0.9` (correctness fixes
  C1–C8, TDD: reproducing test → fix), phase B `v0.10` (surface cleanup, explicit
  exports map, API freeze map), phase C `v1.0-rc` (live demo + external
  dogfooding), phase D `v1.0` (freeze). `ROADMAP.md` now gates its
  product-surface milestones behind a new "Milestone 0"; `TODO.md` points at the
  tracker and drops items it now owns (exports policy, size reporting).


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
