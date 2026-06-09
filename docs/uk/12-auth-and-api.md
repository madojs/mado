# Auth та API

Starter `admin` містить рекомендований рецепт:

- `src/lib/api.ts` — один HTTP-клієнт, `ApiError`, refresh після 401;
- `src/lib/auth.ts` — `accessToken`, `restoreSession()`, `login()`,
  `logout()`, `requireAuth`.

Модель:

- access token у пам'яті через `signal`, не в `localStorage`;
- HttpOnly refresh cookie відновлює сесію;
- усі запити проходять через API-клієнт;
- захищені routes використовують group guard.

```ts
export const requireAuth: Guard = async ({ path }) => {
  if (accessToken()) return;
  if (await restoreSession()) return;
  return { redirect: `/login?return=${encodeURIComponent(path)}`, replace: true };
};
```

Dev proxy:

```jsonc
{
  "dev": {
    "proxy": { "/api": "http://localhost:3000" }
  }
}
```

Якщо backend має іншу auth-схему, змінюй `api.ts`/`auth.ts`, а не сторінки.
