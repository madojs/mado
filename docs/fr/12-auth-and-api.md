# Auth et API

Le starter par défaut est la recette recommandée. La mécanique HTTP vit dans
`src/shared/http/`, l'état auth dans `src/modules/auth/`.

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

Flow pour un business module :

```txt
connector -> resource/mutation -> page
```

Les pages n'importent pas de DTOs et n'appellent pas `fetch()` directement. Les
connectors n'importent pas la réactivité Mado ou l'UI.

## Auth Service

Auth state est un ES module singleton :

```ts
const _user = signal<User | null>(null);
const _token = signal<string | null>(null);

export const user = () => _user();
export const isAuthed = computed(() => _user() !== null);
```

Exposez seulement la surface nécessaire via `auth.public.ts`.

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

Rule: `shared/http` connaît HTTP, connectors connaissent un système externe,
resources connaissent les cache keys, pages connaissent l'UI, `*.public.ts` est
la surface cross-module.
