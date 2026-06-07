# Roadmap

Mado is pre-v1. The goal is not to grow sideways, but to keep the runtime small,
readable and reliable under real application pressure.

## Current Focus

- Keep the public runtime API small: `html`, `component`, `routes`, `resource`,
  `mutation`, `useForm`, `each`, `createContext`, `persisted`, `lazy`.
- Use real apps and examples as pressure tests before adding primitives.
- Keep runtime dependencies at zero.
- Keep English as the public/default project language, with localized docs in
  `docs/ru`, `docs/fr` and `docs/uk`.

## Before v1

- Generated app DX: `mado dev`/`serve`/starter scripts should feel as polished
  outside the framework repo as they do inside it.
- Generated app production story: `mado bundle` and `mado preview` should work
  from a starter app without repository-only assumptions.
- Browser compatibility pass across current Chrome, Edge, Firefox and Safari.
- Accessibility pass for examples and common component patterns.
- Public API audit: names, warnings, lifecycle rules, docs coverage.
- Public exports audit: root import is stable; deep imports must either become
  explicit public subpaths or remain clearly unsupported before v1.
- Release hygiene: npm provenance / Trusted Publishing, GitHub repo metadata,
  tags and changelog.
- Size reporting command or CI summary with ESM and bundled/minified budgets.
- Public demo site built with Mado: docs, CRUD starter and showcase as a live
  proof instead of another README claim.
- Real commercial app test: validate auth, forms, tables, resources, route
  transitions and long-lived sessions outside toy examples.

## Explicitly Out Of Scope For Now

- Runtime dependencies.
- UI kit / component library.
- SSR with hydration.
- Large props API.
- Framework-specific build tool.
- Plugin ecosystem before the core is stable.

## Release History

| Date | Milestone | Notes |
|---|---|---|
| 2026-06-03 | Core stabilization | Parser rewritten as a state machine; keyed `each()` reconciliation; lifecycle-aware `resource()`; router isolation; lazy `computed()`; regression tests added. |
| 2026-06-03 | Documentation foundation | Honest README, routing docs, static bake docs, IDE setup, “Why Mado”, backend mental model and LLM pitfalls. |
| 2026-06-03 | Publish readiness | Package metadata, exports, MIT license, contributing guide, GitHub templates and CI scaffolding. |
| 2026-06-03 | Cloudflare prerender PoC | Edge prerender example for SEO without SSR hydration. |
| 2026-06-03 | AI-ready files | `AGENTS.md`, `llms.txt`, Copilot instructions and LLM-specific pitfalls. |
| 2026-06-03 | v0.3 hardening | Nested template cleanup, stale async route guard, Shadow DOM link/prefetch tests, scroll behavior, `warnOnce`, component reconnect/style tests. |
| 2026-06-05 | v0.4 showcase max | `examples/showcase` became a SaaS CRM pressure app with accounts, deals, activity, nested routes, context services and browser regression. |
| 2026-06-06 | v0.5 project shape | Unified `mado` CLI, dev server logs, docs language skeleton, examples cleanup (`basic`, `tickets`, `showcase`, `cloudflare`). |
| 2026-06-06 | Mado rebrand | Public package/import name `@madojs/mado`, CLI `mado`, brand/docs/examples updated, internal legacy markers cleaned. |
| 2026-06-06 | Public polish | English public surface, localized docs, translated code comments/examples/templates/GitHub files. |
| 2026-06-07 | First npm release | Published `@madojs/mado@0.5.0` with the `mado` CLI, minimal/crud starters, CI and release workflow. |

## Future Ideas

Ideas live in `TODO.md`. They are not commitments until a real app or issue
proves the need.
