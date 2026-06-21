# LLM zero-history test

This document defines a practical validation test for Mado.

The question is not "can an LLM generate frontend code?" It can. The question is:
can a fresh LLM write idiomatic Mado without falling back to React-shaped code?

## Allowed context

For the first pass, give the agent only:

- `AGENTS.md`
- `README.md`
- `docs/en/07-llm-pitfalls.md`
- files from the external `madojs-examples` workspace only when the agent asks
  for a larger app pattern

The agent may search targeted APIs in `src/` when blocked, but should not load
the whole framework into context.

## Task

Build a small ticket-admin SPA for a solo/backend developer.

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

The historical tickets implementation lives in the external examples workspace.
The core repository no longer ships that artifact or a dedicated smoke command;
use this document as a manual evaluation script when updating LLM guidance.

The main documentation pressure point remains lifecycle: examples should not
make it look acceptable to create long-lived `resource()` instances accidentally
at module scope or in route code that never cleans up.
