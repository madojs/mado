# MadoJS — Road to v1 (active tracker)

> Live tracker for the push from **v0.8 → v1.0**. Derived from the architecture
> audit in [`FABLE_REPORT.md`](./FABLE_REPORT.md). The earlier v0.6
> product-surface push is closed and archived in
> [`MADO_V1_PLAN.md`](./MADO_V1_PLAN.md) — treat that file as history only.
>
> Convention: every commit/PR that advances v1 references task IDs in its
> message, e.g. `[v1 C1.fix] each: defer teardown + moveBefore`. When a task is
> completed, tick its box here in the same commit and add a one-line entry under
> "Unreleased" in `CHANGELOG.md`.

---

## 0. Why this tracker exists

The audit verdict (verified against source line-by-line): **the API surface is
feature-complete, but v1 cannot ship on top of it yet.** There are correctness
defects that break three central promises of the framework — *"keyed `each`
preserves state"*, *"glitch-free signals"*, *"cross-tab sync works"* — plus one
model (`update()` re-binding) that is cheaper to redesign **before** freeze than
after, because the fix is a behavioural change that would be breaking post-v1.

This is **not** "stop and rewrite everything". It is "freeze feature work for
1–2 cycles and close the foundation, then prove it".

The path to v1 is therefore reordered: **correctness first, surface lockdown
second, proof (live demo + dogfooding) third, freeze last.** The product-surface
milestones from `ROADMAP.md` (live demo, recipes, docs rewrite) are still real
and follow the correctness work — they are not replaced, they are sequenced
behind it.

---

## 1. Working loop (TDD)

The agreed method is test-first per finding:

1. Pick the first unchecked `*.test` box.
2. Write a **reproducing** test that fails against current `main` (red). It must
   demonstrate the bug exactly as described, not a proxy for it.
3. Run it, confirm it is red, commit it as `[v1 Cx.test] …`.
4. Implement the smallest fix that makes it green (`[v1 Cx.fix] …`).
5. Run `npm run typecheck && npm test` (and `npm run build` when touching `src/`).
6. Tick both boxes here + add a `CHANGELOG.md` "Unreleased" line in the same commit.
7. After each phase finishes, pause and review.

Rule: **no fix lands without a test that was red before it.** A correctness
release with no regression tests is worthless.

---

## 2. Phases (deliver in order)

| Phase | Release | Theme | Gate |
|---|---|---|---|
| **A** | `v0.9` | Correctness — fixes only, zero features | All `C*` tests green; no known correctness bug |
| **B** | `v0.10` | Surface & cleanup — remove, lock exports, sync docs | Public API frozen on paper; internals closed |
| **C** | `v1.0-rc.*` | Proof — live demo + external dogfooding | 2 real apps shipped, 1 LLM-built; friction fixed |
| **D** | `v1.0` | Freeze — SemVer commitment + stability doc | Stability contract published |

---

## 3. Phase A — v0.9 "Correctness release"

Fixes only, **no new features**. Ordered by severity. Each finding maps to a
reproducing test (`C*.test`) and a fix (`C*.fix`). Audit references in
parentheses point at the verified source locations.

### 🔴 C1 — `each()` reorder destroys custom-element state (Critical)

Reorder moves connected nodes via `parent.insertBefore` (`src/html/bindings.ts`
~356–373), and `MadoElement.disconnectedCallback` (`src/component.ts` 196–202)
does an **immediate, synchronous** full teardown (`#effectDispose()`,
`#lifecycle.dispose()`). A shuffle therefore re-runs `setup()` on every moved
component: signals, resources, timers, focus and `<input>` values are silently
lost. The "500-item shuffle correct" v1 criterion passes on bare `<li>` and
fails on components — and the bare-`<li>` test hides it.

- [x] **C1.test** — `test/each-component-state.test.mjs`: models a keyed move as
  a synchronous disconnect→connect pair; asserts setup runs once and component
  state (a captured signal) survives the move, while a genuine removal still
  disposes on the microtask. Confirmed **red** against `main` first
  (`moving a connected component must NOT re-run setup()` → `2 !== 1`).
- [x] **C1.fix** — `src/component.ts`: `disconnectedCallback` now defers teardown
  via `queueMicrotask`; `connectedCallback` clears the queued flag so a same-tick
  re-insert cancels it, and the microtask also bails if `this.isConnected`.
  `applyEach` (`src/html/bindings.ts`) prefers `Node.prototype.moveBefore`
  (Chrome 133+) with an `insertBefore` fallback. Existing
  `component-lifecycle.test.mjs` / `resource-lifecycle.test.mjs` updated for the
  deferred timing. Full suite green (140 pass / 3 skipped).


