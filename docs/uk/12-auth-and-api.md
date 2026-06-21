# Auth and API

The default starter is the blessed recipe. HTTP mechanics live in
`src/shared/http/`, auth state lives in `src/modules/auth/`.

```txt
src/shared/http/
  http-client.ts
  http-error.ts
  interceptors.ts

src/modules/auth/
  auth.connector.ts
  auth.service.ts
  auth.guard.ts
  auth.routes.ts
  auth.public.ts
  _contracts/
```

Business module flow:

```txt
connector -> resource/mutation -> page
```

Pages do not import DTOs and do not call `fetch()` directly. Connectors do not
import Mado reactivity or UI.

## Auth Service

```ts
const _user = signal<User | null>(null);
const _token = signal<string | null>(null);

export const user = () => _user();
export const isAuthed = computed(() => _user() !== null);
```

Expose only what other modules need through `auth.public.ts`.

## Guards

```ts
export function requireAuth(): boolean | string {
  if (isAuthed()) return true;
  return "/login";
}
```

Use in `src/app.routes.ts`:

```ts
"/billing": layout({
  layout: () => import("./layouts/app-shell.layout"),
  guard: requireAuth,
  routes: billingRoutes,
}),
```

## Dev Proxy

```ts
export default defineConfig({
  plugins: [mado()],
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
});
```
