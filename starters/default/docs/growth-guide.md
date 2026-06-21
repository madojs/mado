# Growth guide — flat to folders without rewrites

A module's shape doesn't change as it grows. Only the **grouping** does.
Below is the canonical progression.

## Stage 1 — 1 to 5 files. Flat.

```
src/modules/auth/
  auth.types.ts
  auth.routes.ts
  auth.public.ts
  auth.service.ts
  auth.connector.ts
  login.page.ts
  _contracts/
    auth-api.types.ts
```

Don't create empty `pages/`, `api/`, `data/` folders for tidiness. Noise is
worse than slight inconsistency at this size.

## Stage 2 — module gets > 5 files. Group by role.

When you have more than ~5 files of one kind, lift them into a folder. The
file SUFFIX never changes. Imports change once and stay.

```
src/modules/billing/
  billing.types.ts
  billing.routes.ts
  billing.public.ts
  api/
    stripe.connector.ts
    sap.connector.ts
  _contracts/
    stripe.types.ts
    sap.types.ts
  data/
    invoices.resource.ts
    subscriptions.resource.ts
  pages/
    invoices-list.page.ts
    invoice-detail.page.ts
    subscriptions-list.page.ts
  components/
    invoice-status-badge.component.ts
  forms/
    invoice.form.ts
```

Allowed group folders inside a module (no others):

| Folder         | Holds                                                        |
| -------------- | ------------------------------------------------------------ |
| `api/`         | one `*.connector.ts` per external system                     |
| `_contracts/`  | private provider DTOs (one file per `connector`)             |
| `data/`        | `*.resource.ts` files                                        |
| `pages/`       | `*.page.ts` files                                            |
| `components/`  | module-only `*.component.ts` files                           |
| `forms/`       | `*.form.ts` files                                            |
| `_parts/`      | local UI helpers used by exactly one page (not reusable)     |

If you find yourself wanting another grouping (e.g. `helpers/`,
`utils/within-module/`), it's a smell. Either:
- the helper is pure → move to `shared/lib/`
- or it belongs to one page → put it next to that page in `_parts/`.

## Stage 3 — module gets too big. Split.

If `modules/billing/` ends up with >50 files, split by sub-domain:

```
modules/billing/                # rates, taxes, shared invoice domain
modules/billing-invoices/       # everything invoice-specific
modules/billing-subscriptions/  # everything subscription-specific
```

The naming convention is `<parent-domain>-<sub-domain>`. Cross-talk still
goes through `*.public.ts`. ESLint boundaries still apply.

## Cross-cutting concerns

`auth`, `i18n`, `rbac`, `feature-flags`, `telemetry` are **regular modules**.
There is no `platform/` layer. The only thing that makes them special is
that many other modules import from their `*.public.ts`. That's fine.

## What you should never do, no matter the size

- Create an `index.ts` barrel. (ESLint will fail.)
- Reach into another module's `service.ts` or `pages/`. (ESLint will fail.)
- Put a `*.css` file in a module. (Component styles use `css\`...\``.)
- Add a `helpers/` folder. (Smell. Reclassify.)
- Re-export from `*.public.ts` something not meant for outsiders.