### 🔴 C2 — `persisted()` cross-tab ping-pong + leaky `destroy()` (Critical)

`src/persisted.ts`: (a) the publisher effect posts the value on every change and
the receiver does `base.set(e.data)`; for **objects/arrays** structured clone
produces a new identity each time, so `Object.is` never suppresses the echo →
an unending A↔B loop with a localStorage write per turn. (b) The `effect()`
disposers are never stored; `destroy()` only closes the channel and clears
storage, so the next `base.set()` re-writes the key — and `persisted()` never
consults `getCurrentLifecycle()`, so inside a component it is a permanent
subscription.

- [x] **C2.test** — `test/persisted-crosstab.test.mjs`: two persisted() signals
  over one key + a third observer channel; object-valued change in "tab A".
  Confirmed **red** first (`got 82` cross-tab messages = echo loop; and `{"n":3}`
  written after `destroy()`).
- [x] **C2.fix** — `src/persisted.ts`: echo suppression via a `lastSync`
  serialized-value guard (set before applying remote values and before
  publishing), so an arriving value is never re-published. Both effect disposers
  are now stored and run in `destroy()`, which also sets a `destroyed` flag so
  later `set()` calls are inert; `destroy()` clears the debounce timer and closes
  the channel. `persisted()` registers `destroy` with `getCurrentLifecycle()`
  when created inside a component/page. Suite green (142 pass / 3 skipped).


### 🟠 C3 — `update()` recreates all nested templates (High — fix BEFORE freeze)

`renderChild` (`src/html/bindings.ts` ~197–258) always `clearCurrent()` +
`instantiate()` for a single `TemplateResult` — there is **no `_strings`
compare / instance reuse** as there is in `each` (~330) and `render()`
(`src/html/template.ts` ~136). And `update()` (template.ts ~79–94) disposes
**all** listeners/effects then re-binds. Result: any signal read directly in a
renderer that returns a nested `html\`\`` rebuilds the whole subtree on every
change — focus inside conditional form blocks is lost, listeners re-attach. This
is a behavioural contract: freezing it makes the fix breaking later.

- [x] **C3.test** — `test/update-nested-reuse.test.mjs`: a renderer reads an
  unrelated signal and returns a nested `html\`<input id="f">\``; on change,
  asserts the `<input>` keeps its sentinel mark and `.value` (node identity).
  A second case asserts a different nested template still rebuilds. Confirmed
  **red** first (mark `undefined` — node was recreated).
- [x] **C3.fix** — `src/html/bindings.ts` `renderChild`: reuse fast-path — when
  the new value is a single `TemplateResult`, the previous content was exactly
  one instance (`currentInsts.length === 1`, node count matches) and `_strings`
  match, call `currentInsts[0].update(v.values)` instead of clear+instantiate,
  mirroring `each`/`render()`. Suite green (144 pass / 3 skipped).


### 🟠 C4 — `computed({ equals })` breaks `batch()` atomicity (High)

`signal.set` calls sync subscribers immediately, even inside `batch()`
(`src/signal.ts` ~180–200). For a plain computed this is just a dirty flag, but
the `equals` branch (~251–270) does an **eager `recompute()` inside `set()`**.
In `batch(() => { a.set(1); b.set(2) })`, an `equals`-computed reading `a` and
`b` recomputes on `(new a, old b)` — observing inconsistent intermediate state,
possibly notifying with it, and running O(number of sets) times. Glitches exactly
where the framework promised to remove them.

- [x] **C4.test** — `test/signal-batch-equals.test.mjs`: an `equals`-computed
  reads `x` and `y` and asserts inside `fn` that it never sees `x !== y` during a
  `batch(() => { x.set(2); y.set(2) })`, runs exactly once, and a second case
  asserts the `equals` optimisation still suppresses an unchanged effect inside a
  batch. Confirmed **red** first (`computed must never observe a half-applied
  batch` → `true !== false`).
- [x] **C4.fix** — `src/signal.ts`: an observed `equals`-computed invalidated
  inside a batch defers its recompute+compare to a `deferredEquals` queue,
  drained at the end of the outermost `batch()` (and defensively at the top of
  `flush()`), so it runs once on consistent state. Outside a batch the behaviour
  is unchanged (eager). Suite green (146 pass / 3 skipped). Ordering spec
  (`docs/en/18-reactivity-ordering.md`) deferred to Phase B (B9).


### 🟠 C5 — Forms: stale async validation lands on a shifted index (High)

