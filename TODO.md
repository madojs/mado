# TODO

Backlog, not a roadmap. Keep this file small and honest: ideas stay here only
while they are plausible next work. Promote concrete work to issues or release
notes when it becomes real.

## Before Public Demo / Release

- [ ] Run the default starter as a real demo app and feed every friction point
  back into docs, CLI generators, or starter structure.
- [ ] Add focused tests for every `mado new` generator template.
- [ ] Audit EN/RU/FR docs after each tooling/runtime change; no old `dist/`,
  `tsc-only`, custom-bundler, or legacy example wording should remain.
- [ ] Keep `mado preview` boring and reliable inside generated apps.
- [ ] Add a short maintainer-only release checklist if manual npm publish stays
  in use.

## CLI / DX

- [ ] Decide whether `npx mado create my-app` is worth adding after package
  naming and install friction are clear.
- [ ] Consider short aliases over `mado new` only after real usage shows they
  save enough typing (`mado page`, `mado component`, etc.).
- [ ] Split preview/static-server internals only if `scripts/preview.mjs` grows.
- [ ] Typed navigation inferred from route patterns.
- [ ] Editor highlighting docs should prefer existing tooling first; build a
  Mado-specific VS Code extension only if current HTML/CSS template support is
  not enough.

## Runtime / App API

- [ ] Mutation rollback helper on top of `resource().mutate()` and `mutation()`.
- [ ] Document loading/error shell patterns before adding an `<x-async>` API.
- [ ] `liveResource()` over SSE / WebSocket after a real app needs live data.
- [ ] i18n helper once browser-native message formatting is realistic.
- [ ] Accessibility helpers: focus trap, live region, click outside.

## Styling

- [ ] Docs for `::part`, `::slotted()` and `:host-context()`.
- [ ] Document Vite CSS options, including `css.transformer: "lightningcss"`,
  for apps that want Lightning CSS.
- [ ] Optional tiny utilities stylesheet only if the starter/demo repeats the
  same small classes often enough to justify it.
- [ ] CSP-friendly style mode.

## Bake / Smart Static

- [ ] Add bake regression coverage for layout groups, dynamic params, sitemap,
  and hard-refresh deploy paths.
- [ ] Incremental bake cache after a real content-heavy app needs it.
- [ ] Webhook re-bake endpoint only after incremental bake has a concrete use.
- [ ] RSS / Atom feed generator for docs/blog/demo content.

## Operations

- [ ] Benchmark against Lit / Solid / Preact.
- [ ] Source-map notes and a minimal dev error overlay.
- [ ] `eslint-plugin-mado` rules only if docs/starter conventions are not enough
  to prevent recurring mistakes.
- [ ] Timeout / retry options for resource fetchers after real API friction.
- [ ] Schema validation hook for resources after choosing a dependency-free
  story or a clearly optional integration.
- [ ] PWA scaffold only if the public demo or a real app needs offline behavior.

## Community / GitHub

- [ ] Minimal landing site built with Mado.
- [ ] Public live demo: CRUD starter and showcase hosted from Mado itself.
- [ ] Case study: real React page -> Mado + bake.
- [ ] Convert contribution-ready TODO items into GitHub issues with labels
  (`good first issue`, `help wanted`, `docs`, `cli`, `ci`) after the first
  public feedback round.
- [ ] Configure npm Trusted Publishing for GitHub Actions after verifying the
  first manual publishes.
- [ ] Decide the release flow: continue manual npm publish for patch releases or
  publish from signed `v*` tags through `.github/workflows/release.yml`.
- [ ] Improve generated release notes with PR links/authors when releases start
  going through pull requests.
