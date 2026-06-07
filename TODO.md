# TODO

Ideas that are not commitments. Roadmap milestones live in `ROADMAP.md`.

## DX

- [ ] `npx mado create my-app` scaffold.
- [ ] `mado page <name>` / `mado component <name>` wrappers around templates.
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

- [ ] Publish public GitHub repository.
- [ ] Minimal landing site built with Mado.
- [ ] Case study: real React page → Mado + bake.
