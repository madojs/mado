# Copilot instructions for Mado

`AGENTS.md` at the repository root is the authoritative instruction set for
all coding agents. Read it before generating or changing Mado code. Do not
copy its full contents into this file; duplicated rules drift and teach
different tools different framework contracts.

The minimum contract to remember while loading that file:

- Mado is a browser-native frontend framework with zero runtime dependencies.
- Use `html`, Web Components, signals and platform APIs; never generate JSX,
  hooks or framework-style component classes.
- `component(setup)` calls setup once and setup returns one `TemplateResult`
  directly. There is no returned renderer function.
- Reactivity belongs to template slots: `${signal}` or
  `${() => expression}`.
- `page.view()` creates one template per route lifecycle; the router does not
  track incidental signal reads made while the view is created.
- Keep native controls, navigation, validation and browser semantics native.
- Start applications with the small default structure. Add modular layers only
  after real application boundaries appear.
- Treat Mado UI as immediate dogfood that may expose a core contract defect;
  do not hide such defects behind library workarounds. The current experimental
  `site` is intentionally awaiting a rewrite and is not a migration target.

When this summary and `AGENTS.md` differ, `AGENTS.md` wins.
