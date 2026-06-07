---
name: Feature request
about: Suggest an improvement or a new feature
labels: enhancement
---

## Pain

Describe the problem you want to solve. Do not start with the solution.

Example: “When doing N, I currently have to do M, which leads to K.”

## Possible Solutions

List at least two options with tradeoffs. This matters: without alternatives,
it is difficult to decide what belongs in core.

### Option 1: ...

**Pros:** ...
**Cons:** ...

### Option 2: ...

**Pros:** ...
**Cons:** ...

## Can This Live In User-land?

This is the key question. Mado intentionally stays small. If the feature can be
implemented as a wrapper on top of the existing API, it is often better as a
docs recipe than a core feature.

If you believe it cannot, explain why.

## Change Size

- [ ] < 50 lines (small improvement)
- [ ] 50-200 lines (normal feature)
- [ ] > 200 lines (requires RFC + prior discussion)
