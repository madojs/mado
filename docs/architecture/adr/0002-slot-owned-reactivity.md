# ADR 0002 — Slot-owned reactivity and template commit

**Status:** Accepted for 0.14
**Date:** 2026-07-29

## Context

Mado templates already create an effect for every reactive child, attribute
and property slot. Components additionally wrapped their returned renderer in
a second effect, while the router evaluated page handlers inside the effect
that tracks the current path.

That produced three incompatible outcomes for the same signal read:

- a read in a component renderer re-rendered the complete template;
- a read in `page.view()` could accidentally subscribe the router;
- a read in a template slot updated only that slot.

The whole-template paths also exposed a renderer flaw: every update disposed
and rebound every listener, effect and ref. Mado UI's menu controller had to
delay its ref work with a microtask because refs ran before their elements were
connected and before later bindings were applied.

## Decision

Mado has one reactivity boundary: the dynamic slots of a `TemplateResult`.

1. `component(setup)` calls setup once per connection and setup returns a
   `TemplateResult` directly.
2. `page.view()` creates its `TemplateResult` once per committed route.
3. The router tracks its path signal, then evaluates application handlers
   outside the router's reactive tracker.
4. A changing value is expressed as a signal in a slot or as a slot getter:
   `${signal}` or `${() => expression}`.
5. Structural changes are reactive child slots that return a
   `TemplateResult`, node or empty value.
6. Template instances own state per binding. Updating one binding does not
   dispose unrelated bindings.
7. Refs are commit work: they run only after the complete binding pass and
   after insertion into the live container. An unchanged ref is stable until
   its element leaves the template.
8. Binding and commit failures roll back work created by the failed operation.
9. A page lifecycle is an internal owner of its returned `TemplateResult`.
   Reuse transfers that owner transactionally; rollback, replacement and
   unmount release it with the DOM.

## Consequences

The component renderer-function layer is removed:

```ts
component("x-counter", () => {
  const count = signal(0);
  const increment = () => count.update((value) => value + 1);

  return html`<button @click=${increment}>${count}</button>`;
});
```

Code that relied on a whole-template signal read moves that expression into a
slot:

```ts
return html`
  ${() => external()
    ? html`<a target="_blank">Open</a>`
    : html`<a data-link>Open</a>`}
`;
```

The change is intentionally breaking before v1. A permanent overload would
preserve both mental models and make generated code less predictable for
people and AI systems.

Keyboard behavior, focus policies, positioning, dismissal and composite-widget
semantics remain UI-library concerns. The core guarantees only reliable DOM
ownership, slot updates and lifecycle boundaries.
