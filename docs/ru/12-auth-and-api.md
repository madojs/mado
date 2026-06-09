# Auth and API

Mado не навязывает auth, но starter `admin` дает blessed recipe:

- `src/lib/api.ts` — один HTTP boundary, `ApiError`, refresh-on-401;
- `src/lib/auth.ts` — `accessToken`, `restoreSession()`, `login()`,
  `logout()`, `requireAuth` guard.

Модель:

- access token хранится в памяти через `signal`, не в `localStorage`;
- HttpOnly refresh cookie восстанавливает сессию после reload;
- все запросы идут через один API-клиент;
- protected routes закрываются group guard.

```ts
export const requireAuth: Guard = async ({ path }) => {
  if (accessToken()) return;
  if (await restoreSession()) return;
  return { redirect: `/login?return=${encodeURIComponent(path)}`, replace: true };
};
```

В route manifest:

```ts
"/admin": layout({
  layout: () => import("./layouts/app.js"),
  guard: requireAuth,
  routes: { "/": () => import("./pages/admin/dashboard.js") },
}),
```

Backend contract по умолчанию:

| Endpoint | Response | Notes |
|---|---|---|
| `POST /api/auth/login` | `{ accessToken }` | ставит HttpOnly refresh cookie |
| `POST /api/auth/refresh` | `{ accessToken }` | читает refresh cookie |
| `POST /api/auth/logout` | `204` | очищает cookie |

Для dev proxy:

```jsonc
{
  "dev": {
    "proxy": { "/api": "http://localhost:3000" }
  }
}
```

Если backend использует другую схему auth, меняй только `api.ts`/`auth.ts`.
Страницы должны оставаться невинными.