`fieldRuns` (`src/forms.ts:152`) is a per-**string-path** generation guard, so
the "last write wins" protection only holds for identical path strings.
`array().remove()/write()` (~406–410) clears `asyncErrors`/`touched` by prefix
but does **not** invalidate in-flight runs: a pending `validateAsync` for
`items.2.title` still satisfies `fieldRuns.get('items.2.title') === run` and
writes its error onto a path that now points at a different row. The v1 criterion
"nested field arrays correct under add/remove/move" currently fails.

- [x] **C5.test** — `test/forms-array-stale-async.test.mjs`: schema
  `items.*.title` with a gate-controlled `validateAsync`; start validating
  `items.2.title`, `remove(1)`, then open the gate; asserts
  `errors()['items.2.title'] === undefined`. Confirmed **red** first
  (stale `'taken'` landed on `items.2.title`).
- [x] **C5.fix** — `src/forms.ts`: `array().write()` (used by all mutating array
  ops) calls a new `invalidateRunsPrefix(name)` that bumps `fieldRuns` for every
  in-flight path at/under the array prefix, so a stale `validateField` sees
  `fieldRuns.get(name) !== run` in its `finally` and skips writing. Suite green
  (147 pass / 3 skipped). Row identity remains positional (documented in B11).


### 🟠 C6 — `mutation().run()` aborts the previous POST (Medium-High)

`run()` starts with `abort?.abort()` (`src/resource.ts` ~265–268). A mutation is
declared once and reused; two fast submits of different entities through one
mutation abort the first POST **client-side** even though the server likely
applied it — client gets `AbortError`, the first `invalidates` never runs, UI
never learns of success. Auto-abort is right for reads, wrong for writes.

- [x] **C6.test** — `test/mutation-concurrent.test.mjs`: two concurrent `run()`
  calls of different entities both complete; `loading` stays true until the last
  in-flight run settles; and `{ abortPrevious: true }` still aborts the previous
  run (search-as-you-type). Confirmed **red** first (concurrent runs threw
  `AbortError`).
- [x] **C6.fix** — `src/resource.ts`: mutations are concurrent by default — a run
  no longer aborts the previous one. Controllers are tracked in a `Set`, an
  `inFlight` counter keeps `loading` true until the last settles, and abort is
  opt-in via `{ abortPrevious: true }`. `reset()` aborts all in-flight runs.
  Suite green (150 pass / 3 skipped). **Behavioural change — done before freeze.**


### 🟡 C7 — Parser silently drops bindings in RAW_TEXT; nested SVG breaks (Medium)

`${}` inside `<textarea>`, `<title>`, `<style>`, `<script>` is silently ignored
(`src/html/parser.ts`), and a nested `html\`<path …>\`` inside `<svg>` is
instantiated via top-level `<template>.innerHTML` → HTML namespace → invisible
SVG. "Silently doesn't work" is the worst failure mode for a framework selling
predictability and LLM-friendliness (an LLM will naturally write
`<textarea>${draft}</textarea>`).

- [x] **C7.test** — `test/html-rawtext-svg.test.mjs`: a slot in `<textarea>`
  throws a `.value=`-pointing error, a slot in `<style>` throws, a nested
  SVG-child template throws a namespace error, and a self-contained `<svg>`
  still renders. Confirmed **red** first (slots silently dropped; nested SVG
  silently mis-namespaced).
- [x] **C7.fix** — `src/html/parser.ts`: a `${}` slot in a RAW_TEXT element now
  throws `rawTextSlotError()` (tailored hint per tag); an SVG-only top-level tag
  (`<path>`, `<circle>`, …) throws a wrong-namespace error after parsing. Suite
  green (154 pass / 3 skipped). Doc sync (`07-llm-pitfalls.md`, `llms.txt`)
  folded into Phase B (B11).


### 🟡 C8 — Lifecycle / router defect pack (Medium)

Small, individually cheap, collectively v1-blocking.

- [x] **C8.1** `src/lifecycle.ts` (69–80): `onDispose` after `dispose()` silently
  drops the callback → async page cleanup registered post-navigation never runs.
  **Fix:** if already disposed, call `fn` immediately (Solid/Vue behaviour).
  **Test:** `dispose()` → `onDispose(spy)` → `spy` called.
- [x] **C8.2** `src/router/navigation.ts` (~117–131): `a[data-link]` interception
  ignores `target="_blank"` and `download` → hijacks intentional new-tab links.
  **Fix:** two guard checks. **Test:** click `data-link target=_blank` → no SPA
  navigation.
