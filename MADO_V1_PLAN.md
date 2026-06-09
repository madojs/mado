# MadoJS — Road to v1 (executable plan)

> Living tracker for the v1 push. This file is the **single source of truth** for the work
> agreed during the v1 audit. If an agent or human session is reset, open this file first
> and continue from the first unchecked box.
>
> Convention: every commit/PR that advances v1 references task IDs in its message,
> e.g. `[v1 F1.2] bake.mjs: app-mode defaults + --entry/--template/--out flags`.
> When a task is completed, tick its box here in the same commit.

---

## 0. Mental model (write this into docs first)

Three artifact states. One deploy artifact. End of story.

| Folder      | What it is                                                     | Who writes        | Who reads                  | Deployed?         |
|-------------|----------------------------------------------------------------|-------------------|----------------------------|-------------------|
| `src/`      | your source (TS)                                               | you               | `tsc`, `esbuild`           | no                |
| `dist/`     | `tsc` output (native ESM JS for the browser)                   | `mado build`      | `mado dev`, dev browser    | no (internal)     |
| `public/`   | static assets (favicons, images, robots.txt)                   | you               | `mado bundle` copies it    | as part of `out/` |
| `out/`      | **the only deploy artifact**: SPA shell + bundles + baked HTML | `mado release`    | nginx / CDN / CF / VPS     | ✅ yes            |

One-liner for users:
> Develop with `mado dev`. To deploy: run `mado release`, then upload `out/` anywhere.

`mado release` = `typecheck` + `build` + `bundle` + `bake` + copy `public/*` → `out/`.
One command. One artifact. Zero questions about where things live.

---

## 1. Problem map (consolidated)

### Layer A — Core (from the audit)
- **A1** Computed leaks: no refcount/owner; once read, computed stays subscribed to deps forever.
- **A2** No cycle-detection in `effect` (e.g. `effect(() => x.set(x()+1))` runs forever).
- **A3** No `equals` option on `computed`.
- **A4** No template directives: `unsafeHTML`, `ref`, `classMap`, `styleMap`.
- **A5** `useForm`: no async validators, no field-arrays.
- **A6** `resource`/`invalidate`: no typed key relationship; pattern miss is silent.
- **A7** Router: no scroll restoration / focus management / error boundary.
- **A8** `head()`: not obvious how dedup/cleanup happens across navigation.

### Layer B — DX, tooling, product surface (from dogfooding)
- **B1** CLI/bake hardcoded to `examples/` and alias `@madojs/mado → src/index.ts` — repo-mode leaks into user apps.
- **B2** No single blessed way for **layouts** (LLM and humans both guess).
- **B3** No blessed way for **auth + API client + dev-proxy**.
- **B4** No single config file (`mado.config.json`); everything is env vars.
- **B5** Unclear model for `dist/` vs `out/` vs `public/`.
- **B6** No `mado release` (one deploy artifact).
- **B7** Bake silently renders `[object Object]` for `each()`.
- **B8** Bake lives "next to" the app instead of inside `mado dev`.
- **B9** No route guard API.
- **B10** `crud` starter looks like raw scaffold; no admin-template.
- **B11** Docs missing: app-architecture, layouts, auth-and-api, deployment, testing, error-handling, bake-cookbook.
- **B12** Starter scaffolds contain `examples/` legacy.

---

## 2. Phases (deliver in order; phase 5 runs in parallel)

### 🟦 Phase 1 — Repo-vs-app split (P0)

Goal: kill `examples/` leakage; make app-mode the default.

### 🟩 Phase 2 — One blessed way (P0)

Goal: conventions over flexibility. Layouts, guards, auth, api — one recipe each.

### 🟨 Phase 3 — Bake first-class + Release pipeline (P0)

Goal: pragmatic path from `mado dev` to production on VPS / Cloudflare / static CDN.

### 🟪 Phase 4 — Core hardening (P1)

Goal: long-term correctness of signals, html, router, forms, head.

### 🟫 Phase 5 — Documentation (P0/P1, in parallel)

