# File forms — canonical shapes

> Open any file. The suffix tells you which shape to expect. The shape never
> changes. Once you've learned these eight, you've learned how to read every
> file in this app.
>
> All snippets use the real Mado API (`page()`, `signal()`, `html`,
> `component({attr})`, `each`, `resource`, `mutation`, `useForm`,
> `layout`, `routes`). No React-style invented APIs.

## `*.page.ts` — route component

```ts
import { html, page, signal } from "@madojs/mado";
import { useUsers } from "./data/users.resource";

export default page({
  title: "Users",
  view: () => {
    // 1. LOCAL STATE       per-view signals
    const search = signal("");

    // 2. DATA              resources from this module's data/
    const users = useUsers(search);

    // 3. ACTIONS           event handlers, mutations
    const onInput = (e: Event) => search.set((e.target as HTMLInputElement).value);

    // 4. VIEW
    return html`
      <input .value=${search} @input=${onInput} />
      <ul>${() =>
        each(users.data() ?? [], u => u.id, u => html`<li>${u.name}</li>`)}</ul>
    `;
  },
});
```

For pages with URL params:

```ts
export default page({
  title: "User",
  view: ({ params }) => {
    const user = useUser(() => params.id);
    return html`<h1>${() => user.data()?.name}</h1>`;
  },
});
```

Rules:
- Put page-local signals, resources and form state inside `view()`.
- The 4 commented section headers are mandatory inside `view()`, even when empty.
- Default export is always `page({...})`.
- Reactive children = getter functions: `${() => count() * 2}`.
- Lists use `each(items, keyFn, renderFn)`, never `.map(...)`.

## `*.connector.ts` — ONE external API system

```ts
import { httpClient } from "../../../shared/http/http-client";
import { HttpError } from "../../../shared/http/http-error";
import type { UserDTO } from "../_contracts/users-api.types";
import type { User } from "../users.types";

// 1. CONFIG
const base = "/api/users";

// 2. MAPPERS           DTO → domain. pure, no side-effects.
const toUser = (dto: UserDTO): User => ({ id: dto.id, name: dto.full_name });

// 3. ENDPOINTS         export the xxxApi object. returns DOMAIN types only.
export const usersApi = {
  list: () => httpClient.get<UserDTO[]>(base).then(rs => rs.map(toUser)),
};

// 4. ERRORS            provider-specific subclasses of HttpError
export class UsersApiError extends HttpError {}
```

Forbidden imports here: `signal`, `resource`, `mutation`, `html`,
`component`, `page`. Connectors are about the wire, not the app.

## `*.resource.ts` — caching layer

```ts
import { mutation, resource } from "@madojs/mado";
import { usersApi } from "../api/users.connector";

export const useUsers = () =>
  resource(() => "/api/users", () => usersApi.list(), { staleTime: 30_000 });

export const saveUser = mutation(usersApi.save, {
  invalidates: ["/api/users*"],
});
```

- Keys are URL-shaped so glob `invalidates` work naturally.
- Read with `r.data()`, `r.loading()`, `r.error()`. Refetch via
  `r.refresh()`. Run mutations via `m.run(input)`.
- Resources and mutations must not import UI or services.

## `*.service.ts` — module-singleton state

```ts
import { computed, signal } from "@madojs/mado";

// 1. PRIVATE STATE     never exported
const _user = signal<User | null>(null);

// 2. PUBLIC READS      getters / computed (signal is a function: _user())
export const user = () => _user();
export const isAuthed = computed(() => _user() !== null);

// 3. ACTIONS           the only way to mutate state
export async function login(creds: Credentials) {
  const u = await authApi.login(creds);
  _user.set(u);             // ✅ NOT _user.value = u
}

// 4. INIT?             optional. called once from main.ts
export async function init() { ... }
```

The ES module IS the singleton. No DI container, no provider tokens. Signals
are getter functions: `_user()` reads, `_user.set(v)` / `_user.update(fn)`
writes.

## `*.guard.ts` — route guard

```ts
import { isAuthed, hasPermission } from "./auth.service";

export function requireAuth(): boolean | string {
  if (!isAuthed()) return "/login";   // string = redirect
  return true;                         // boolean true = allow
}
```

Wired in `src/app.routes.ts` as `layout({ guard: requireAuth, ... })`.

## `*.form.ts` — schema factory

```ts
import { useForm } from "@madojs/mado";

// Call inside a view: const form = useInvoiceForm();
export const useInvoiceForm = () =>
  useForm({
    email: { required: true, type: "email" },
    amount: { type: "number", min: 0 },
  });
```

`useForm` is per-render — call it INSIDE `view: () => { ... }`.

## `*.routes.ts` — module-internal routes

```ts
export const billingRoutes = {
  "/invoices":      () => import("./pages/invoices-list.page"),
  "/invoices/:id":  () => import("./pages/invoice-detail.page"),
};
```

- Path prefix is applied in `src/app.routes.ts` via `layout({...})`.
- Pages MUST be lazy-imported (one chunk per module).

## `*.public.ts` — module gateway

```ts
export { useInvoice, useInvoices } from "./data/invoices.resource";
export type { Invoice, InvoiceId } from "./billing.types";
```

- ONLY re-exports from its own module.
- NEVER `export *`. (ESLint forbids it.)
- THE only file other modules may import from.

## `*.component.ts` — reusable web component

```ts
import { component, css, html } from "@madojs/mado";

component(
  "x-badge",
  ({ attr }) => {
    const variant = attr("variant", "default"); // Signal<string>, reactive
    return () => html`
      <span class=${() => `badge badge--${variant()}`}>
        <slot></slot>
      </span>
    `;
  },
  { styles: css`:host { display: inline-block; }` },
);
```

- One side effect: the `component(...)` registration.
- Reactive attributes via `ctx.attr(name, default?)` — no
  `observedAttributes`, no `MutationObserver`.
- Pure UI: no services, no resources, no business types.
- Components are registered by importing their file as a side effect:
  `import "./components/invoice-status-badge.component";`

## `*.layout.ts` — app zone wrapper

```ts
import { html, page } from "@madojs/mado";

export default page({
  title: "App",
  view: ({ child }) => html`
    <div class="layout">
      <header>...</header>
      <main>${child}</main>
    </div>
  `,
});
```

- A layout IS a page whose view receives `child`.
- It does NOT know what page is rendered inside — `child` is anonymous.
- It MAY read public surfaces of cross-cutting modules (e.g. `auth.public`
  for nav state).
- It MUST NOT keep per-route state in view locals.

**A layout describes an APP ZONE, not a domain.** Zones are things like
"auth" (login/forgot/reset), "app" (authenticated dashboard), "marketing"
(public pages), "embed" (chrome-less widgets). Multiple modules can share
one zone.

### Where the file lives

Always `src/layouts/<name>.layout.ts`. There is no module-owned layout.
Composition (which shell wraps which module) is a decision made in
`src/app.routes.ts`:

```ts
// src/app.routes.ts
"/login":   layout({ layout: () => import("./layouts/auth-shell.layout"), routes: authRoutes }),
"/forgot":  layout({ layout: () => import("./layouts/auth-shell.layout"), routes: passwordResetRoutes }), // same zone
"/billing": layout({ layout: () => import("./layouts/app-shell.layout"), guard: requireAuth, routes: billingRoutes }),
```

## `*.types.ts` — pure types

```ts
export interface Invoice { id: string; ... }
export type InvoiceStatus = "draft" | "pending" | "paid" | "void";
```

- ONLY `export type` and `export interface`. No runtime values.
