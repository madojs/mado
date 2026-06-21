# Auth and API

The default starter is the blessed recipe. It keeps HTTP mechanics in
`src/shared/http/` and auth state in `src/modules/auth/`.

## Shape

```txt
src/shared/http/
  http-client.ts       # one fetch wrapper + query/body/error handling
  http-error.ts        # one error shape
  interceptors.ts      # request/response hooks

src/modules/auth/
  auth.connector.ts    # /api/auth wire contract, DTO -> domain
  auth.service.ts      # token/user signals + login/logout/init
  auth.guard.ts        # requireAuth(), requirePermission()
  auth.routes.ts       # login route map
  auth.public.ts       # only public auth surface
  _contracts/          # backend DTOs, private to connector
```

Every business module follows the same flow:

```txt
connector -> resource/mutation -> page
```

Pages do not import DTOs. Pages do not call `fetch()` directly. Connectors do
not import Mado reactivity or UI.

## HTTP Client

Use one small HTTP client for the app. It owns:

- base URL handling;
- JSON request/response defaults;
- query string serialization;
- `HttpError`;
- request/response interceptors.

Module connectors build on it:

```ts
import { httpClient } from "../../shared/http/http-client";
import type { User } from "./auth.types";
import type { LoginResponseDTO } from "./_contracts/auth-api.types";

const toUser = (dto: LoginResponseDTO["user"]): User => ({
  id: dto.id,
  email: dto.email,
  roles: dto.roles,
  permissions: dto.permissions,
});

export const authApi = {
  me: async () => toUser(await httpClient.get<LoginResponseDTO["user"]>("/api/auth/me")),
};
```

## Auth Service

Auth state is an ES module singleton:

```ts
const _user = signal<User | null>(null);
const _token = signal<string | null>(null);

export const user = () => _user();
export const isAuthed = computed(() => _user() !== null);

export async function login(creds: Credentials): Promise<void> {
  const res = await authApi.login(creds);
  _token.set(res.token);
  _user.set(res.user);
}
```

Expose only what other modules need through `auth.public.ts`.

## Guards

Guards are plain functions:

```ts
export function requireAuth(): boolean | string {
  if (isAuthed()) return true;
  return "/login";
}
```

Use them in `src/app.routes.ts`:

```ts
"/billing": layout({
  layout: () => import("./layouts/app-shell.layout"),
  guard: requireAuth,
  routes: billingRoutes,
}),
```

## Dev Proxy

Configure proxying in `vite.config.ts`:

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

## Rule of Thumb

- `shared/http` knows HTTP.
- `*.connector.ts` knows one external system.
- `*.resource.ts` knows cache keys and invalidation.
- `*.page.ts` knows UI.
- `*.public.ts` is the only cross-module surface.
