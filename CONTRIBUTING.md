# Contributing to Mado

Thanks for your interest. Mado is intentionally small, and the contribution
rules are stricter than in many projects because the code should remain readable
in one evening.

## Principles

1. **Every line has a cost.** Features add cognitive load for every future
   reader. If a feature can live in user-land, it usually should.
2. **Zero runtime dependencies.** This is a hard rule. `typescript` is the only
   required dev dependency; other tools stay optional.
3. **One file, one responsibility.** If code no longer fits the current module,
   prefer a small new file over a swollen one.
4. **Failing test → implementation → green test.** Bug fixes and features need
   focused tests.
5. **Documentation is first-class.** A PR that changes behavior should update
   README/docs/JSDoc where relevant.

## Welcome Contributions

- Bug fixes with a failing regression test.
- Documentation fixes and recipes (English only — see below).
- Examples with a README and a smoke test.
- Small improvements to existing modules, after discussion when the behavior or
  API surface changes.

## Documentation

Canonical project documentation is maintained in English under
`docs/en/`. Older translations (`docs/fr`, `docs/uk`, `docs/ru`) were
removed at v0.12 and live only in git history and the `v0.11.1` tag.

Pull requests are expected to update `docs/en/` alongside any
behaviour change. The `npm run docs:lint` gate refuses to ship docs
that still use the pre-0.12 vocabulary; if you intentionally need to
mention a removed term (e.g. in a migration note), wrap the block in
`<!-- docs-lint:allow-legacy-mention -->` / `<!-- /docs-lint:allow-legacy-mention -->`.

We do not accept new translation trees at this time.

## Not Accepted

- Large new modules without a prior RFC issue.
- Runtime dependencies in `dependencies` or `peerDependencies`.
- Public API changes without motivation and migration notes.
- Tooling/config churn for its own sake.
- Generic utilities added “just in case”.

## Before Opening A PR

```bash
npm install
npm run typecheck
npm run build
npm test
```

## Discussing Larger Changes

1. Open an issue that describes the pain, not only the proposed solution.
2. Describe 2-3 possible approaches with tradeoffs.
3. Wait for discussion before investing in a large implementation.

## Code Review

- Maintainers may ask to simplify or remove code. That is about keeping the
  project small, not about you.
- Large PRs may take up to a week to review.
- “LGTM” means the approach is acceptable; merge still depends on tests and
  maintainability.

## Code Style

- TypeScript strict, ES2022.
- Public functions need JSDoc.
- Comments should explain why, not restate what the code already says.
- Commit messages should be clear and preferably in English.

## License

By contributing to Mado, you agree that your contribution is licensed under MIT.