Goal: a backender can ship an admin app reading only the docs.

---

## 3. Acceptance scenario for v1

```bash
npm exec --package @madojs/mado@latest -- mado init dashboard --starter admin
cd dashboard
npm install
mado dev
# / → public landing
# /admin → redirected to /login (guard works)
# log in → admin shell with sidebar / topbar / dashboard / orders table

mado release
rsync -avz out/ user@vps:/var/www/dashboard/
# done
```

If a backend developer reaches production **without reading `bake.mjs`,
without setting env vars, without asking "where does layout live?",
and without an `examples/` folder in their app** — v1 is done.

---

## 4. Tracker

### Phase 1 — Repo-vs-app split ✅
- [x] **F1.1** `mado.config.json` schema + loader (`scripts/_config.mjs`)
- [x] **F1.2** `scripts/bake.mjs`: flags `--entry/--template/--out/--base-url`, app-mode defaults, no `examples/` alias in app-mode, loud errors instead of silent `[object Object]`
- [x] **F1.3** `scripts/cli.mjs`: detect repo vs app, read `mado.config.json`, redesigned help, new `mado release` command
- [x] **F1.4** Starters cleanup: `mado.config.json` and blessed CLI scripts in `starters/minimal` and `starters/crud`; no `examples/` references
- [x] **F1.5** `docs/en/02-project-layout.md` rewritten around the canonical `src/`/`dist/`/`public/`/`out/` model and `mado.config.json`
- [x] **F1.6** `test/config-loader.test.mjs` + `test/bake-cli.test.mjs`.

### Phase 2 — One blessed way ✅
- [x] **F2.1** `layout()` factory (alias of `nested()`) exported from `src/page.ts`; flatten propagates layouts outer → inner.
- [x] **F2.2** `Guard` type + guard chain in `src/router/manifest.ts`. Verdicts: void / `{ halt: true }` / `{ redirect, replace? }`. Async-aware with sync fast path; throwing guard is treated as `halt` with a `console.error`.
- [x] **F2.3** `layout`, `Guard`, `GuardResult`, `nested`, `navigate` exported from `src/index.ts`.
- [x] **F2.4** New starter `starters/admin/` with `layouts/{app,auth}.ts`, `lib/{api,auth}.ts`, `components/{x-button,x-input}.ts`, `pages/{home,login,not-found,admin/{dashboard,orders,order-detail}}.ts`, `styles/global.ts`, `mado.config.json`, `public/favicon.svg`. End-to-end scaffold + typecheck + build verified locally.
- [x] **F2.5** CLI advertises `--starter admin` (`mado init my-app --starter admin`) and adds it to the help screen.
- [x] **F2.6** Doc `docs/en/11-layouts.md` (one path + 2 alternatives with caveats).
- [x] **F2.7** Doc `docs/en/12-auth-and-api.md` (blessed `api`/`auth` recipes, backend contract, dev-proxy hint).
- [x] **F2.8** `test/guards-layouts.test.mjs` covers the public `layout()` alias, sync pass/halt/redirect verdicts, async guards, parent→page guard order, and throwing-guard fallback (7 tests, all green).