- [x] **C8.3** Same `navigation.ts`: navigating to the same pathname with a
  different `#hash` is swallowed by signal dedup (`Object.is`) → anchor links are
  dead. **Fix:** after navigating to the same path, scroll to `location.hash`
  manually. **Test:** same-path hash change scrolls / fires.
- [x] **C8.4** Guards have no redirect-loop detector (guard A → /login, guard B →
  back = infinite navigation). **Fix:** redirect counter per navigation tick
  (e.g. > 10 → `console.error` + halt). **Test:** mutually-redirecting guards
  halt with one error instead of looping.

  Done in `test/lifecycle-router-pack.test.mjs` (6 tests). Verified with
  `npm run build`, `node --test test/lifecycle-router-pack.test.mjs`,
  `npm test` (160 pass / 3 skipped), and `npm run typecheck`.

> Note: the legacy attribute→property reflection bug (`src/component.ts:215`,
> clobbers native `title`/`id`/`value`) is handled as a **removal** in Phase B
> (B1), not patched here.

**Phase A gate:** every `C*.test` is green; `npm run typecheck && npm test &&
npm run build` clean; tag `v0.9`.

---

## 4. Phase B — v0.10 "Surface & cleanup"

Make the public surface small, honest and freezable. Mostly removals and docs;
each behavioural removal still needs a test.

### Remove (cut before freeze)

- [x] **B1** Remove legacy attribute→property reflection in
  `src/component.ts` (~215). It clobbers native props and `.prop=` bindings;
  `ctx.attr()` is canonical. Test: setting `value`/custom attributes no longer
  overwrites host properties.
- [x] **B2** Remove `options.observedAttributes` — a second mechanism for the same
  job as `ctx.attr()`; one contract, not two.
- [x] **B3** Replace `exports: "./*"` in `package.json` with an explicit subpath
  map (`.`, `./devtools.js`, and at most 3–5 deliberate points). Today `"./*"`
  makes the entire `dist/` public (parser, lifecycle, diagnostics, all
  `_testHooks`), so any internal rename becomes a breaking change post-v1.
- [x] **B4** Mark `_testHooks` (`signal`, `diagnostics`, `resource`,
  `router/manifest`) `@internal` and strip them from emitted `.d.ts`; move them
  out of public modules where possible.
- [x] **B5** Add the "Things not to build" list to `README.md` as an explicit
  **No** section: SSR/hydration, template compiler, store library, Suspense,
  router plugin system, i18n/animation/virtual-scroll primitives, non-evergreen
  browsers. Pin a browser baseline (e.g. Baseline 2023).

### Fix / harden (cheaper before freeze)

- [x] **B6** `resource` cache: in-flight dedupe by key (two components, one
  network call) + a dev `warnOnce` on key collisions; document key discipline.
  Test: two concurrent `resource()` with the same key → one fetch.
- [x] **B7** `each` duplicate-key handling (`bindings.ts` ~319–321): keep the
  positional-suffix fallback but add a dev `warnOnce` — duplicate keys are almost
  always a data bug.

### Lock & document the contract

- [ ] **B8** Publish the **API freeze map** (a doc + this tracker §6): stable
  public API vs internal/unstable. This is the cheapest, highest-value lockdown.
- [ ] **B9** `docs/en/18-reactivity-ordering.md` — ordering/teardown/`update()`
  guarantees (depends on C3/C4) + invariant tests.
- [ ] **B10** `docs/en/19-v1-stability.md` — "what v1 stability means": API +
  reactivity semantics are stable; internals + bundler byte-output are not.
- [ ] **B11** Sync `llms.txt`, `AGENTS.md`, `.clinerules`, `.cursorrules` with the
  real API: new parser errors (C7), new `mutation` semantics (C6), the
  "layout.view is stateless" contract, and "bake = meta-shell, not SSG".
- [ ] **B12** `mado init`: write required devDeps (`typescript`, `esbuild`,
  `linkedom`) into the generated `package.json`; reword marketing to "zero
  **runtime** dependencies; build tooling needs esbuild (optional)".

### CI gates

- [ ] **B13** Size budget in CI: gzip of full public API < 12 KB; full sample app
  < 40 KB. Fail the build on regression (numbers in CI, not README).
