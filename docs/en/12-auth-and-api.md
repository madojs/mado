# Auth and API

> Mado has **zero runtime dependencies**, but that does not mean every team
> should reinvent its auth and HTTP boundary. This page is the blessed recipe.
> Copy it into your project, change the URLs and field names to match your
> backend, and stop touching it.

The `admin` starter (`mado init my-app --starter admin`) ships with these
files pre-installed in `src/lib/`:

- `api.ts` — `createApiClient(baseUrl)` + `accessToken` signal + `ApiError`
- `auth.ts` — `restoreSession()`, `login()`, `logout()`, `requireAuth` guard

The complete code is roughly 100 lines. Read it and own it.

## Mental model

- One **API boundary** (`api()`): every fetch in your app goes through it.
- One **memory-only access token** (`accessToken` signal): never in
  `localStorage`. Renewed silently from an HttpOnly refresh cookie when needed.
- One **route guard** (`requireAuth`): plug it into the layout block that
  wraps protected routes. The guard runs before the page is rendered.

That is the entire surface.

## `src/lib/api.ts`

```ts
import { signal } from "@madojs/mado";

export const accessToken = signal<string | null>(null);

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiInit extends Omit<RequestInit, "body"> {
  json?: unknown;
  baseUrl?: string;
}

export function createApiClient(baseUrl: string) {
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const res = await fetch(new URL("/auth/refresh", baseUrl), {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return false;
        const data = (await res.json().catch(() => null)) as
          | { accessToken?: string } | null;
        if (!data?.accessToken) return false;
        accessToken.set(data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  return async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
    const url = new URL(path, init.baseUrl ?? baseUrl);
    const headers = new Headers(init.headers);
    if (init.json !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const token = accessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);

    const res = await fetch(url, {
      ...init,
      headers,
      credentials: init.credentials ?? "include",
      body: init.json !== undefined ? JSON.stringify(init.json) : (init as RequestInit).body,
    });

    if (res.status === 401) {
      if (await refresh()) return api<T>(path, init);
      accessToken.set(null);
      throw new ApiError(401, null, "Unauthorized");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(res.status, body, `HTTP ${res.status} ${res.statusText}`);
    }
    if (res.status === 204) return null as unknown as T;
    return (await res.json()) as T;
  };
}

export const api = createApiClient("/api");
```

Key invariants:

- **Bearer token in memory only.** A page reload destroys it; `restoreSession()`
  brings it back from the refresh cookie.
- **Refresh is single-flight.** Five resources hitting 401 at the same time
  trigger exactly one refresh request.
- **Errors are typed.** Catch `ApiError` for `.status` and `.body`.
- **`credentials: include`** is the default, because the refresh cookie is
  cross-host-safe only with `include`.

## `src/lib/auth.ts`

```ts
import type { Guard } from "@madojs/mado";
import { accessToken, api, ApiError } from "./api.js";

let restorePromise: Promise<boolean> | null = null;

export async function restoreSession(): Promise<boolean> {
  if (accessToken()) return true;
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    try {
      const data = await api<{ accessToken: string }>("/auth/refresh", {
        method: "POST",
      });
      accessToken.set(data.accessToken);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return false;
      return false;
    } finally {
      restorePromise = null;
    }
  })();
  return restorePromise;
}

export const requireAuth: Guard = async ({ path }) => {
  if (accessToken()) return;
  if (await restoreSession()) return;
  return { redirect: `/login?return=${encodeURIComponent(path)}`, replace: true };
};

export async function login(creds: { email: string; password: string }) {
  const data = await api<{ accessToken: string }>("/auth/login", {
    method: "POST",
    json: creds,
  });
  accessToken.set(data.accessToken);
}

export async function logout() {
  try { await api("/auth/logout", { method: "POST" }); } catch {}
  accessToken.set(null);
}
```

Drop `requireAuth` into your manifest:

```ts
"/admin": layout({
  layout:  () => import("./layouts/app.js"),
  guard:   requireAuth,                       // ← entire group is now protected
  routes:  { ... },
}),
```

The guard runs *before* the page is rendered. If the user is not signed in
and the refresh cookie cannot revive the session, they are redirected to
`/login?return=<original>`. After a successful sign-in, the login page reads
`return` and navigates back.

## Backend contract

The recipe assumes three endpoints. Adjust paths to taste:

| Endpoint                | Request                   | Response (200)               | Notes                          |
|-------------------------|---------------------------|------------------------------|--------------------------------|
| `POST /api/auth/login`  | `{ email, password }`     | `{ accessToken }`            | Sets HttpOnly refresh cookie   |
| `POST /api/auth/refresh`| (no body, cookie only)    | `{ accessToken }`            | Reads HttpOnly refresh cookie  |
| `POST /api/auth/logout` | (no body)                 | `204`                        | Clears the refresh cookie      |

If your backend uses a different shape (`{ token }`, `{ access_token, expires_in }`,
etc.), change `api.ts` and `auth.ts` in two places each. The rest of the app
keeps working.

## Dev proxy

In development, point `/api/*` at your backend with `mado.config.json`:

```jsonc
{
  "dev": {
    "port": 5173,
    "proxy": { "/api": "http://localhost:3000" }
  }
}
```

The dev server forwards requests under `/api/*` to your backend, so both the
SPA and the API can be reached from the same origin — no CORS dance during
development.

## When to deviate

- **SPA + cookies only** (no Bearer tokens). Remove the `authorization`
  header and the `refresh()` retry; rely entirely on a session cookie.
- **Public site with optional auth.** Make `restoreSession()` opportunistic
  on startup and skip the `requireAuth` guard.
- **Third-party API tokens** that cannot be refreshed. Drop `refresh()` and
  fail loudly on 401.

Whatever you change, change it **in `api.ts` only**. Pages stay innocent.