### Phase 3 — Bake first-class + Release pipeline ✅ (core)
- [x] **F3.1** `mado release` command: typecheck + build + bundle + bake + copy `public/` → `out/` + write `_headers` / `_redirects` (`scripts/cli.mjs`).
- [x] **F3.2** Deferred to v0.7: `mado dev` serves baked routes inline. Current v1 path is `mado release && mado preview`.
- [x] **F3.3** `mado preview` reads `mado.config.json`, refuses to auto-build in app-mode (opt in with `PREVIEW_AUTOBUILD=1`), and emulates nginx fallback (`scripts/preview.mjs`).
- [x] **F3.4** Bake raises a loud, file/route-targeted error on unsupported render values (e.g. `each()` directive objects). Covered by `test/bake-cli.test.mjs`.
- [x] **F3.5** Deferred to v0.7: `mado check` runs bake-safety scan on `bake:` routes. Current v1 coverage is the loud-error contract from F3.4.
- [x] **F3.6** Dev-proxy in `server/serve.mjs`: reads `dev.proxy` from `mado.config.json` and forwards matching prefixes to the upstream backend without external deps.
- [x] **F3.7** `mado release` generates `out/_redirects` (`/* /index.html 200`) and `out/_headers` (immutable for `/assets/*`, no-cache for `/*.html`) when those files do not exist.
- [x] **F3.8** Doc `docs/en/13-deployment.md` (VPS + nginx, Cloudflare Pages, S3/CloudFront, Netlify, GitHub Pages, CI sketch, cache matrix, troubleshooting).
- [x] **F3.9** Production `nginx.conf` next to the docs (already shipped, with `gzip_static`, immutable hashed bundles, SPA fallback). Verified referenced from the deployment doc.
- [x] **F3.10** `test/release-pipeline.test.mjs`: end-to-end CLI test scaffolds an app, runs `mado release`, and asserts `out/index.html`, `out/baked/index.html`, `out/_headers`, `out/_redirects`, public-asset copy, and sitemap. Also `scripts/bundle.mjs` is app-mode aware (no `examples/`-leak when run from a user app).

### Phase 4 — Core hardening
- [x] **F4.1** Refcount/GC for `computed` in `src/signal.ts` + tests (`computed` releases dep subscriptions after unobserved reads and after the last subscriber is disposed).
- [x] **F4.2** Cycle-detection in `effect` + `test/signal-cycle.test.mjs`
- [x] **F4.3** `equals` option on `computed`
- [x] **F4.4** Directives: `unsafeHTML`, `ref`, `classMap`, `styleMap` in `src/html/bindings.ts` + public exports + `test/html-directives.test.mjs`.
- [x] **F4.5** `useForm`: async validators (`validateAsync`, field-level `validateAsync`, `validating`) + field arrays (`form.array()`, dotted paths, wildcard schema) + tests.
- [x] **F4.6** Router: scroll restoration + focus management
- [x] **F4.7** Router: `errorPage:` in manifest + error boundary
- [x] **F4.8** `src/head.ts`: guaranteed cleanup on navigation (`data-mado-head` removed before re-applying)
- [x] **F4.9** Tests for everything above: `test/computed-lazy.test.mjs` (F4.1/F4.3), `test/signal-cycle.test.mjs` (F4.2), `test/html-directives.test.mjs` (F4.4), `test/forms.test.mjs` (F4.5), `test/router-isolation.test.mjs` (F4.6), `test/router-error-boundary.test.mjs` (F4.7), `test/head.test.mjs` (F4.8). Final `typecheck + build + test` pass verified.

### Phase 5 — Documentation (parallel to phases 2-4)
English docs for project layout, layouts, auth/API and deployment exist now.
The remaining work is deeper recipes plus translation sync.

- [x] **F5.1** `docs/en/10-app-architecture.md` (end-to-end admin)
- [x] **F5.2** `docs/en/14-testing.md`
- [x] **F5.3** `docs/en/15-error-handling.md`
- [x] **F5.4** `docs/en/16-bake-cookbook.md`
- [x] **F5.5** `AGENTS.md`: section "App architecture for LLM"
- [x] **F5.6** `llms.txt`: new anchors
- [x] **F5.7** ru/fr/uk translations for new docs (`10` through `16`)

---

## 5. Working loop

1. Pick the first unchecked box.
2. Implement it (small, focused change).
3. Run `npm test` (and `npm run typecheck` when touching `src/`).
4. Tick the box in this file in the same commit.
5. Add a one-line entry under "Unreleased" in `CHANGELOG.md`.
6. After each phase finishes, pause and review.

## 6. Context-loss safety

- This file = ground truth on disk.
- `task_progress` in chat = current phase/task.
- Git commits tagged `[v1 Fx.y]` = time machine.

If a session is reset: open `MADO_V1_PLAN.md`, find the first `- [ ]`, continue.
