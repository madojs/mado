# LLM zero-history test

This document defines a practical validation test for Mado.

The question is not "can an LLM generate frontend code?" It can. The question is:
can a fresh LLM write idiomatic Mado without falling back to React-shaped code?

## Allowed context

For the first pass, give the agent only:

- `AGENTS.md`
- `README.md`
- `docs/en/07-llm-pitfalls.md`
- `examples/basic/README.md` if a minimal API tour is needed
- specific `examples/showcase/**` files only when the agent asks for a larger app pattern

The agent may search targeted APIs in `src/` when blocked, but should not load
the whole framework into context.

## Task

Build `examples/tickets`: a small ticket-admin SPA for a solo/backend developer.

Required behavior:

- routes: `/`, `/tickets`, `/tickets/new`, `/tickets/:id`, `*`;
- in-memory mock API with realistic async delays;
- list page with `resource()`, `queryParam()` search/status filters, `computed()`,
  and keyed `each()` rows;
- create and edit flows with `useForm()` + `mutation()` + `invalidates`;
- local UI state with `signal()`;
- slotted shell, metric, and badge components for a more realistic admin UI;
- smoke test importing the built example.

## Failure checklist

Look for these after implementation:

- JSX, `useState`, `useEffect`, `ref`, `$state`, or class-style components;
- `${signal()}` or `${signal() + 1}` where a reactive child thunk is required;
- `disabled=${...}` instead of `?disabled=${...}`;
- dynamic lists rendered with unkeyed array mapping instead of `each()`;
- browser ESM imports without `.js`;
- `resource()` created outside component setup;
- new runtime dependencies or new public framework APIs.

## Result notes

The current `examples/tickets` implementation did not require new public APIs or
runtime dependencies.

CI runs `npm run llm:smoke` as a deterministic proxy for this task: it verifies
that `llms.txt` still contains the key guidance, checks the committed
`examples/tickets` artifact against the required Mado API surface and failure
patterns, then builds and runs `test/tickets-smoke.test.mjs`.

The main documentation pressure point remains lifecycle: older examples can make
it look acceptable to create `resource()` directly in `page.view()`. The tickets
example uses page-level wrapper components instead, so resources are registered
inside component setup and clean up with the component.
