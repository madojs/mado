# Mado maturity roadmap

Mado is not on a date-driven path to v1. The framework stays pre-1.0 while
dogfooding can still reveal a simpler public contract. Breaking a young
contract is cheaper than preserving accidental complexity forever.

The invariant is product-shaped, not version-shaped:

- browser APIs remain the platform;
- Mado adds one predictable composition and reactivity model;
- Mado ships with zero third-party runtime dependencies;
- frontend concerns stay in scope; Mado does not grow into a backend or a
  universal application server;
- features earn permanence through real applications, the Mado site and Mado
  UI rather than through roadmap pressure.

## Current phase: contract simplification

1. Make templates transactional and update bindings independently.
2. Give `ref()` a real post-bind, post-connect commit contract.
3. Make pages and components use the same slot-owned reactivity model.
4. Remove compatibility paths, documentation and examples that describe
   superseded models.
5. Dogfood every change in the framework starters and Mado UI, then validate
   the settled contract in the rewritten Mado site.

## Product-surface review

Every bundled feature remains open to removal or consolidation before v1.
This includes starters, generators, advanced lifecycle exports and static
tooling. A feature stays only when it makes a common frontend task materially
clearer without creating a second way to do the same thing.

The modular starter is therefore a reference experiment, not a permanent
product promise. It must prove that it reduces maintenance for a real
long-lived frontend; otherwise its useful conventions should become
documentation and the extra starter should disappear.

## Readiness criteria

A stable release becomes reasonable only after:

1. the public contract survives sustained use in both the Mado site and Mado
   UI without framework workarounds;
2. no P0/P1 contract defects or known lifecycle leaks remain;
3. the API and starter surface stays unchanged through at least one release
   candidate and an external application;
4. Node, browser, static capture and package-smoke matrices are green;
5. documentation and examples describe exactly the behavior implemented by
   the runtime.

Bundle size continues to be measured, but it is not a hard gate during
contract work. A budget can return after the architecture settles and a
representative application establishes an honest baseline.
