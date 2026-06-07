# Mado showcase max

Flagship pressure-test app for Mado: a small SaaS CRM with public marketing
pages and an authenticated admin area.

The point is not to ship a CRM. The point is to prove that current Mado APIs
compose naturally in a project that looks like real backend-admin work:
routes, nested layout, Web Components, signals, resources, forms, mutations,
context, keyed lists, Shadow DOM links and no runtime dependencies.

## Run

From the repository root:

```bash
npm run build
npm run serve -- showcase
# open http://localhost:5173/
```

Browser regression:

```bash
npm run test:browser
```

The browser regression is intentionally separate from `npm test`; regular CI can
stay lightweight while the full showcase flow remains available.

## Routes

| Route | Purpose |
|---|---|
| `/` | Marketing landing with static `page().head()` metadata |
| `/pricing` | Signals + lazy `computed()` pricing toggle |
| `/blog` / `/blog/:slug` | Resource-backed public content |
| `/app/login` | `useForm()` + `mutation()` + `navigate()` |
| `/app/dashboard` | CRM metrics and recent activity resources |
| `/app/accounts` | Account table with `queryParam()` filters and pagination |
| `/app/accounts/new` | Create flow with form validation and invalidation |
| `/app/accounts/:id` | Master-detail page: contacts, deals, activity, edit form, modal |
| `/app/deals` | Pipeline board/table switch with local `signal()` state |
| `/app/deals/:id` | Deal edit flow with resource + mutation |
| `/app/settings` | Local UI state and context-driven toast service |
| `*` | 404 fallback |

## What It Exercises

- `routes()` + `nested()` for public/auth/app routing.
- `component()` pages with `resource()` created inside setup.
- `queryParam()` for table state that lives in the URL.
- `computed()` for visible MRR, pipeline totals and settings preview.
- `useForm()` for account/deal/login flows.
- `mutation()` + `invalidates` for list/detail/stat refresh.
- `resource.mutate()` for optimistic local account/deal updates.
- `each()` in tables, board columns, activity timelines and options.
- `createContext()` / `provide()` / `inject()` for API and toast services.
- `css`` styles` on components, with `shadow: false` on admin pages that should
  share global table/form utilities.

## Shadow DOM Split

This example intentionally uses Light DOM for app structure and Shadow DOM for
leaf widgets:

- `x-app` and CRM route pages use `{ shadow: false }` so global `.page-head`,
  `.btn`, `.form-grid`, `.metric-grid` and table utilities apply;
- `x-app-layout` keeps Shadow DOM because it owns the sidebar/content shell and
  needs a real `<slot>` for route content projection;
- widgets like `x-stat-card`, `x-status-badge`, `x-modal`, and `x-toast-stack`
  keep Shadow DOM because they own their visuals.

See [`docs/ru/09-shadow-vs-light-dom.md`](../../docs/ru/09-shadow-vs-light-dom.md)
for the mental model and common footguns.

## Structure

```text
examples/showcase/
├── components/      reusable x-* components
├── layouts/         nested app shell
├── lib/             mock API, auth, services, format helpers
├── pages/           route-level pages
├── styles/          global tokens and shared form/button/table utilities
├── main.ts          root provider + router mount
└── routes.ts        route manifest
```

## Regression Coverage

```bash
node --test --test-timeout=10000 test/showcase-smoke.test.mjs
```

The smoke test imports all showcase pages/components, creates the route
manifest, renders navigation through key CRM routes, and exercises API/form/
resource/mutation behavior in linkedom.

```bash
npm run test:browser
```

The browser script starts `mado serve showcase`, logs in, creates an account, creates
a deal through the modal, navigates the pipeline, and asserts old page hosts do
not accumulate.

## Rules This Example Must Keep

- No React/Vue patterns: no JSX, no hook-style local state/effects.
- No new runtime dependencies.
- No public Mado API changes for showcase convenience.
- No route-level inline `<style>`; use `styles: css```.
- Dynamic lists use `each()` with stable keys.
- Boolean attributes use `?disabled` / `?checked`.
