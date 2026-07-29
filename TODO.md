# Evidence backlog

This is not a release schedule. The current decision process lives in the
[maturity roadmap](./docs/architecture/maturity-roadmap.md): features remain
candidates until real frontend use proves that they simplify Mado.

- Dogfood 0.14 in Mado UI and in the rewritten Mado site.
- Decide whether the modular starter earns its maintenance cost in a real
  long-lived application; otherwise keep only its useful conventions in docs.
- Browser extension backed by the existing versioned devtools hook.
- Typed navigation inferred from route patterns.
- Incremental static snapshot cache after a real large site needs it.
- Mutation rollback helper after repeated application-level demand.
- Accessibility helpers: focus trap, live region and click-outside.
- Optional live resources over SSE/WebSocket.
- Benchmark Mado against Lit, Solid and Preact with published methodology.
- Improve generated release notes with PR links and authors.
