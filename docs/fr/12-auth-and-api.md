# Auth et API

Le starter `admin` contient la recette recommandée :

- `src/lib/api.ts` — un seul client HTTP, `ApiError`, refresh après 401 ;
- `src/lib/auth.ts` — `accessToken`, `restoreSession()`, `login()`,
  `logout()`, `requireAuth`.

Modèle :

- access token en mémoire via `signal`, pas dans `localStorage` ;
- refresh cookie HttpOnly pour restaurer la session ;
- toutes les requêtes passent par le client API ;
- les routes protégées utilisent un group guard.

```ts
export const requireAuth: Guard = async ({ path }) => {
  if (accessToken()) return;
  if (await restoreSession()) return;
  return { redirect: `/login?return=${encodeURIComponent(path)}`, replace: true };
};
```

Dev proxy :

```jsonc
{
  "dev": {
    "proxy": { "/api": "http://localhost:3000" }
  }
}
```

Si ton backend a une autre forme, modifie `api.ts` et `auth.ts`. Les pages ne
doivent pas connaître les détails d'authentification.