- [ ] **B14** Package-level test: `npm pack` → install into a temp app → assert
  `import '@madojs/mado/lifecycle.js'` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`
  while public paths work; smoke `mado release` in a clean temp app.
- [ ] **B15** Release determinism: two `mado release` runs on the same input →
  byte-identical `out/` (sitemap `lastmod` from git date or dropped).
- [ ] **B16** Turn the LLM zero-history test (`docs/en/08`) into a CI check: code
  generated from `llms.txt` compiles and passes a smoke run.

**Phase B gate:** explicit exports map shipped; legacy reflection gone; docs and
LLM files match reality; CI budgets green; tag `v0.10`.

---

## 5. Phase C — v1.0-rc + dogfooding

Proof, on someone else's code. This is where the existing `ROADMAP.md`
product-surface milestones (live demo, recipes, docs rewrite) execute.

- [ ] **D1** Live demo deployed to a public URL (folds in `ROADMAP.md` §1:
  responsive sidebar, toast system, optimistic + persisted-filter examples,
  React+Vite comparison).
- [ ] **D2** Build **two real apps outside this repo** by someone other than the
  core author — ideally one mostly by an LLM agent driven only by `llms.txt`
  (this is simultaneously a product test and a test of the main differentiator).
- [ ] **D3** Browser compatibility + accessibility + long-session stability pass
  (`ROADMAP.md` §2).
- [ ] **D4** Collect every friction point → `rc.2`. Repeat until quiet.

**Phase C gate:** two external apps shipped without author hand-holding; no
open correctness or API-ergonomics blocker.

---

## 6. API freeze map (decided in Phase B)

**Stable public API (freeze under SemVer):**
`signal/computed/effect/untracked/batch/flushSync`;
`html/render/each/list/unsafeHTML/ref/classMap/styleMap`;
`component/css/cssVars`;
`routes/page/layout/nested/navigate/queryParam/prefetchPath`;
`resource/mutation/invalidate/jsonFetcher/HttpError`;
`useForm`; `persisted`; `applyHead`; `createContext/provide/inject`; and their
types.

**Internal / unstable (closed via explicit exports):**
`lifecycle.js` internals (`createLifecycle/runInLifecycle/getCurrentLifecycle` —
decide: close, or open deliberately as "advanced" with docs),
`html/parser.js`, `html/bindings.ts` internals (`ChildState`, `EachEntry`),
`diagnostics.js`, all `_testHooks`, `router/match.js` internals, low-level
`router()` (document as stable low-level **or** hide — decide consciously).

**Will not survive v1:** `exports "./*"`. Replace with an explicit map (B3).

---

## 7. Things NOT to build before v1

Not weaknesses — focus. Say "no" in `README.md` (B5).

- SSR / hydration. Bake-as-meta-shell is the deliberate position.
- Template compiler / transform. `tsc → browser` is the contract.
- Store library / global state manager. Signals + module scope + context suffice.
- Suspense / Transitions abstractions. `resource.loading()` + `loadingDelay` cover it.
- Router plugin / middleware system. Every extension point is a forever-contract.
- Animation primitives, i18n, virtual scroll — userland / docs recipes.
- Non-evergreen browser support. Pin an evergreen baseline and hold it.

---

## 8. v1 test plan (consolidated target state)

Most run on Node + linkedom/playwright, as already configured.

1. **each + components:** shuffle 500 component rows → `setup` exactly 1×/element,
   focus/value preserved; shuffle time within a CI budget (C1).
2. **Reactivity spec:** diamond (1 effect call, consistent value); batch
   atomicity with `equals`-computed (C4); 100-computed chain has no quadratic
   blow-up; suspend/resubscribe leak test.
3. **Resource:** abort on unmount; stale-response race (slow old key vs fast new
   key); double `mutation.run` (C6); in-flight dedupe (B6).
4. **Forms:** stale async validation + remove/move (C5); submit while validating;
   nested-path get/set property-based round-trip.
5. **Persisted:** two-channel echo bound (C2); `destroy()` completeness; corrupt
   JSON in storage.
6. **Release determinism:** byte-identical `out/` across runs (B15).
7. **Bake:** golden snapshots of title/meta/canonical/JSON-LD/sitemap for a
   starter; bake of a redirecting-guard route (pin the behaviour).
8. **Package-level:** `npm pack` → temp app → typecheck + `mado release` +
   size-budget assert (B13/B14).
9. **LLM zero-history:** generated-from-`llms.txt` code compiles + smoke passes
   in CI (B16).

---

## 9. Context-loss safety

- This file = ground truth on disk for the road to v1.
- `FABLE_REPORT.md` = the audit this plan is derived from (evidence + line refs).
- `task_progress` in chat = current phase/task.
- Git commits tagged `[v1 Cx.test]` / `[v1 Cx.fix]` / `[v1 Bx]` = time machine.

If work resumes from here, this is the canonical tracker. `MADO_V1_PLAN.md` is
archived history; `ROADMAP.md` holds the product-surface milestones that run in
Phase C.
