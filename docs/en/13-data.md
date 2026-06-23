# Data

> `resource()` reads, `mutation()` writes, `jsonFetcher()` shapes
> the wire. Backends, auth and modules all sit on top of this layer.

Mado does not ship a generic HTTP client because the browser already
has one. Instead it ships two small primitives that wrap `fetch()`
into a cache + lifecycle:

- `resource()` — keyed cache, loading / error / data signals, glob
  invalidation, automatic cleanup.
- `mutation()` — async action runner with the same loading / error /
  data signals, plus declarative invalidation of related resources.

A third helper, `jsonFetcher()`, is the default body parser: parses
JSON, throws `HttpError` on `!ok`.

## `resource()`

```ts
import { resource, jsonFetcher } from "@madojs/mado";

const userId = signal(1);

const user = resource(
  () => `/api/users/${userId()}`,   // key (reactive — recomputed on change)
  jsonFetcher<User>(),               // how to load
  { staleTime: 60_000 },             // cache age
);

user.data();    // User | undefined
user.error();   // Error | null
user.loading(); // boolean

await user.refresh();
user.mutate((u) => (u ? { ...u, name: "patched" } : u));
```

Rules:

- The key is the cache identity. Same key → shared cache and shared
  in-flight request, even across components.
- Distinct data needs distinct keys. Encode query params, auth scope
  and tenant in the key string itself.
- `staleTime` is "how long after a successful fetch the cached value
  is reused without a re-fetch". `0` means "always re-fetch on
  remount".
- `resource()` inside a `component()` / `page()` cleans itself up
  when the host leaves the DOM.

## `mutation()`

```ts
import { mutation } from "@madojs/mado";

const save = mutation<User, User>(
  (u) =>
    fetch("/api/users", {
      method: "POST",
      body: JSON.stringify(u),
    }).then((r) => r.json()),
  { invalidates: ["/api/users*"] },
);

await save.run(newUser);   // throws on failure
save.loading();            // true while ANY run is in flight
save.error();              // last failure
save.data();               // last success
```

- `run()` is concurrent by default. `loading()` stays true while any
  run is in flight. Use `{ abortPrevious: true }` for
  search-as-you-type ("latest request wins").
- `invalidates` runs after a successful mutation and is best-effort:
  invalidation failures are logged but do not turn the mutation
  itself into a failure.
- `invalidates` may also be a function of `(result, args)` for
  dynamic keys.

## `jsonFetcher()` and `HttpError`

```ts
import { jsonFetcher, HttpError, resource } from "@madojs/mado";

const me = resource(() => "/api/auth/me", jsonFetcher<User>());

try {
  await me.refresh();
} catch (err) {
  if (err instanceof HttpError && err.status === 401) {
    navigate("/login");
  } else throw err;
}
```

`HttpError` carries `status`, `url` and the parsed body (JSON when
possible, raw text otherwise). Use it for typed handling in pages
and guards.

## Modular shape — connector → resource → page

The modular starter encodes one rule per layer; every business
module follows the same flow:

```
connector  →  resource / mutation  →  page
```

```
src/shared/http/
  http-client.ts        # one fetch wrapper + query/body/error handling
  http-error.ts         # HttpError type
  interceptors.ts       # request/response hooks (auth header, retry, …)

src/modules/<name>/
  <name>.connector.ts   # external API contract, DTO -> domain
  <name>.resource.ts    # resource()/mutation() with cache keys
  <name>.types.ts       # domain types
  pages/                # page()s — UI only
  _contracts/           # backend DTO shapes, private to the connector
```

Hard rules:

- Pages **never** import DTOs and **never** call `fetch()`.
- Connectors **never** import signals, resources, html, components,
  pages or services.
- Public surface of a module is `<name>.public.ts`. Anything not
  re-exported there is private.

The universal starter does not insist on this layering — for a small
app a single `src/lib/api.ts` is enough. Use the modular shape when
the app grows enough that "which file owns this fetch?" becomes a
real question.

## Auth — service + guard

Auth state is an ES-module singleton built from the same primitives:

```ts
// src/modules/auth/auth.service.ts
import { computed, signal } from "@madojs/mado";
import { authApi } from "./auth.connector";
import type { Credentials, User } from "./auth.types";

const _user  = signal<User | null>(null);
const _token = signal<string | null>(null);

export const user      = (): User | null => _user();
export const isAuthed  = computed(() => _user() !== null);

export async function login(creds: Credentials): Promise<void> {
  const res = await authApi.login(creds);
  _token.set(res.token);
  _user.set(res.user);
}

export async function logout(): Promise<void> {
  try { await authApi.logout(); } catch { /* best effort */ }
  _token.set(null);
  _user.set(null);
}
```

Expose only what other modules need through `auth.public.ts`.

The guard is a plain function returning `true | false | string`:

```ts
// src/modules/auth/auth.guard.ts
import { isAuthed } from "./auth.service";

export function requireAuth(): boolean | string {
  return isAuthed() ? true : "/login";
}
```

Mount it in `src/app.routes.ts`:

```ts
"/billing": layout({
  layout: () => import("./layouts/app-shell.layout"),
  guard:  requireAuth,
  routes: billingRoutes,
}),
```

Full guard contract: [12-routing.md](./12-routing.md#guards).

## Dev proxy

Configure backend proxying in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { mado } from "@madojs/mado/vite";

export default defineConfig({
  plugins: [mado()],
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

The modular starter ships a dev-only in-memory mock for `/api/auth/*`
and `/api/billing/*` (`MADO_MOCK_API=0` to disable). Remove it once
your real backend is wired.

## Rule of thumb

- `shared/http` knows HTTP.
- `*.connector.ts` knows one external system and one DTO shape.
- `*.resource.ts` knows cache keys and invalidation.
- `*.page.ts` knows UI.
- `*.public.ts` is the only cross-module surface.

## Further reading

- [12-routing.md](./12-routing.md) — guards, layouts, `routeUrl`.
- [14-forms.md](./14-forms.md) — `useForm()`, then `mutation().run()`.
- [21-error-handling.md](./21-error-handling.md) — route / data /
  action error boundaries.
- [16-app-architecture.md](./16-app-architecture.md) — the modular
  starter shape end-to-end.