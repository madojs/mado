# TODO

Ideas that are not commitments. Roadmap milestones live in `ROADMAP.md`.

## DX

- [ ] `npx mado create my-app` scaffold.
- [ ] `mado page <name>` / `mado component <name>` wrappers around templates.
- [ ] Split `scripts/cli.mjs` into small internal modules (`cli/init`,
  `cli/run`, `cli/dev`, `cli/static-server`) before it becomes hard to read.
- [ ] Make `mado preview` and `mado bundle` work naturally inside generated
  apps, not only inside the framework repository.
- [ ] Typed navigation inferred from route patterns.
- [ ] Optional VS Code extension for `html`` / `css`` highlighting.

## Runtime

- [ ] Optimistic mutation hook with rollback.
- [ ] `<x-async>` helper for resource loading/error shells.
- [ ] `liveResource()` over SSE / WebSocket.
- [ ] i18n helper once browser-native message formatting is realistic.
- [ ] Accessibility helpers: focus trap, live region, click outside.

## Styling

- [ ] Docs for `::part`, `::slotted()` and `:host-context()`.
- [ ] Optional tiny utilities stylesheet.

## Operations

- [ ] Benchmark against Lit / Solid / Preact.
- [ ] Decide package exports policy before v1: remove the wildcard export or
  keep it documented as unstable internal deep imports.
- [ ] Add first-class size reporting for runtime budget (ESM graph,
  bundled/minified, gzip, brotli) without counting docs/starters/package files.
- [ ] `eslint-plugin-mado` rules for common mistakes.
- [ ] CSP-friendly style mode.
- [ ] PWA scaffold.
- [ ] Schema validation hook for resources.
- [ ] Timeout / retry options for resource fetchers.
- [ ] Source-map notes and a minimal dev error overlay.

## Bake / Smart Static

- [ ] Webhook re-bake endpoint.
- [ ] Incremental bake cache.
- [ ] RSS / Atom feed generator.
- [ ] Nested-route bake support.

## Community

- [ ] Minimal landing site built with Mado.
- [ ] Case study: real React page → Mado + bake.
- [ ] Public live demo: CRUD starter and showcase hosted from Mado itself.
- [ ] Convert contribution-ready TODO items into GitHub issues with labels
  (`good first issue`, `help wanted`, `docs`, `cli`, `ci`) after the first
  public feedback round.

## Release / GitHub

- [ ] Configure npm Trusted Publishing for GitHub Actions after verifying the
  first manual publishes.
- [ ] Decide the release flow: continue manual npm publish for patch releases or
  publish from signed `v*` tags through `.github/workflows/release.yml`.
- [ ] Improve generated release notes: include PR links/authors when releases
  start going through pull requests.
- [ ] Add a short maintainer-only release checklist outside public docs if the
  manual flow stays in use.
