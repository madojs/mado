# CLI — `mado new …`

A tiny generator. Creates **one file** per invocation. Never edits anything.

> Why no auto-wiring of routes? Because magic generators rot. You manage two
> things by hand: the file form (covered by the template) and the route
> table (one snippet in `app.routes.ts`, which the generator prints for
> you). Everything else is mechanical.

## Commands

```bash
# New module — scaffolds types/routes/public in modules/<name>/
mado new module billing

# New page
mado new page billing/pages/invoices-list
mado new page auth/login

# New connector (one external API)
mado new connector billing/api/stripe

# New resource (resource + mutation in one file, URL-shaped keys)
mado new resource billing/data/invoices

# New service (singleton state)
mado new service billing/cart

# New form schema
mado new form billing/invoice

# New reusable component (with ctx.attr() boilerplate)
mado new component billing/components/invoice-status-badge

# New route guard
mado new guard billing/billing

# New layout (always under src/layouts/, one per app zone)
mado new layout admin-shell
```

## Path convention

For everything but `module` and `layout`, the path after the kind is
**relative to `src/modules/`** (or to the module folder — both work). The
file suffix is appended automatically:

| Command                                           | Creates                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `new page billing/pages/invoices-list`            | `src/modules/billing/pages/invoices-list.page.ts`                      |
| `new connector billing/api/stripe`                | `src/modules/billing/api/stripe.connector.ts`                          |
| `new resource billing/data/invoices`              | `src/modules/billing/data/invoices.resource.ts`                        |
| `new service billing/cart`                        | `src/modules/billing/cart.service.ts`                                  |
| `new form billing/invoice`                        | `src/modules/billing/invoice.form.ts`                                  |
| `new component billing/components/inv-badge`      | `src/modules/billing/components/inv-badge.component.ts`                |
| `new guard billing/billing`                       | `src/modules/billing/billing.guard.ts`                                 |
| `new layout admin-shell`                          | `src/layouts/admin-shell.layout.ts`                                    |

Note: `layout` ALWAYS goes into `src/layouts/`. There is no module-owned
layout — layouts describe app zones, modules describe domains.

`new module` always creates a single-segment module folder under
`src/modules/<name>/`.

## Safety

The generator refuses to overwrite an existing file. To regenerate, delete
first. This is intentional: regenerating in place would silently destroy
your work.

## After scaffolding

- A new **page**: add it to its module's `*.routes.ts`.
- A new **module**: paste the snippet the generator prints into
  `src/app.routes.ts`. It's a `layout({...})` block with the right shell
  and (optionally) a guard.
- A new **connector**: define its DTOs in `_contracts/`, fill the `MAPPERS`
  section so the connector returns DOMAIN types only.

## Extending

The generator is part of the Mado CLI, not a local starter script. It stays
small on purpose: no config file, no route rewriting, no project scanning.
If your team needs a different shape, write a local script in your app rather
than making the default starter more magical.
