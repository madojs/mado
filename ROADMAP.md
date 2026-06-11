# Roadmap to v1

Mado is a calm frontend stack for internal tools, admin panels and business
SPA. The path to v1 is not about adding features — it is about proving the
framework works reliably for its intended use case and earning trust through
demonstrated quality.

## Positioning

**For:** small teams and solo developers building admin panels, internal tools,
backoffice apps and CRUD-heavy SPA.

**Promise:** easy to build, boring to maintain. Complete app stack (routing,
forms, state, data, prerender) without frontend infrastructure overhead.

**Not for:** SEO-heavy sites, large teams optimizing for hiring, projects
needing SSR hydration or mature plugin ecosystems.

## Current state: v0.8

The core API is feature-complete for the target use case:
- Signals, computed, effects with GC and cycle detection
- Tagged-template `html` with directives (ref, classMap, styleMap, unsafeHTML)
- Web Components with Shadow DOM
- Router with nested routes, guards, lazy loading, error boundary, scroll restoration
- Resource + mutation with cache, invalidation, abort, optimistic updates
- Forms with schema validation, async validators, field arrays
- Persisted state, context/DI, head management
- Static prerender (bake) for SEO without hydration
- CLI: init, dev, build, release, preview
- Starters: minimal, crud, admin

The API surface is feature-complete — but a line-by-line audit
([`FABLE_REPORT.md`](./FABLE_REPORT.md)) found correctness defects that break
three central promises (*keyed `each` preserves state*, *glitch-free signals*,
*cross-tab sync works*) plus one re-bind model that is cheaper to fix before
the API freeze than after. So what is missing is, in order: **correctness,
then surface lockdown, then proof and polish.**

## Milestone 0: Correctness & surface lockdown (gate to v1)

Before any of the product-surface milestones below mean anything, the
foundation must be correct and the public surface must be freezable. This work
is tracked task-by-task (TDD: reproducing test → fix) in
[`MADO_V1_TRACKER.md`](./MADO_V1_TRACKER.md):

- [ ] **v0.9 — Correctness release:** fix audit findings C1–C8 (each-reorder
  teardown, persisted cross-tab loop, `update()` nested re-bind, `equals` +
  `batch` atomicity, stale form async validation, `mutation` abort semantics,
  silent parser drops, lifecycle/router defect pack). Fixes only, zero features,
  each with a regression test that was red first.
- [ ] **v0.10 — Surface & cleanup:** remove legacy attribute→property reflection
  and `observedAttributes`, replace `exports "./*"` with an explicit subpath map,
  close `_testHooks`, publish the API freeze map, add CI size budgets and a
  package-level export test, sync `llms.txt`/`AGENTS.md` with the real API.

The milestones below (live demo, reliability, recipes, docs) execute **after**
Milestone 0, during the `v1.0-rc` dogfooding phase.

## V1 milestones (in priority order)


### 1. Live demo — prove it works

**Goal:** a deployed, publicly accessible app that looks like real work.

The showcase already has: auth, tables with filters/sort/pagination, record
details, forms, nested routes, context services, role guards, loading/error
states. What it needs:

- [ ] Deploy to a public URL (Cloudflare Pages or similar)
- [ ] Add responsive sidebar + mobile breakpoints
- [ ] Add toast/feedback system
- [ ] Add optimistic update example
- [ ] Add persisted filters example
- [ ] Polish visual quality to "not embarrassing" level
- [ ] Add a comparison section: bundle size, file count, cold start vs React+Vite equivalent

This is the single most important deliverable. A working app proves more than
any README.

### 2. Boring reliability — earn trust

**Goal:** no surprises in production.

- [ ] Browser compatibility pass: Chrome, Edge, Firefox, Safari (current)
- [ ] Accessibility pass: focus management, ARIA, keyboard navigation in examples
- [ ] Public API audit: names, warnings, lifecycle rules, docs coverage
- [ ] Public exports audit: lock the root import; decide on subpaths
- [ ] Error messages audit: every runtime error should point to a fix
- [ ] Long session stability test: memory leaks, listener cleanup, route churn
- [ ] Migration notes template: document how to upgrade between versions

### 3. Release hygiene — look professional

**Goal:** signal stability and care.

- [ ] npm provenance / Trusted Publishing
- [ ] GitHub repo metadata: description, topics, social preview
- [ ] Semantic versioning discipline with changelog
- [ ] Size reporting in CI (ESM + bundled + gzip + brotli)
- [ ] Compatibility matrix in docs (browsers, TS versions)
- [ ] Issue labels and triage process

### 4. Business-app recipes — solve real problems

**Goal:** answer "how do I..." for common admin/internal app patterns.

- [ ] Auth recipe: login, token refresh, route guards, logout
- [ ] Table recipe: pagination, sort, filters, empty state, loading skeleton
- [ ] Form recipe: create/edit, validation, async submit, error display
- [ ] CRUD recipe: list → detail → edit → delete with optimistic updates
- [ ] API integration recipe: typed client, error handling, retry
- [ ] Deployment recipe: VPS, Cloudflare Pages, static CDN, Docker

### 5. External validation — prove others can use it

**Goal:** at least 3 people outside the author build real apps.

- [ ] Invite 2-3 developers to build internal tools with Mado
- [ ] Collect friction reports and fix blockers
- [ ] Get at least 1 public case study or blog post
- [ ] Address real issues that emerge from pressure testing

### 6. Documentation rewrite — job-to-be-done first

**Goal:** docs answer "how to build X" not "how API Y works".

- [ ] Getting started guide focused on building an admin panel
- [ ] "Build a backoffice app" tutorial (30 min, end-to-end)
- [ ] Troubleshooting guide for common mistakes
- [ ] API reference (generated or manually curated)
- [ ] Remove or archive docs that don't serve the target audience

## Explicitly out of scope

These will not happen before v1. They are not weaknesses — they are focus.

- Runtime dependencies
- UI component library / design system
- SSR with hydration
- Plugin ecosystem
- Framework-specific build tool
- Broad general-purpose narrative
- Synthetic benchmark marketing

## After v1

Ideas live in `TODO.md`. They become commitments only when a real app or
user issue proves the need. The general direction:

- Optimistic mutation primitives
- Live data (SSE/WebSocket) resource
- i18n helper
- Accessibility utilities (focus trap, live region)
- Optional tiny utility stylesheet
- PWA scaffold
- eslint-plugin-mado

## Success criteria for v1

Not stars or hype. Instead:

1. **3+ people** have built real internal/admin apps with Mado
2. **1 polished live demo** is deployed and maintained
3. **Zero known browser bugs** in Chrome/Edge/Firefox/Safari current
4. **API is stable** — no breaking changes needed for known use cases
5. **Docs answer 90% of questions** without asking the author

## Release History

| Date | Version | Notes |
|---|---|---|
| 2026-06-03 | v0.1-v0.3 | Core stabilization, docs foundation, publish readiness, Cloudflare PoC |
| 2026-06-05 | v0.4 | Showcase CRM pressure app, browser regression suite |
| 2026-06-06 | v0.5 | Unified CLI, rebrand to @madojs/mado, first npm release |
| 2026-06-07 | v0.6 | App-mode CLI/config, admin starter, release pipeline, core hardening |
| 2026-06-09 | v0.8 | Product surface complete, positioning pivot to internal tools focus |
