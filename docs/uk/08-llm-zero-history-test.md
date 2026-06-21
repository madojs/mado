# LLM Zero-History Test

This document defines a manual validation test: can a fresh LLM write idiomatic
Mado without falling back to React-shaped code?

## Allowed Context

- `AGENTS.md`
- `README.md`
- `docs/uk/07-llm-pitfalls.md` or the English version
- files from the external `madojs-examples` workspace only when the agent asks
  for a larger app pattern

## Task

Build a small ticket-admin SPA:

- routes: `/`, `/tickets`, `/tickets/new`, `/tickets/:id`, `*`;
- in-memory mock API with realistic async delays;
- list page with `resource()`, `queryParam()`, `computed()` and keyed `each()`;
- create/edit flows with `useForm()` + `mutation()` + `invalidates`;
- local UI state with `signal()`.

## Failure Checklist

- JSX, `useState`, `useEffect`, `ref`, `$state`, class-style components;
- `${signal()}` where a reactive child thunk is required;
- `disabled=${...}` instead of `?disabled=${...}`;
- unkeyed `.map()` for dynamic lists;
- `resource()` created outside lifecycle-aware context;
- new runtime dependencies or new public APIs.

The historical tickets implementation lives in the external examples workspace.
The core repository no longer ships that artifact.
