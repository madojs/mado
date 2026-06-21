# Auth and API

Default starter — blessed recipe. HTTP mechanics живут в `src/shared/http/`,
auth state — в `src/modules/auth/`.

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

Flow для business module:

```txt
connector -> resource/mutation -> page
```

Pages не импортируют DTOs и не вызывают `fetch()` напрямую. Connectors не
импортируют Mado reactivity или UI.

## Auth Service

Auth state — ES module singleton:

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

Rule: `shared/http` knows HTTP, connectors know one external system, resources
know cache keys, pages know UI, `*.public.ts` is the cross-module surface.
