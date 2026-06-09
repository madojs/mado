# Changelog

## Unreleased

Road to v1 (see [`MADO_V1_PLAN.md`](./MADO_V1_PLAN.md)). Phase 1 — Repo-vs-app
split:

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
- `ROADMAP.md`, `TODO.md`, `AGENTS.md` now point to `MADO_V1_PLAN.md` as the
  source of truth for the v1 push. [v1 F0]

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
