# Architecture — the why in one screen

## The single shape

```
┌──────────────────────────────────────────────────────────────┐
│ src/main.ts → boots auth, renders router into #app           │
└──────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ src/app.routes.ts — one file with the WHOLE app map          │
│   "/billing": layout({ layout, guard, routes: billingRoutes })│
│   "/login":   layout({ layout, routes: authRoutes })         │
│   exports `manifest` so `mado bake` can find pages           │
└──────────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                                   ▼
┌──────────────────────────┐         ┌──────────────────────────┐
│ modules/auth/            │         │ modules/billing/         │
│   auth.public.ts ◄───────┼─────────│   imports from auth.public │
│   auth.service.ts        │         │   pages/, data/, api/    │
│   auth.connector.ts      │         │   _contracts/ (private)  │
│   auth.guard.ts          │         │                          │
│   login.page.ts          │         │                          │
└──────────────────────────┘         └──────────────────────────┘
              ▲                                   ▲
              │           src/layouts/            │
              │   (auth-shell, app-shell, …)     │
              │                                   │
              └───────── shared/  ────────────────┘
                   (ui, lib, http, styles)
```

## Three rules that hold everything together

### 1. A module is a bounded context

Anything in `modules/<x>/` is opaque to the outside world EXCEPT what its
`<x>.public.ts` re-exports. ESLint enforces this. You cannot accidentally
reach into another module's `service.ts` or `pages/`.

### 2. Three layers between network and UI

```
shared/http/http-client.ts        ← interceptors, auth, retries, errors
        ▲
modules/<x>/api/*.connector.ts    ← ONE external system. DTO → domain.
        ▲
modules/<x>/data/*.resource.ts    ← caching, mutations, keys (URL-shaped)
        ▲
modules/<x>/pages/*.page.ts       ← UI consumes domain types only
```

Swap Stripe for a different PSP? Rewrite `stripe.connector.ts`. Pages don't
move. That's the invariant the layering buys you.

### 3. Files have shape

Each file suffix has a canonical 4-section shape (see
[`file-forms.md`](./file-forms.md)). You learn ~10 shapes once and you can
read any file in any module without surprises. LLMs love this because they
need ~30 % of the context they'd need in a free-form React app.

## Layouts and guards: the canonical place

A **layout** is a page-shaped wrapper that owns the chrome of an APP ZONE
(auth, app, marketing, embed). It doesn't know which page is rendered inside
— `child` is anonymous.

Three hard rules:

1. ALL layouts live in `src/layouts/`. There is no module-owned layout.
2. Modules ALWAYS export a plain `routes` map. They never wrap themselves.
3. Composition (shell + guard for each zone) happens ONLY in
   `src/app.routes.ts`, via `layout({...})` blocks.

```ts
"/admin": layout({
  layout: () => import("./layouts/app-shell.layout"),
  guard: requireAuth,
  routes: adminRoutes,
}),
```

Do NOT wrap the router in `main.ts`, do NOT add a custom-element wrapper
around `<RouterOutlet>`. Mado's "shell-below-content" bug lives there.

## What we deliberately don't do

| Not here                         | Because                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `defineModule()` / DI container  | A folder + `*.public.ts` + ESLint is enough                      |
| Decorators                       | Mado doesn't use them and we don't need a class system           |
| A separate `platform/` layer     | `auth` and friends are just modules — they live in `modules/`    |
| Barrel files (`index.ts`)        | Explicit imports help tree-shaking and LLM context               |
| CSS-in-JS, Tailwind, PostCSS     | `tokens.css` + per-component `css\`\`` covers admin apps         |
| Auto-generated route file        | One handwritten `app.routes.ts` = readable app map               |
| `app-map.json` for tooling       | YAGNI. Add it the day a real tool needs it                       |
| Magic side-effects in generators | `mado new` only ever writes new files                            |

## Growth

- 1 module → 5 files flat in `modules/app/`.
- 1 module gets > 5 files → introduce `pages/`, `components/`, `data/`,
  `api/`, `_contracts/`, `forms/`.
- Multiple business areas → multiple modules. Cross-talk via `*.public.ts`.

The suffix of a file never changes when it moves into a folder. That's the
property that lets the codebase grow without a rewrite.

See [`growth-guide.md`](./growth-guide.md).
