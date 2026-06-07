# Tickets example

> Zero-history LLM validation: can a fresh agent build a small backend-style SPA
> with Mado docs and examples, without drifting into React/Vue patterns?

This example is intentionally ordinary: ticket CRUD, filters in the URL, forms,
cache invalidation, local UI state, and a slotted shell layout.

## What it covers

- `routes()` with `/`, `/tickets`, `/tickets/new`, `/tickets/:id`, and `*`.
- `component()` pages, so `resource()` is created inside component setup.
- `resource()` + `mutation()` + `invalidates` for reads and writes.
- `queryParam()` for search/status filters.
- `computed()` for derived list state.
- `useForm()` for create and edit flows.
- `each()` for keyed ticket rows.
- `signal()` for local UI state such as dense rows and edit mode.
- Slotted Web Components for the shell, metric tiles, and status/priority badges.

## Run

```bash
npm run build
npm run serve -- tickets
# open http://localhost:5173/
```

## Why this exists

The goal is not to be a beautiful demo. The goal is to reveal whether Mado can
be learned from a small set of docs and examples, and whether the resulting code
stays idiomatic:

- no JSX;
- no `useState` / `useEffect`;
- no `disabled=${...}` for boolean attributes;
- no signal reads like `${count()}` in reactive template positions;
- no unkeyed dynamic lists.

## Lessons from the pressure test

- Nested route/page templates must be recursively disposed. If navigation leaves
  old page hosts below the new one, that is a framework regression.
- `data-link` must work through Shadow DOM. Shell/components can keep Shadow DOM
  without giving up SPA navigation or hover prefetch.
- `resource()` belongs inside component setup so invalidation subscriptions and
  abort controllers are cleaned up on disconnect.
- Prefer `styles: css\`\`` on components over inline `<style>` inside page
  templates. Use `shadow: false` deliberately for backend-admin shells that
  should share global layout styles.
